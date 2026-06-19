import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { boq_items, boq_item_sources, price_list_items } from '../db/schema/boq';
import { products, product_attributes } from '../db/schema/products';
import { categories } from '../db/schema/categories';
import { project_spec_requirements } from '../db/schema/spec';
import { projects } from '../db/schema/projects';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { suggestCandidates } from '../lib/boq/candidate-service';

// ─── Validation ────────────────────────────────────────────────────────────

const createBoqItemSchema = z.object({
  description: z.string().min(1).max(500),
  category_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().max(20).default('pcs'),
  spec_document_id: z.string().uuid().nullable().optional(),
  required_spec_profile: z.array(z.object({
    attribute_key: z.string(),
    attribute_label: z.string(),
    operator: z.string(),
    target_value: z.string(),
    target_unit: z.string().nullable().optional(),
    priority: z.enum(['mandatory', 'preferred', 'optional']),
  })).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
  source_type: z.enum(['spec_document', 'drawing', 'dialux', 'pdf', 'manual']).optional().default('manual'),
  source_reference: z.string().max(500).nullable().optional(),
});

const updateBoqItemSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  category_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(20).optional(),
  spec_document_id: z.string().uuid().nullable().optional(),
  required_spec_profile: z.any().optional(),
  product_id: z.string().uuid().nullable().optional(),
  pricing_source: z.enum(['none', 'price_list', 'manual']).optional(),
  price_list_id: z.string().uuid().nullable().optional(),
  unit_price: z.number().nonnegative().nullable().optional(),
  currency: z.string().max(10).optional(),
  status: z.enum(['draft', 'reviewed', 'locked']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

async function assertBoqItemAccess(itemId: string, orgId: string) {
  const [item] = await db.select().from(boq_items).where(eq(boq_items.id, itemId)).limit(1);
  if (!item) throw new AppError(404, 'BOQ item not found');
  await assertProjectAccess(item.project_id, orgId);
  return item;
}

async function enrichBoqItem(item: typeof boq_items.$inferSelect) {
  const [cat] = item.category_id
    ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, item.category_id)).limit(1)
    : [null];

  const [product] = item.product_id
    ? await db
        .select({ id: products.id, manufacturer: products.manufacturer, model_number: products.model_number, family_name: products.family_name })
        .from(products)
        .where(eq(products.id, item.product_id))
        .limit(1)
    : [null];

  const sources = await db
    .select()
    .from(boq_item_sources)
    .where(eq(boq_item_sources.boq_item_id, item.id));

  return {
    ...item,
    category_name: cat?.name ?? null,
    selected_product: product ?? null,
    sources,
  };
}

// ─── Nested router: /projects/:projectId/boq ──────────────────────────────

export const boqProjectRouter = Router();
boqProjectRouter.use(authenticate);

// GET /projects/:projectId/boq
boqProjectRouter.get('/:projectId/boq', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const items = await db
      .select()
      .from(boq_items)
      .where(eq(boq_items.project_id, req.params.projectId))
      .orderBy(asc(boq_items.sort_order), asc(boq_items.created_at));
    const enriched = await Promise.all(items.map(enrichBoqItem));
    return success(res, enriched);
  } catch (err) {
    return next(err);
  }
});

// POST /projects/:projectId/boq
boqProjectRouter.post('/:projectId/boq', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const body = createBoqItemSchema.parse(req.body);
    const { source_type, source_reference, ...itemFields } = body;

    // Auto-populate spec profile from linked spec document
    let specProfile = itemFields.required_spec_profile ?? null;
    if (itemFields.spec_document_id && (!specProfile || specProfile.length === 0)) {
      const reqs = await db
        .select()
        .from(project_spec_requirements)
        .where(eq(project_spec_requirements.spec_document_id, itemFields.spec_document_id));
      specProfile = reqs.map((r) => ({
        attribute_key: r.attribute_key,
        attribute_label: r.attribute_label,
        operator: r.operator,
        target_value: r.target_value,
        target_unit: r.target_unit,
        priority: r.priority,
      }));
    }

    const [item] = await db
      .insert(boq_items)
      .values({
        ...itemFields,
        required_spec_profile: specProfile as any,
        project_id: req.params.projectId,
        created_by: req.user!.userId,
      })
      .returning();

    // Record source
    await db.insert(boq_item_sources).values({
      boq_item_id: item.id,
      source_type: source_type ?? 'manual',
      source_reference: source_reference ?? null,
    });

    return success(res, await enrichBoqItem(item), 201);
  } catch (err) {
    return next(err);
  }
});

// ─── Standalone router: /boq-items/:id ────────────────────────────────────

export const boqItemRouter = Router();
boqItemRouter.use(authenticate);

// GET /boq-items/:id
boqItemRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const item = await assertBoqItemAccess(req.params.id, orgId);
    return success(res, await enrichBoqItem(item));
  } catch (err) {
    return next(err);
  }
});

// PATCH /boq-items/:id
boqItemRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertBoqItemAccess(req.params.id, orgId);
    const body = updateBoqItemSchema.parse(req.body);

    // Recompute total_price if quantity or unit_price changed
    const current = await db
      .select({ quantity: boq_items.quantity, unit_price: boq_items.unit_price })
      .from(boq_items)
      .where(eq(boq_items.id, req.params.id))
      .limit(1)
      .then((r) => r[0]);

    const qty = body.quantity ?? current?.quantity ?? 1;
    const price = body.unit_price !== undefined ? body.unit_price : current?.unit_price;
    const total_price = price != null ? qty * price : null;

    const [updated] = await db
      .update(boq_items)
      .set({ ...body, total_price: total_price ?? undefined, updated_at: new Date() })
      .where(eq(boq_items.id, req.params.id))
      .returning();

    return success(res, await enrichBoqItem(updated));
  } catch (err) {
    return next(err);
  }
});

// DELETE /boq-items/:id
boqItemRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertBoqItemAccess(req.params.id, orgId);
    await db.delete(boq_items).where(eq(boq_items.id, req.params.id));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

// POST /boq-items/:id/suggest-candidates
boqItemRouter.post('/:id/suggest-candidates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const item = await assertBoqItemAccess(req.params.id, orgId);

    // Load spec requirements if spec_document_id is set
    let specRequirements;
    if (item.spec_document_id) {
      specRequirements = await db
        .select()
        .from(project_spec_requirements)
        .where(eq(project_spec_requirements.spec_document_id, item.spec_document_id));
    }

    const candidates = await suggestCandidates({
      projectId: item.project_id,
      orgId,
      specRequirements,
      specProfile: item.required_spec_profile as any ?? undefined,
    });

    // Persist candidates on the item
    const topScore = candidates[0]?.compliance_score ?? null;
    const [updated] = await db
      .update(boq_items)
      .set({ candidate_product_ids: candidates as any, compliance_score: topScore, updated_at: new Date() })
      .where(eq(boq_items.id, req.params.id))
      .returning();

    return success(res, { candidates, item: await enrichBoqItem(updated) });
  } catch (err) {
    return next(err);
  }
});

// POST /boq-items/:id/assign-product
boqItemRouter.post('/:id/assign-product', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const item = await assertBoqItemAccess(req.params.id, orgId);

    const { product_id, price_list_id } = z.object({
      product_id: z.string().uuid().nullable(),
      price_list_id: z.string().uuid().nullable().optional(),
    }).parse(req.body);

    // Attempt auto-pricing from price list
    let unit_price: number | null = null;
    let pricing_source: 'none' | 'price_list' | 'manual' = 'none';
    let matched_price_list_id: string | null = null;

    if (product_id) {
      const [product] = await db
        .select({ model_number: products.model_number })
        .from(products)
        .where(eq(products.id, product_id))
        .limit(1);

      const listId = price_list_id ?? item.price_list_id;
      if (listId && product?.model_number) {
        // Case-insensitive substring match
        const priceItems = await db
          .select()
          .from(price_list_items)
          .where(eq(price_list_items.price_list_id, listId));

        const match = priceItems.find((pi) =>
          pi.model_code.toLowerCase().includes(product.model_number!.toLowerCase()) ||
          product.model_number!.toLowerCase().includes(pi.model_code.toLowerCase()),
        );

        if (match) {
          unit_price = match.unit_price;
          pricing_source = 'price_list';
          matched_price_list_id = listId;
        }
      }
    }

    const total_price = unit_price != null ? item.quantity * unit_price : item.total_price ?? null;

    const [updated] = await db
      .update(boq_items)
      .set({
        product_id,
        unit_price: unit_price ?? item.unit_price ?? undefined,
        total_price: total_price ?? undefined,
        pricing_source: unit_price != null ? pricing_source : item.pricing_source,
        price_list_id: matched_price_list_id ?? item.price_list_id ?? undefined,
        updated_at: new Date(),
      })
      .where(eq(boq_items.id, req.params.id))
      .returning();

    return success(res, await enrichBoqItem(updated));
  } catch (err) {
    return next(err);
  }
});
