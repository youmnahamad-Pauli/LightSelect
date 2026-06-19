import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { projects } from '../db/schema';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  project_name: z.string().min(1, 'Project name is required').max(200),
  client_name: z.string().max(200).nullable().optional(),
  consultant_name: z.string().max(200).nullable().optional(),
  project_code: z.string().max(100).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  revision_label: z.string().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  consultant_template_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active']).optional().default('draft'),
});

const updateSchema = z.object({
  project_name: z.string().min(1).max(200).optional(),
  client_name: z.string().max(200).nullable().optional(),
  consultant_name: z.string().max(200).nullable().optional(),
  project_code: z.string().max(100).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  revision_label: z.string().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  consultant_template_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

async function assertProjectBelongsToOrg(projectId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!row) throw new AppError(404, 'Project not found');
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.organization_id, orgId))
      .orderBy(desc(projects.updated_at));
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createSchema.parse(req.body);
    const [project] = await db
      .insert(projects)
      .values({ ...body, organization_id: orgId, created_by: req.user!.userId })
      .returning();
    return success(res, project, 201);
  } catch (err) {
    return next(err);
  }
});

router.get('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.organization_id, orgId)))
      .limit(1);
    if (!project) throw new AppError(404, 'Project not found');
    return success(res, project);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectBelongsToOrg(req.params.projectId, orgId);
    const body = updateSchema.parse(req.body);
    const [updated] = await db
      .update(projects)
      .set({ ...body, updated_at: new Date() })
      .where(eq(projects.id, req.params.projectId))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectBelongsToOrg(req.params.projectId, orgId);
    await db
      .update(projects)
      .set({ status: 'archived', updated_at: new Date() })
      .where(eq(projects.id, req.params.projectId));
    return success(res, { archived: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
