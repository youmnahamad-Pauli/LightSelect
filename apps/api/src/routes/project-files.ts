import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { project_files } from '../db/schema/project-files';
import { projects } from '../db/schema/projects';
import { files } from '../db/schema/files';
import { categories, document_types } from '../db/schema/categories';
import { consultant_template_sections } from '../db/schema/templates';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

// ─── Validation ────────────────────────────────────────────────────────────

const createSchema = z.object({
  file_id: z.string().uuid(),
  category_id: z.string().uuid({ message: 'Choose a category before saving this upload.' }),
  document_type_id: z.string().uuid({ message: 'Choose a document type before saving this upload.' }),
  consultant_template_section_id: z.string().uuid({
    message: 'Choose where this file should appear in the consultant submittal package.',
  }),
  scope: z.enum(['product', 'category', 'project']).optional().default('project'),
  required_status: z.enum(['required', 'optional', 'reference']).optional().default('required'),
  notes: z.string().max(2000).nullable().optional(),
  version_label: z.string().max(100).nullable().optional(),
});

const updateSchema = z.object({
  category_id: z.string().uuid().optional(),
  document_type_id: z.string().uuid().optional(),
  consultant_template_section_id: z.string().uuid().optional(),
  scope: z.enum(['product', 'category', 'project']).optional(),
  required_status: z.enum(['required', 'optional', 'reference']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  version_label: z.string().max(100).nullable().optional(),
});

// ─── Enriched join query ───────────────────────────────────────────────────

async function getEnrichedProjectFiles(projectId: string) {
  return db
    .select({
      id: project_files.id,
      project_id: project_files.project_id,
      file_id: project_files.file_id,
      file_name: files.original_file_name,
      mime_type: files.mime_type,
      file_size_bytes: files.file_size_bytes,
      category_id: project_files.category_id,
      category_name: categories.name,
      document_type_id: project_files.document_type_id,
      document_type_name: document_types.name,
      document_type_code: document_types.code,
      consultant_template_section_id: project_files.consultant_template_section_id,
      section_name: consultant_template_sections.section_name,
      section_order: consultant_template_sections.section_order,
      section_is_required: consultant_template_sections.is_required,
      product_id: project_files.product_id,
      scope: project_files.scope,
      required_status: project_files.required_status,
      notes: project_files.notes,
      version_label: project_files.version_label,
      is_active: project_files.is_active,
      created_by: project_files.created_by,
      created_at: project_files.created_at,
      updated_at: project_files.updated_at,
    })
    .from(project_files)
    .innerJoin(files, eq(project_files.file_id, files.id))
    .innerJoin(categories, eq(project_files.category_id, categories.id))
    .innerJoin(document_types, eq(project_files.document_type_id, document_types.id))
    .innerJoin(
      consultant_template_sections,
      eq(project_files.consultant_template_section_id, consultant_template_sections.id),
    )
    .where(and(eq(project_files.project_id, projectId), eq(project_files.is_active, true)))
    .orderBy(
      asc(consultant_template_sections.section_order),
      asc(project_files.created_at),
    );
}

async function getEnrichedProjectFile(projectFileId: string) {
  const rows = await db
    .select({
      id: project_files.id,
      project_id: project_files.project_id,
      file_id: project_files.file_id,
      file_name: files.original_file_name,
      mime_type: files.mime_type,
      file_size_bytes: files.file_size_bytes,
      category_id: project_files.category_id,
      category_name: categories.name,
      document_type_id: project_files.document_type_id,
      document_type_name: document_types.name,
      document_type_code: document_types.code,
      consultant_template_section_id: project_files.consultant_template_section_id,
      section_name: consultant_template_sections.section_name,
      section_order: consultant_template_sections.section_order,
      section_is_required: consultant_template_sections.is_required,
      product_id: project_files.product_id,
      scope: project_files.scope,
      required_status: project_files.required_status,
      notes: project_files.notes,
      version_label: project_files.version_label,
      is_active: project_files.is_active,
      created_by: project_files.created_by,
      created_at: project_files.created_at,
      updated_at: project_files.updated_at,
    })
    .from(project_files)
    .innerJoin(files, eq(project_files.file_id, files.id))
    .innerJoin(categories, eq(project_files.category_id, categories.id))
    .innerJoin(document_types, eq(project_files.document_type_id, document_types.id))
    .innerJoin(
      consultant_template_sections,
      eq(project_files.consultant_template_section_id, consultant_template_sections.id),
    )
    .where(eq(project_files.id, projectFileId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Helper: assert project belongs to org ─────────────────────────────────

async function assertProjectAccess(projectId: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

// ─── Nested router: /projects/:projectId/files ────────────────────────────

export const projectFilesNestedRouter = Router();
projectFilesNestedRouter.use(authenticate);

// GET /projects/:projectId/files
projectFilesNestedRouter.get('/:projectId/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const rows = await getEnrichedProjectFiles(req.params.projectId);
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
});

// POST /projects/:projectId/files
projectFilesNestedRouter.post('/:projectId/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const project = await assertProjectAccess(req.params.projectId, orgId);
    const body = createSchema.parse(req.body);

    // Verify the file belongs to this org and is uploaded
    const [file] = await db
      .select({ id: files.id, upload_status: files.upload_status, organization_id: files.organization_id })
      .from(files)
      .where(eq(files.id, body.file_id))
      .limit(1);
    if (!file) throw new AppError(404, 'File not found');
    if (file.organization_id !== orgId) throw new AppError(403, 'File does not belong to your organization');
    if (file.upload_status !== 'uploaded') {
      throw new AppError(400, 'Only successfully uploaded files can be mapped to a project.');
    }

    // Verify the section belongs to the project's consultant template
    if (project.consultant_template_id) {
      const [section] = await db
        .select({ consultant_template_id: consultant_template_sections.consultant_template_id })
        .from(consultant_template_sections)
        .where(eq(consultant_template_sections.id, body.consultant_template_section_id))
        .limit(1);
      if (!section) throw new AppError(404, 'Consultant template section not found');
      if (section.consultant_template_id !== project.consultant_template_id) {
        throw new AppError(
          400,
          "The selected section does not belong to this project's consultant template.",
        );
      }
    }

    const [created] = await db
      .insert(project_files)
      .values({
        project_id: req.params.projectId,
        file_id: body.file_id,
        category_id: body.category_id,
        document_type_id: body.document_type_id,
        consultant_template_section_id: body.consultant_template_section_id,
        scope: body.scope,
        required_status: body.required_status,
        notes: body.notes,
        version_label: body.version_label,
        is_active: true,
        created_by: req.user!.userId,
      })
      .returning();

    const enriched = await getEnrichedProjectFile(created.id);
    return success(res, enriched, 201);
  } catch (err) {
    return next(err);
  }
});

// ─── Standalone router: /project-files/:id ────────────────────────────────

export const projectFileRouter = Router();
projectFileRouter.use(authenticate);

// GET /project-files/:projectFileId
projectFileRouter.get('/:projectFileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const row = await getEnrichedProjectFile(req.params.projectFileId);
    if (!row) throw new AppError(404, 'Project file not found');
    await assertProjectAccess(row.project_id, orgId);
    return success(res, row);
  } catch (err) {
    return next(err);
  }
});

// PATCH /project-files/:projectFileId
projectFileRouter.patch('/:projectFileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ id: project_files.id, project_id: project_files.project_id })
      .from(project_files)
      .where(eq(project_files.id, req.params.projectFileId))
      .limit(1);
    if (!existing) throw new AppError(404, 'Project file not found');
    await assertProjectAccess(existing.project_id, orgId);

    const body = updateSchema.parse(req.body);
    await db
      .update(project_files)
      .set({ ...body, updated_at: new Date() })
      .where(eq(project_files.id, req.params.projectFileId));

    const updated = await getEnrichedProjectFile(req.params.projectFileId);
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

// DELETE /project-files/:projectFileId (soft-remove)
projectFileRouter.delete('/:projectFileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ id: project_files.id, project_id: project_files.project_id })
      .from(project_files)
      .where(eq(project_files.id, req.params.projectFileId))
      .limit(1);
    if (!existing) throw new AppError(404, 'Project file not found');
    await assertProjectAccess(existing.project_id, orgId);

    await db
      .update(project_files)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(project_files.id, req.params.projectFileId));

    return success(res, { removed: true });
  } catch (err) {
    return next(err);
  }
});
