import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, or, isNull, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { categories, document_types, category_document_requirements } from '../db/schema/categories';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);

// ─── Validation ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).nullable().optional(),
  parent_category_id: z.string().uuid().nullable().optional(),
  default_document_type_ids: z.array(z.string().uuid()).optional().default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  parent_category_id: z.string().uuid().nullable().optional(),
});

const addRequirementSchema = z.object({
  document_type_id: z.string().uuid(),
  is_required: z.boolean().optional().default(true),
  notes: z.string().max(500).nullable().optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

async function slugExists(slug: string, orgId: string | null): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.slug, slug),
        orgId ? eq(categories.organization_id, orgId) : isNull(categories.organization_id),
      ),
    )
    .limit(1);
  return !!row;
}

async function assertCategoryAccess(categoryId: string, orgId: string): Promise<typeof categories.$inferSelect> {
  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!cat) throw new AppError(404, 'Category not found');
  if (cat.is_system_defined) throw new AppError(403, 'System categories cannot be modified');
  if (cat.organization_id !== orgId) throw new AppError(404, 'Category not found');
  return cat;
}

async function getRequirements(categoryId: string) {
  return db
    .select({
      id: category_document_requirements.id,
      category_id: category_document_requirements.category_id,
      document_type_id: category_document_requirements.document_type_id,
      document_type_name: document_types.name,
      document_type_code: document_types.code,
      is_required: category_document_requirements.is_required,
      notes: category_document_requirements.notes,
      created_at: category_document_requirements.created_at,
    })
    .from(category_document_requirements)
    .leftJoin(document_types, eq(category_document_requirements.document_type_id, document_types.id))
    .where(eq(category_document_requirements.category_id, categoryId))
    .orderBy(asc(category_document_requirements.created_at));
}

async function getParentName(parentId: string | null): Promise<string | null> {
  if (!parentId) return null;
  const [parent] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, parentId)).limit(1);
  return parent?.name ?? null;
}

// ─── GET /categories ───────────────────────────────────────────────────────

categoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(categories)
      .where(
        and(
          or(
            eq(categories.organization_id, orgId),
            isNull(categories.organization_id),
          ),
          eq(categories.is_active, true),
        ),
      )
      .orderBy(asc(categories.is_system_defined), asc(categories.name));

    // Attach parent name for display
    const result = await Promise.all(
      rows.map(async (c) => ({
        ...c,
        parent_name: await getParentName(c.parent_category_id),
      })),
    );

    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

// ─── POST /categories ──────────────────────────────────────────────────────

categoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createSchema.parse(req.body);

    const slug = toSlug(body.name);
    if (await slugExists(slug, orgId)) {
      throw new AppError(409, `A category named "${body.name}" already exists in your workspace.`);
    }

    const [category] = await db
      .insert(categories)
      .values({
        name: body.name,
        slug,
        description: body.description,
        parent_category_id: body.parent_category_id,
        organization_id: orgId,
        is_system_defined: false,
        created_by: req.user!.userId,
      })
      .returning();

    // Create default document requirements in one insert
    if (body.default_document_type_ids.length > 0) {
      await db.insert(category_document_requirements).values(
        body.default_document_type_ids.map((dtId) => ({
          category_id: category.id,
          document_type_id: dtId,
          is_required: true,
        })),
      );
    }

    const requirements = await getRequirements(category.id);
    return success(res, { ...category, parent_name: await getParentName(category.parent_category_id), requirements }, 201);
  } catch (err) {
    return next(err);
  }
});

// ─── GET /categories/:id ───────────────────────────────────────────────────

categoriesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [category] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, req.params.id),
          or(
            eq(categories.organization_id, orgId),
            isNull(categories.organization_id),
          ),
        ),
      )
      .limit(1);

    if (!category) throw new AppError(404, 'Category not found');

    const [requirements, children] = await Promise.all([
      getRequirements(category.id),
      db
        .select({ id: categories.id, name: categories.name, is_active: categories.is_active })
        .from(categories)
        .where(eq(categories.parent_category_id, category.id)),
    ]);

    return success(res, {
      ...category,
      parent_name: await getParentName(category.parent_category_id),
      requirements,
      children,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── PATCH /categories/:id ─────────────────────────────────────────────────

categoriesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const category = await assertCategoryAccess(req.params.id, orgId);
    const body = updateSchema.parse(req.body);

    if (body.name && body.name !== category.name) {
      const newSlug = toSlug(body.name);
      if (await slugExists(newSlug, orgId)) {
        throw new AppError(409, `A category named "${body.name}" already exists.`);
      }
      (body as any).slug = newSlug;
    }

    const [updated] = await db
      .update(categories)
      .set({ ...body, updated_at: new Date() })
      .where(eq(categories.id, req.params.id))
      .returning();

    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

// ─── DELETE /categories/:id (archive) ─────────────────────────────────────

categoriesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertCategoryAccess(req.params.id, orgId);
    await db
      .update(categories)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(categories.id, req.params.id));
    return success(res, { archived: true });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /categories/:id/requirements ────────────────────────────────────

categoriesRouter.post('/:id/requirements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    // Allow adding requirements to system categories too? No — only custom
    const [category] = await db
      .select({ id: categories.id, organization_id: categories.organization_id, is_system_defined: categories.is_system_defined })
      .from(categories)
      .where(
        and(
          eq(categories.id, req.params.id),
          or(eq(categories.organization_id, orgId), isNull(categories.organization_id)),
        ),
      )
      .limit(1);
    if (!category) throw new AppError(404, 'Category not found');

    const body = addRequirementSchema.parse(req.body);

    // Check for duplicate
    const [dup] = await db
      .select({ id: category_document_requirements.id })
      .from(category_document_requirements)
      .where(
        and(
          eq(category_document_requirements.category_id, req.params.id),
          eq(category_document_requirements.document_type_id, body.document_type_id),
        ),
      )
      .limit(1);
    if (dup) throw new AppError(409, 'This document type is already assigned to the category.');

    const [req_row] = await db
      .insert(category_document_requirements)
      .values({ category_id: req.params.id, ...body })
      .returning();

    // Return with joined name
    const [enriched] = await getRequirements(req.params.id).then((rows) =>
      rows.filter((r) => r.id === req_row.id),
    );
    return success(res, enriched, 201);
  } catch (err) {
    return next(err);
  }
});

// ─── DELETE /category-requirements/:reqId ─────────────────────────────────

export const categoryRequirementsRouter = Router();
categoryRequirementsRouter.use(authenticate);

categoryRequirementsRouter.delete('/:reqId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [row] = await db
      .select({ id: category_document_requirements.id, category_id: category_document_requirements.category_id })
      .from(category_document_requirements)
      .where(eq(category_document_requirements.id, req.params.reqId))
      .limit(1);
    if (!row) throw new AppError(404, 'Requirement not found');

    // Verify the category belongs to this org
    const [cat] = await db
      .select({ organization_id: categories.organization_id })
      .from(categories)
      .where(eq(categories.id, row.category_id))
      .limit(1);
    if (cat?.organization_id !== orgId) throw new AppError(403, 'Not allowed');

    await db
      .delete(category_document_requirements)
      .where(eq(category_document_requirements.id, req.params.reqId));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});
