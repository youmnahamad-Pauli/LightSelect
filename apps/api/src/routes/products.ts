import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { products, product_attributes } from '../db/schema/products';
import { project_files } from '../db/schema/project-files';
import { projects } from '../db/schema/projects';
import { categories } from '../db/schema/categories';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

// ─── Validation schemas ────────────────────────────────────────────────────

const createProductSchema = z.object({
  manufacturer: z.string().max(200).nullable().optional(),
  family_name: z.string().max(200).nullable().optional(),
  model_number: z.string().max(200).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  source_type: z.enum(['pdf_extract', 'manual', 'import']).optional().default('manual'),
  status: z.enum(['draft', 'reviewed', 'approved']).optional().default('draft'),
});

const updateProductSchema = createProductSchema.partial().extend({
  is_preferred: z.boolean().optional(),
  is_do_not_use: z.boolean().optional(),
  workspace_note: z.string().max(500).nullable().optional(),
});

const attributeItemSchema = z.object({
  attribute_name: z.string().min(1).max(100),
  attribute_value: z.string().max(2000).nullable().optional(),
  value_source: z.enum(['extracted', 'manual', 'na']).optional().default('manual'),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
});

const batchAttributeSchema = z.object({
  attributes: z.array(attributeItemSchema).min(1),
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

async function assertProductAccess(productId: string, orgId: string) {
  const [row] = await db
    .select({
      id: products.id,
      project_id: products.project_id,
      organization_id: projects.organization_id,
    })
    .from(products)
    .innerJoin(projects, eq(products.project_id, projects.id))
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) throw new AppError(404, 'Product not found');
  if (row.organization_id !== orgId) throw new AppError(404, 'Product not found');
  return row;
}

async function getProductWithDetails(productId: string) {
  const [product] = await db
    .select({
      id: products.id,
      project_id: products.project_id,
      category_id: products.category_id,
      category_name: categories.name,
      manufacturer: products.manufacturer,
      family_name: products.family_name,
      model_number: products.model_number,
      source_type: products.source_type,
      status: products.status,
      is_preferred: products.is_preferred,
      is_do_not_use: products.is_do_not_use,
      workspace_note: products.workspace_note,
      created_by: products.created_by,
      created_at: products.created_at,
      updated_at: products.updated_at,
    })
    .from(products)
    .leftJoin(categories, eq(products.category_id, categories.id))
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) return null;

  const attrs = await db
    .select()
    .from(product_attributes)
    .where(eq(product_attributes.product_id, productId))
    .orderBy(asc(product_attributes.attribute_name));

  const linkedFiles = await db
    .select({
      id: project_files.id,
      file_id: project_files.file_id,
      scope: project_files.scope,
      required_status: project_files.required_status,
      notes: project_files.notes,
    })
    .from(project_files)
    .where(and(eq(project_files.product_id, productId), eq(project_files.is_active, true)));

  return { ...product, attributes: attrs, linked_files: linkedFiles };
}

// ─── Nested router: /projects/:projectId/products ─────────────────────────

export const productsNestedRouter = Router();
productsNestedRouter.use(authenticate);

// GET /projects/:projectId/products
productsNestedRouter.get('/:projectId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);

    const rows = await db
      .select({
        id: products.id,
        project_id: products.project_id,
        category_id: products.category_id,
        category_name: categories.name,
        manufacturer: products.manufacturer,
        family_name: products.family_name,
        model_number: products.model_number,
        source_type: products.source_type,
        status: products.status,
        is_preferred: products.is_preferred,
        is_do_not_use: products.is_do_not_use,
        workspace_note: products.workspace_note,
        created_at: products.created_at,
        updated_at: products.updated_at,
      })
      .from(products)
      .leftJoin(categories, eq(products.category_id, categories.id))
      .where(eq(products.project_id, req.params.projectId))
      .orderBy(asc(products.created_at));

    // Attach attribute count for completeness display
    const withCounts = await Promise.all(
      rows.map(async (p) => {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(product_attributes)
          .where(
            and(
              eq(product_attributes.product_id, p.id),
              sql`${product_attributes.attribute_value} is not null and ${product_attributes.attribute_value} != ''`,
            ),
          );
        return { ...p, filled_attribute_count: n };
      }),
    );

    return success(res, withCounts);
  } catch (err) {
    return next(err);
  }
});

// POST /projects/:projectId/products
productsNestedRouter.post('/:projectId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const body = createProductSchema.parse(req.body);

    const [product] = await db
      .insert(products)
      .values({ ...body, project_id: req.params.projectId, created_by: req.user!.userId })
      .returning();

    const detail = await getProductWithDetails(product.id);
    return success(res, detail, 201);
  } catch (err) {
    return next(err);
  }
});

// ─── Standalone router: /products/:productId ──────────────────────────────

export const productRouter = Router();
productRouter.use(authenticate);

// GET /products/:productId
productRouter.get('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProductAccess(req.params.productId, orgId);
    const detail = await getProductWithDetails(req.params.productId);
    if (!detail) throw new AppError(404, 'Product not found');
    return success(res, detail);
  } catch (err) {
    return next(err);
  }
});

// PATCH /products/:productId
productRouter.patch('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProductAccess(req.params.productId, orgId);
    const body = updateProductSchema.parse(req.body);
    await db
      .update(products)
      .set({ ...body, updated_at: new Date() })
      .where(eq(products.id, req.params.productId));
    const detail = await getProductWithDetails(req.params.productId);
    return success(res, detail);
  } catch (err) {
    return next(err);
  }
});

// DELETE /products/:productId
productRouter.delete('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProductAccess(req.params.productId, orgId);
    await db.delete(products).where(eq(products.id, req.params.productId));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

// POST /products/:productId/attributes — batch upsert
productRouter.post('/:productId/attributes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProductAccess(req.params.productId, orgId);
    const { attributes } = batchAttributeSchema.parse(req.body);

    for (const attr of attributes) {
      await db
        .insert(product_attributes)
        .values({
          product_id: req.params.productId,
          attribute_name: attr.attribute_name,
          attribute_value: attr.attribute_value ?? null,
          value_source: attr.value_source ?? 'manual',
          confidence_score: attr.confidence_score ?? null,
        })
        .onConflictDoUpdate({
          target: [product_attributes.product_id, product_attributes.attribute_name],
          set: {
            attribute_value: sql`excluded.attribute_value`,
            value_source: sql`excluded.value_source`,
            confidence_score: sql`excluded.confidence_score`,
            updated_at: sql`now()`,
          },
        });
    }

    // Mark product updated
    await db.update(products).set({ updated_at: new Date() }).where(eq(products.id, req.params.productId));

    const updated = await db
      .select()
      .from(product_attributes)
      .where(eq(product_attributes.product_id, req.params.productId))
      .orderBy(asc(product_attributes.attribute_name));

    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

// POST /products/:productId/files/:projectFileId — link mapped file to product
productRouter.post('/:productId/files/:projectFileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { project_id } = await assertProductAccess(req.params.productId, orgId);

    const [pf] = await db
      .select({ id: project_files.id, project_id: project_files.project_id })
      .from(project_files)
      .where(and(eq(project_files.id, req.params.projectFileId), eq(project_files.is_active, true)))
      .limit(1);
    if (!pf) throw new AppError(404, 'Project file not found');
    if (pf.project_id !== project_id) throw new AppError(400, 'File does not belong to the same project as the product');

    await db
      .update(project_files)
      .set({ product_id: req.params.productId, scope: 'product', updated_at: new Date() })
      .where(eq(project_files.id, req.params.projectFileId));

    return success(res, { linked: true });
  } catch (err) {
    return next(err);
  }
});

// DELETE /products/:productId/files/:projectFileId — unlink
productRouter.delete('/:productId/files/:projectFileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProductAccess(req.params.productId, orgId);

    await db
      .update(project_files)
      .set({ product_id: null, scope: 'project', updated_at: new Date() })
      .where(
        and(
          eq(project_files.id, req.params.projectFileId),
          eq(project_files.product_id, req.params.productId),
        ),
      );

    return success(res, { unlinked: true });
  } catch (err) {
    return next(err);
  }
});
