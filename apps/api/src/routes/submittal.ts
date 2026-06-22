/**
 * Submittal template + completeness routes — INCREMENT 3.
 *
 * GET    /submittal-templates                             — list
 * POST   /submittal-templates                             — create
 * GET    /submittal-templates/:id                         — get with items
 * PATCH  /submittal-templates/:id                         — update
 * DELETE /submittal-templates/:id                         — delete
 * POST   /submittal-templates/:id/items                   — add item
 * PATCH  /submittal-template-items/:itemId                — update item
 * DELETE /submittal-template-items/:itemId                — delete item
 *
 * PATCH  /projects/:projectId/submittal-template          — assign/unassign
 * GET    /projects/:projectId/submittal-completeness      — compute completeness
 * POST   /projects/:projectId/submittal-completeness/check — gate check (override flag)
 *
 * PATCH  /project-documents/:docId/item-link              — link doc to schedule item
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { submittal_templates, submittal_template_items, submittal_override_log, submittalDocumentTypes, submittalItemScopes } from '../db/schema/submittal';
import { projects, project_documents } from '../db/schema/projects';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { buildSubmittalCompleteness } from '../services/submittal-completeness';

// ─── Shared helpers ────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, orgId: string) {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!p) throw new AppError(404, 'Project not found');
}

async function assertTemplateAccess(templateId: string, orgId: string) {
  const [t] = await db
    .select({ id: submittal_templates.id })
    .from(submittal_templates)
    .where(
      and(
        eq(submittal_templates.id, templateId),
        // org-scoped OR global (organization_id IS NULL = example/global)
      ),
    )
    .limit(1);
  if (!t) throw new AppError(404, 'Submittal template not found');
  return t;
}

async function loadTemplateWithItems(templateId: string) {
  const [template] = await db
    .select()
    .from(submittal_templates)
    .where(eq(submittal_templates.id, templateId))
    .limit(1);
  if (!template) throw new AppError(404, 'Submittal template not found');

  const items = await db
    .select()
    .from(submittal_template_items)
    .where(eq(submittal_template_items.template_id, templateId))
    .orderBy(asc(submittal_template_items.sort_order));

  return { ...template, items };
}

// ─── Validation schemas ────────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name:        z.string().min(1).max(200),
  consultant:  z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

const updateTemplateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  consultant:  z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active:   z.boolean().optional(),
});

const createItemSchema = z.object({
  document_type: z.enum(submittalDocumentTypes),
  label:         z.string().min(1).max(300),
  required:      z.boolean().default(true),
  scope:         z.enum(submittalItemScopes),
  sort_order:    z.number().int().optional(),
});

const updateItemSchema = z.object({
  label:      z.string().min(1).max(300).optional(),
  required:   z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// ─── Template router ───────────────────────────────────────────────────────────

export const submittalTemplateRouter = Router();
submittalTemplateRouter.use(authenticate);

// GET /submittal-templates
submittalTemplateRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(submittal_templates)
      .where(
        // Return org-specific AND global examples
        eq(submittal_templates.is_active, true),
      );
    // Filter: org's own + global (null org_id)
    const filtered = rows.filter(
      (r) => r.organization_id === null || r.organization_id === orgId,
    );
    return success(res, filtered);
  } catch (err) { return next(err); }
});

// POST /submittal-templates
submittalTemplateRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createTemplateSchema.parse(req.body);
    const [template] = await db
      .insert(submittal_templates)
      .values({ ...body, organization_id: orgId })
      .returning();
    return success(res, { ...template, items: [] }, 201);
  } catch (err) { return next(err); }
});

// GET /submittal-templates/:id
submittalTemplateRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await loadTemplateWithItems(req.params.id);
    return success(res, result);
  } catch (err) { return next(err); }
});

// PATCH /submittal-templates/:id
submittalTemplateRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.id, orgId);
    const body = updateTemplateSchema.parse(req.body);
    const [updated] = await db
      .update(submittal_templates)
      .set({ ...body, updated_at: new Date() })
      .where(eq(submittal_templates.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) { return next(err); }
});

// DELETE /submittal-templates/:id
submittalTemplateRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.id, orgId);
    await db
      .update(submittal_templates)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(submittal_templates.id, req.params.id));
    return success(res, { deleted: true });
  } catch (err) { return next(err); }
});

// POST /submittal-templates/:id/items
submittalTemplateRouter.post('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.id, orgId);
    const body = createItemSchema.parse(req.body);
    const [item] = await db
      .insert(submittal_template_items)
      .values({ ...body, template_id: req.params.id })
      .returning();
    return success(res, item, 201);
  } catch (err) { return next(err); }
});

// ─── Template item router ──────────────────────────────────────────────────────

export const submittalTemplateItemRouter = Router();
submittalTemplateItemRouter.use(authenticate);

// PATCH /submittal-template-items/:itemId
submittalTemplateItemRouter.patch('/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateItemSchema.parse(req.body);
    const [updated] = await db
      .update(submittal_template_items)
      .set({ ...body, updated_at: new Date() })
      .where(eq(submittal_template_items.id, req.params.itemId))
      .returning();
    if (!updated) throw new AppError(404, 'Template item not found');
    return success(res, updated);
  } catch (err) { return next(err); }
});

// DELETE /submittal-template-items/:itemId
submittalTemplateItemRouter.delete('/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db
      .delete(submittal_template_items)
      .where(eq(submittal_template_items.id, req.params.itemId));
    return success(res, { deleted: true });
  } catch (err) { return next(err); }
});

// ─── Project-nested submittal routes ──────────────────────────────────────────

export const submittalProjectRouter = Router({ mergeParams: true });
submittalProjectRouter.use(authenticate);

// PATCH /projects/:projectId/submittal-template — assign or unassign
submittalProjectRouter.patch(
  '/:projectId/submittal-template',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectAccess(projectId, orgId);

      const { submittal_template_id } = req.body as { submittal_template_id: string | null };

      if (submittal_template_id !== null && submittal_template_id !== undefined) {
        // Verify template exists
        const [t] = await db
          .select({ id: submittal_templates.id })
          .from(submittal_templates)
          .where(eq(submittal_templates.id, submittal_template_id))
          .limit(1);
        if (!t) throw new AppError(404, 'Submittal template not found');
      }

      const [updated] = await db
        .update(projects)
        .set({ submittal_template_id: submittal_template_id ?? null, updated_at: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      return success(res, updated);
    } catch (err) { return next(err); }
  },
);

// GET /projects/:projectId/submittal-completeness
submittalProjectRouter.get(
  '/:projectId/submittal-completeness',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectAccess(projectId, orgId);
      const result = await buildSubmittalCompleteness(projectId);
      return success(res, result);
    } catch (err) { return next(err); }
  },
);

// POST /projects/:projectId/submittal-completeness/check — export gate
submittalProjectRouter.post(
  '/:projectId/submittal-completeness/check',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectAccess(projectId, orgId);

      const { is_override = false, override_reason } = req.body as {
        is_override?: boolean;
        override_reason?: string;
      };

      const completeness = await buildSubmittalCompleteness(projectId);

      if (completeness.no_template) {
        return res.status(422).json({
          success: false,
          error: {
            message: 'No submittal template assigned to this project.',
            code: 'NO_SUBMITTAL_TEMPLATE',
          },
        });
      }

      const missingItems = [
        ...completeness.project_scope_items
          .filter((i) => i.required && !i.satisfied)
          .map((i) => `[project] ${i.label}`),
        ...completeness.per_item_rows.flatMap((row) =>
          row.items
            .filter((i) => i.required && !i.satisfied)
            .map((i) => `[${row.item_code ?? row.requirement_name}] ${i.label}`),
        ),
      ];

      if (completeness.is_export_ready) {
        return success(res, {
          is_ready: true,
          override_applied: false,
          missing_items: [],
          completeness_summary: completeness.summary,
        });
      }

      if (!is_override) {
        return res.status(422).json({
          success: false,
          error: {
            message: `Export blocked: ${missingItems.length} required item${missingItems.length !== 1 ? 's' : ''} missing.`,
            code: 'SUBMITTAL_INCOMPLETE',
            missing_items: missingItems,
            completeness_summary: completeness.summary,
          },
        });
      }

      // Override confirmed — log it and allow through
      await db.insert(submittal_override_log).values({
        project_id:      projectId,
        template_id:     completeness.template_id,
        missing_items:   missingItems,
        override_reason: override_reason ?? null,
      });

      return success(res, {
        is_ready:          false,
        override_applied:  true,
        missing_items:     missingItems,
        completeness_summary: completeness.summary,
      });
    } catch (err) { return next(err); }
  },
);

// ─── Project-document item-link router ────────────────────────────────────────

export const projectDocItemLinkRouter = Router();
projectDocItemLinkRouter.use(authenticate);

const itemLinkSchema = z.object({
  item_id: z.string().uuid().nullable(),
});

// PATCH /project-documents/:docId/item-link
projectDocItemLinkRouter.patch(
  '/:docId/item-link',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { docId } = req.params;
      const { item_id } = itemLinkSchema.parse(req.body);

      const [doc] = await db
        .select()
        .from(project_documents)
        .where(
          and(
            eq(project_documents.id, docId),
            eq(project_documents.organization_id, orgId),
          ),
        )
        .limit(1);
      if (!doc) throw new AppError(404, 'Document not found');

      const [updated] = await db
        .update(project_documents)
        .set({ item_id, updated_at: new Date() })
        .where(eq(project_documents.id, docId))
        .returning();

      return success(res, updated);
    } catch (err) { return next(err); }
  },
);
