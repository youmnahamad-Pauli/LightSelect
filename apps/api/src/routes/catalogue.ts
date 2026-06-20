/**
 * Catalogue API — profiles, accessories, configured products.
 *
 * These are LIBRARY / COMPONENT records, not luminaire-type categories.
 * All routes are scoped to the authenticated org.
 * Matching and compliance never read these routes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import {
  catalogue_profiles,
  catalogue_accessories,
  configured_products,
  configured_product_accessories,
} from '../db/schema/catalogue';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

// ─── Validation ────────────────────────────────────────────────────────────

const profileCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  section_width_mm: z.number().positive().nullable().optional(),
  section_height_mm: z.number().positive().nullable().optional(),
  section_label: z.string().max(100).nullable().optional(),
  mounting_capabilities: z.array(z.string()).optional().default([]),
  finish: z.string().max(100).nullable().optional(),
  diffuser_type: z.string().max(100).nullable().optional(),
  is_dot_free: z.boolean().optional().default(false),
  compatible_strip_codes: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(['active', 'discontinued', 'draft']).optional().default('active'),
});

const accessoryCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  accessory_type: z.enum(['end_cap', 'clip', 'bracket', 'joint_connector', 'suspension_kit', 'feed_cable', 'driver', 'other']).optional().default('other'),
  compatible_with: z.array(z.string()).optional().default([]),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(['active', 'discontinued', 'draft']).optional().default('active'),
});

const configuredProductCreateSchema = z.object({
  project_id: z.string().uuid(),
  core_product_id: z.string().uuid(),
  profile_id: z.string().uuid().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'active', 'superseded']).optional().default('draft'),
});

const bomLineSchema = z.object({
  accessory_id: z.string().uuid(),
  qty: z.number().int().positive().optional().default(1),
  notes: z.string().max(500).nullable().optional(),
});

// ─── Profiles router ───────────────────────────────────────────────────────

export const profilesRouter = Router();
profilesRouter.use(authenticate);

profilesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(catalogue_profiles)
      .where(eq(catalogue_profiles.organization_id, orgId))
      .orderBy(asc(catalogue_profiles.code));
    return success(res, rows);
  } catch (err) { return next(err); }
});

profilesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = profileCreateSchema.parse(req.body);
    const [row] = await db
      .insert(catalogue_profiles)
      .values({ ...body, organization_id: orgId, created_by: req.user!.userId })
      .returning();
    return success(res, row, 201);
  } catch (err) { return next(err); }
});

profilesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [row] = await db
      .select()
      .from(catalogue_profiles)
      .where(and(eq(catalogue_profiles.id, req.params.id), eq(catalogue_profiles.organization_id, orgId)))
      .limit(1);
    if (!row) throw new AppError(404, 'Profile not found');
    return success(res, row);
  } catch (err) { return next(err); }
});

profilesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ id: catalogue_profiles.id })
      .from(catalogue_profiles)
      .where(and(eq(catalogue_profiles.id, req.params.id), eq(catalogue_profiles.organization_id, orgId)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Profile not found');
    const body = profileCreateSchema.partial().parse(req.body);
    const [updated] = await db
      .update(catalogue_profiles)
      .set({ ...body, updated_at: new Date() })
      .where(eq(catalogue_profiles.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) { return next(err); }
});

// ─── Accessories router ────────────────────────────────────────────────────

export const accessoriesRouter = Router();
accessoriesRouter.use(authenticate);

accessoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(catalogue_accessories)
      .where(eq(catalogue_accessories.organization_id, orgId))
      .orderBy(asc(catalogue_accessories.code));
    return success(res, rows);
  } catch (err) { return next(err); }
});

accessoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = accessoryCreateSchema.parse(req.body);
    const [row] = await db
      .insert(catalogue_accessories)
      .values({ ...body, organization_id: orgId, created_by: req.user!.userId })
      .returning();
    return success(res, row, 201);
  } catch (err) { return next(err); }
});

accessoriesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ id: catalogue_accessories.id })
      .from(catalogue_accessories)
      .where(and(eq(catalogue_accessories.id, req.params.id), eq(catalogue_accessories.organization_id, orgId)))
      .limit(1);
    if (!existing) throw new AppError(404, 'Accessory not found');
    const body = accessoryCreateSchema.partial().parse(req.body);
    const [updated] = await db
      .update(catalogue_accessories)
      .set({ ...body, updated_at: new Date() })
      .where(eq(catalogue_accessories.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) { return next(err); }
});

// ─── Configured products router ────────────────────────────────────────────

export const configuredProductsRouter = Router();
configuredProductsRouter.use(authenticate);

configuredProductsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(configured_products)
      .where(eq(configured_products.organization_id, orgId))
      .orderBy(asc(configured_products.created_at));
    return success(res, rows);
  } catch (err) { return next(err); }
});

configuredProductsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = configuredProductCreateSchema.parse(req.body);
    const [row] = await db
      .insert(configured_products)
      .values({ ...body, organization_id: orgId, created_by: req.user!.userId })
      .returning();
    return success(res, row, 201);
  } catch (err) { return next(err); }
});

configuredProductsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [cp] = await db
      .select()
      .from(configured_products)
      .where(and(eq(configured_products.id, req.params.id), eq(configured_products.organization_id, orgId)))
      .limit(1);
    if (!cp) throw new AppError(404, 'Configured product not found');
    const bom = await db
      .select()
      .from(configured_product_accessories)
      .where(eq(configured_product_accessories.configured_product_id, cp.id))
      .orderBy(asc(configured_product_accessories.created_at));
    return success(res, { ...cp, bom });
  } catch (err) { return next(err); }
});

// POST /configured-products/:id/bom — add a BOM line
configuredProductsRouter.post('/:id/bom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [cp] = await db
      .select({ id: configured_products.id })
      .from(configured_products)
      .where(and(eq(configured_products.id, req.params.id), eq(configured_products.organization_id, orgId)))
      .limit(1);
    if (!cp) throw new AppError(404, 'Configured product not found');
    const body = bomLineSchema.parse(req.body);
    const [line] = await db
      .insert(configured_product_accessories)
      .values({ configured_product_id: cp.id, ...body })
      .returning();
    return success(res, line, 201);
  } catch (err) { return next(err); }
});

// DELETE /configured-products/:id/bom/:lineId
configuredProductsRouter.delete('/:id/bom/:lineId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [cp] = await db
      .select({ id: configured_products.id })
      .from(configured_products)
      .where(and(eq(configured_products.id, req.params.id), eq(configured_products.organization_id, orgId)))
      .limit(1);
    if (!cp) throw new AppError(404, 'Configured product not found');
    await db
      .delete(configured_product_accessories)
      .where(eq(configured_product_accessories.id, req.params.lineId));
    return success(res, { deleted: true });
  } catch (err) { return next(err); }
});
