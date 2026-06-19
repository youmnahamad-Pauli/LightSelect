import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { checklist_items } from '../db/schema/checklist';
import { projects } from '../db/schema/projects';
import { buildChecklist } from '../services/checklist';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

export const checklistNestedRouter = Router();
checklistNestedRouter.use(authenticate);

export const checklistItemRouter = Router();
checklistItemRouter.use(authenticate);

// ─── Helper ────────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

// ─── GET /projects/:id/checklist ───────────────────────────────────────────

checklistNestedRouter.get(
  '/:projectId/checklist',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      await assertProjectAccess(req.params.projectId, orgId);
      const result = await buildChecklist(req.params.projectId);
      return success(res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// ─── POST /projects/:id/checklist/rebuild ──────────────────────────────────

checklistNestedRouter.post(
  '/:projectId/checklist/rebuild',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      await assertProjectAccess(req.params.projectId, orgId);
      const result = await buildChecklist(req.params.projectId);
      return success(res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// ─── PATCH /checklist-items/:id — waive or un-waive ───────────────────────

const patchSchema = z.object({
  status: z.enum(['missing', 'complete', 'waived']),
});

checklistItemRouter.patch(
  '/:itemId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { status } = patchSchema.parse(req.body);

      const [item] = await db
        .select({ id: checklist_items.id, project_id: checklist_items.project_id })
        .from(checklist_items)
        .where(eq(checklist_items.id, req.params.itemId))
        .limit(1);
      if (!item) throw new AppError(404, 'Checklist item not found');
      await assertProjectAccess(item.project_id, orgId);

      const [updated] = await db
        .update(checklist_items)
        .set({ status, updated_at: new Date() })
        .where(eq(checklist_items.id, req.params.itemId))
        .returning();

      return success(res, updated);
    } catch (err) {
      return next(err);
    }
  },
);
