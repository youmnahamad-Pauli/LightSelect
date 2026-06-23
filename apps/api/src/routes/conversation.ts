/**
 * Conversational capstone — API route.
 *
 * POST /projects/:projectId/conversation
 *   Body:  { message: string; history?: Array<{ role: 'user'|'assistant'; content: string }> }
 *   Auth:  Bearer JWT (authenticate middleware)
 *   Scope: project must belong to the authenticated user's organization
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { projects } from '../db/schema/projects';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { runConversation } from '../lib/conversation/orchestrator';

export const conversationRouter = Router({ mergeParams: true });
conversationRouter.use(authenticate);

const messageSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});

// POST /projects/:projectId/conversation
conversationRouter.post(
  '/:projectId/conversation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };

      // Verify project exists and belongs to org
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
        .limit(1);
      if (!project) throw new AppError(404, 'Project not found');

      const body = messageSchema.parse(req.body);

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new AppError(503, 'Conversation feature is not configured (ANTHROPIC_API_KEY missing).');
      }

      const result = await runConversation({
        projectId,
        orgId,
        message: body.message,
        history: body.history,
      });

      return success(res, result);
    } catch (err) {
      return next(err);
    }
  },
);
