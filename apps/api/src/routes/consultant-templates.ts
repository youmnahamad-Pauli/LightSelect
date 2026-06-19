import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, desc, max } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { consultant_templates } from '../db/schema/projects';
import { consultant_template_sections, consultant_section_rules } from '../db/schema/templates';
import { categories, document_types } from '../db/schema/categories';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

// ─── Validation schemas ────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  consultant_name: z.string().min(1, 'Consultant name is required').max(200),
  template_name: z.string().min(1, 'Template name is required').max(200),
  version: z.string().max(50).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const createSectionSchema = z.object({
  section_name: z.string().min(1, 'Section name is required').max(200),
  section_code: z.string().max(50).nullable().optional(),
  is_required: z.boolean().optional().default(false),
  accepts_multiple_files: z.boolean().optional().default(true),
  description: z.string().max(1000).nullable().optional(),
});

const updateSectionSchema = z.object({
  section_name: z.string().min(1).max(200).optional(),
  section_code: z.string().max(50).nullable().optional(),
  is_required: z.boolean().optional(),
  accepts_multiple_files: z.boolean().optional(),
  description: z.string().max(1000).nullable().optional(),
});

const reorderSchema = z.object({
  section_ids: z.array(z.string().uuid()).min(1),
});

const createRuleSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  document_type_id: z.string().uuid().nullable().optional(),
  is_allowed: z.boolean().optional().default(true),
}).refine(
  (d) => d.category_id || d.document_type_id,
  { message: 'At least one of category_id or document_type_id must be provided.' },
);

// ─── Shared helpers ────────────────────────────────────────────────────────

async function assertTemplateAccess(templateId: string, orgId: string) {
  const [template] = await db
    .select()
    .from(consultant_templates)
    .where(and(eq(consultant_templates.id, templateId), eq(consultant_templates.organization_id, orgId)))
    .limit(1);
  if (!template) throw new AppError(404, 'Template not found');
  return template;
}

async function getRulesForSection(sectionId: string) {
  return db
    .select({
      id: consultant_section_rules.id,
      consultant_template_section_id: consultant_section_rules.consultant_template_section_id,
      category_id: consultant_section_rules.category_id,
      category_name: categories.name,
      document_type_id: consultant_section_rules.document_type_id,
      document_type_name: document_types.name,
      is_allowed: consultant_section_rules.is_allowed,
      created_at: consultant_section_rules.created_at,
    })
    .from(consultant_section_rules)
    .leftJoin(categories, eq(consultant_section_rules.category_id, categories.id))
    .leftJoin(document_types, eq(consultant_section_rules.document_type_id, document_types.id))
    .where(eq(consultant_section_rules.consultant_template_section_id, sectionId))
    .orderBy(asc(consultant_section_rules.created_at));
}

async function getSectionsWithRules(templateId: string) {
  const sections = await db
    .select()
    .from(consultant_template_sections)
    .where(eq(consultant_template_sections.consultant_template_id, templateId))
    .orderBy(asc(consultant_template_sections.section_order));

  return Promise.all(
    sections.map(async (s) => ({
      ...s,
      rules: await getRulesForSection(s.id),
    })),
  );
}

async function renumberSections(templateId: string) {
  const sections = await db
    .select()
    .from(consultant_template_sections)
    .where(eq(consultant_template_sections.consultant_template_id, templateId))
    .orderBy(asc(consultant_template_sections.section_order));
  await Promise.all(
    sections.map((s, i) =>
      db
        .update(consultant_template_sections)
        .set({ section_order: i + 1, updated_at: new Date() })
        .where(eq(consultant_template_sections.id, s.id)),
    ),
  );
}

// ─── Template router ───────────────────────────────────────────────────────

export const templateRouter = Router();
templateRouter.use(authenticate);

// GET /consultant-templates
templateRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const templates = await db
      .select()
      .from(consultant_templates)
      .where(eq(consultant_templates.organization_id, orgId))
      .orderBy(desc(consultant_templates.created_at));

    const result = await Promise.all(
      templates.map(async (t) => {
        const sections = await db
          .select({ id: consultant_template_sections.id })
          .from(consultant_template_sections)
          .where(eq(consultant_template_sections.consultant_template_id, t.id));
        return { ...t, section_count: sections.length };
      }),
    );

    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

// POST /consultant-templates
templateRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createTemplateSchema.parse(req.body);
    const [template] = await db
      .insert(consultant_templates)
      .values({ ...body, organization_id: orgId, created_by: req.user!.userId })
      .returning();
    return success(res, { template, sections: [] }, 201);
  } catch (err) {
    return next(err);
  }
});

// GET /consultant-templates/:templateId  (now includes rules per section)
templateRouter.get('/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const template = await assertTemplateAccess(req.params.templateId, orgId);
    const sections = await getSectionsWithRules(template.id);
    return success(res, { template, sections });
  } catch (err) {
    return next(err);
  }
});

// PATCH /consultant-templates/:templateId
templateRouter.patch('/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.templateId, orgId);
    const body = updateTemplateSchema.parse(req.body);
    const [updated] = await db
      .update(consultant_templates)
      .set({ ...body, updated_at: new Date() })
      .where(eq(consultant_templates.id, req.params.templateId))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

// POST /consultant-templates/:templateId/duplicate
templateRouter.post('/:templateId/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const source = await assertTemplateAccess(req.params.templateId, orgId);
    const sourceSections = await db
      .select()
      .from(consultant_template_sections)
      .where(eq(consultant_template_sections.consultant_template_id, source.id))
      .orderBy(asc(consultant_template_sections.section_order));

    const [newTemplate] = await db
      .insert(consultant_templates)
      .values({
        organization_id: orgId,
        consultant_name: source.consultant_name,
        template_name: `${source.template_name} (Copy)`,
        version: source.version,
        description: source.description,
        is_active: true,
        created_by: req.user!.userId,
      })
      .returning();

    if (sourceSections.length > 0) {
      const newSectionRows = await db
        .insert(consultant_template_sections)
        .values(
          sourceSections.map((s) => ({
            consultant_template_id: newTemplate.id,
            section_name: s.section_name,
            section_code: s.section_code,
            section_order: s.section_order,
            is_required: s.is_required,
            accepts_multiple_files: s.accepts_multiple_files,
            description: s.description,
          })),
        )
        .returning();

      // Copy rules from source sections to new sections
      const oldToNew = new Map(sourceSections.map((s, i) => [s.id, newSectionRows[i].id]));
      for (const [oldId, newId] of oldToNew) {
        const sourceRules = await db
          .select()
          .from(consultant_section_rules)
          .where(eq(consultant_section_rules.consultant_template_section_id, oldId));
        if (sourceRules.length > 0) {
          await db.insert(consultant_section_rules).values(
            sourceRules.map((r) => ({
              consultant_template_section_id: newId,
              category_id: r.category_id,
              document_type_id: r.document_type_id,
              is_allowed: r.is_allowed,
            })),
          );
        }
      }
    }

    const newSectionsWithRules = await getSectionsWithRules(newTemplate.id);
    return success(res, { template: newTemplate, sections: newSectionsWithRules }, 201);
  } catch (err) {
    return next(err);
  }
});

// POST /consultant-templates/:templateId/sections
templateRouter.post('/:templateId/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.templateId, orgId);
    const body = createSectionSchema.parse(req.body);

    const [maxRow] = await db
      .select({ val: max(consultant_template_sections.section_order) })
      .from(consultant_template_sections)
      .where(eq(consultant_template_sections.consultant_template_id, req.params.templateId));

    const [section] = await db
      .insert(consultant_template_sections)
      .values({ ...body, consultant_template_id: req.params.templateId, section_order: (maxRow?.val ?? 0) + 1 })
      .returning();

    return success(res, { ...section, rules: [] }, 201);
  } catch (err) {
    return next(err);
  }
});

// POST /consultant-templates/:templateId/sections/reorder
templateRouter.post('/:templateId/sections/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertTemplateAccess(req.params.templateId, orgId);
    const { section_ids } = reorderSchema.parse(req.body);

    await Promise.all(
      section_ids.map((id, index) =>
        db
          .update(consultant_template_sections)
          .set({ section_order: index + 1, updated_at: new Date() })
          .where(
            and(
              eq(consultant_template_sections.id, id),
              eq(consultant_template_sections.consultant_template_id, req.params.templateId),
            ),
          ),
      ),
    );

    return success(res, await getSectionsWithRules(req.params.templateId));
  } catch (err) {
    return next(err);
  }
});

// ─── Section router (mounted at /consultant-template-sections) ─────────────

export const sectionRouter = Router();
sectionRouter.use(authenticate);

async function getSectionAndVerifyOrg(sectionId: string, orgId: string) {
  const [section] = await db
    .select()
    .from(consultant_template_sections)
    .where(eq(consultant_template_sections.id, sectionId))
    .limit(1);
  if (!section) throw new AppError(404, 'Section not found');
  await assertTemplateAccess(section.consultant_template_id, orgId);
  return section;
}

// PATCH /consultant-template-sections/:sectionId
sectionRouter.patch('/:sectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await getSectionAndVerifyOrg(req.params.sectionId, orgId);
    const body = updateSectionSchema.parse(req.body);
    const [updated] = await db
      .update(consultant_template_sections)
      .set({ ...body, updated_at: new Date() })
      .where(eq(consultant_template_sections.id, req.params.sectionId))
      .returning();
    return success(res, { ...updated, rules: await getRulesForSection(updated.id) });
  } catch (err) {
    return next(err);
  }
});

// DELETE /consultant-template-sections/:sectionId
sectionRouter.delete('/:sectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const section = await getSectionAndVerifyOrg(req.params.sectionId, orgId);
    await db.delete(consultant_template_sections).where(eq(consultant_template_sections.id, req.params.sectionId));
    await renumberSections(section.consultant_template_id);
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

// GET /consultant-template-sections/:sectionId/rules
sectionRouter.get('/:sectionId/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await getSectionAndVerifyOrg(req.params.sectionId, orgId);
    return success(res, await getRulesForSection(req.params.sectionId));
  } catch (err) {
    return next(err);
  }
});

// POST /consultant-template-sections/:sectionId/rules
sectionRouter.post('/:sectionId/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await getSectionAndVerifyOrg(req.params.sectionId, orgId);
    const body = createRuleSchema.parse(req.body);

    const [rule] = await db
      .insert(consultant_section_rules)
      .values({ consultant_template_section_id: req.params.sectionId, ...body })
      .returning();

    // Return enriched
    const [enriched] = await getRulesForSection(req.params.sectionId).then((rows) =>
      rows.filter((r) => r.id === rule.id),
    );
    return success(res, enriched, 201);
  } catch (err) {
    return next(err);
  }
});

// DELETE /consultant-template-sections/:sectionId/rules/:ruleId
sectionRouter.delete('/:sectionId/rules/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await getSectionAndVerifyOrg(req.params.sectionId, orgId);
    const [rule] = await db
      .select({ id: consultant_section_rules.id })
      .from(consultant_section_rules)
      .where(
        and(
          eq(consultant_section_rules.id, req.params.ruleId),
          eq(consultant_section_rules.consultant_template_section_id, req.params.sectionId),
        ),
      )
      .limit(1);
    if (!rule) throw new AppError(404, 'Rule not found');
    await db.delete(consultant_section_rules).where(eq(consultant_section_rules.id, req.params.ruleId));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});
