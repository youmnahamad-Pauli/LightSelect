import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import {
  project_spec_documents,
  project_spec_requirements,
  spec_version_diffs,
  spec_comparison_runs,
  spec_comparison_results,
} from '../db/schema/spec';
import { products, product_attributes } from '../db/schema/products';
import { projects } from '../db/schema/projects';
import { files } from '../db/schema/files';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { getSpecExtractor } from '../lib/spec/extractor';
import { compareProductToSpec } from '../lib/spec/comparator';
import { computeDiff } from '../lib/spec/diff';

// ─── Validation schemas ────────────────────────────────────────────────────

const createSpecDocSchema = z.object({
  title: z.string().min(1).max(200),
  version_label: z.string().min(1).max(100),
  file_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSpecDocSchema = createSpecDocSchema.partial();

const updateRequirementSchema = z.object({
  attribute_key: z.string().min(1).max(100).optional(),
  attribute_label: z.string().min(1).max(200).optional(),
  operator: z.enum(['eq', 'gte', 'lte', 'gt', 'lt', 'contains', 'range', 'any']).optional(),
  target_value: z.string().min(1).max(500).optional(),
  target_unit: z.string().max(50).nullable().optional(),
  tolerance_value: z.string().max(100).nullable().optional(),
  tolerance_unit: z.string().max(50).nullable().optional(),
  priority: z.enum(['mandatory', 'preferred', 'optional']).optional(),
  status: z.enum(['extracted', 'reviewed', 'manual']).optional(),
  section_name: z.string().max(200).nullable().optional(),
  requirement_group: z.string().max(100).nullable().optional(),
  source_reference: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
});

const createRequirementSchema = updateRequirementSchema.required({
  attribute_key: true,
  attribute_label: true,
  operator: true,
  target_value: true,
}).extend({
  spec_document_id: z.string().uuid(),
});

const createComparisonSchema = z.object({
  spec_document_id: z.string().uuid(),
  target_type: z.enum(['product', 'project_file']),
  target_id: z.string().uuid(),
});

const overrideResultSchema = z.object({
  override_status: z.enum(['compliant', 'deviated', 'missing', 'review_needed']),
  override_notes: z.string().max(2000).nullable().optional(),
});

const diffSchema = z.object({ compare_to_id: z.string().uuid() });

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

async function assertSpecDocAccess(specDocId: string, orgId: string) {
  const [doc] = await db
    .select({ id: project_spec_documents.id, project_id: project_spec_documents.project_id })
    .from(project_spec_documents)
    .where(eq(project_spec_documents.id, specDocId))
    .limit(1);
  if (!doc) throw new AppError(404, 'Spec document not found');
  await assertProjectAccess(doc.project_id, orgId);
  return doc;
}

async function getRequirementsForDoc(specDocId: string) {
  return db
    .select()
    .from(project_spec_requirements)
    .where(eq(project_spec_requirements.spec_document_id, specDocId))
    .orderBy(asc(project_spec_requirements.sort_order), asc(project_spec_requirements.created_at));
}

// ─── Router 1: /projects/:projectId/spec ──────────────────────────────────

export const specProjectRouter = Router();
specProjectRouter.use(authenticate);

specProjectRouter.get('/:projectId/spec', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const docs = await db
      .select({
        id: project_spec_documents.id,
        project_id: project_spec_documents.project_id,
        file_id: project_spec_documents.file_id,
        title: project_spec_documents.title,
        version_label: project_spec_documents.version_label,
        notes: project_spec_documents.notes,
        is_active: project_spec_documents.is_active,
        uploaded_by: project_spec_documents.uploaded_by,
        file_name: files.original_file_name,
        created_at: project_spec_documents.created_at,
        updated_at: project_spec_documents.updated_at,
      })
      .from(project_spec_documents)
      .leftJoin(files, eq(project_spec_documents.file_id, files.id))
      .where(eq(project_spec_documents.project_id, req.params.projectId))
      .orderBy(desc(project_spec_documents.created_at));

    // Attach requirement counts for the UI to show extraction status
    const withCounts = await Promise.all(
      docs.map(async (doc) => {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(project_spec_requirements)
          .where(eq(project_spec_requirements.spec_document_id, doc.id));
        return { ...doc, requirement_count: n };
      }),
    );

    return success(res, withCounts);
  } catch (err) {
    return next(err);
  }
});

specProjectRouter.post('/:projectId/spec', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const body = createSpecDocSchema.parse(req.body);
    const [doc] = await db
      .insert(project_spec_documents)
      .values({ ...body, project_id: req.params.projectId, uploaded_by: req.user!.userId })
      .returning();
    return success(res, { ...doc, requirements: [] }, 201);
  } catch (err) {
    return next(err);
  }
});

specProjectRouter.get('/:projectId/spec-comparisons', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const runs = await db
      .select()
      .from(spec_comparison_runs)
      .where(eq(spec_comparison_runs.project_id, req.params.projectId))
      .orderBy(desc(spec_comparison_runs.compared_at));
    return success(res, runs);
  } catch (err) {
    return next(err);
  }
});

// ─── Router 2: /spec-documents/:id ────────────────────────────────────────

export const specDocumentRouter = Router();
specDocumentRouter.use(authenticate);

specDocumentRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const doc = await assertSpecDocAccess(req.params.id, orgId);
    const [full] = await db
      .select({
        id: project_spec_documents.id,
        project_id: project_spec_documents.project_id,
        file_id: project_spec_documents.file_id,
        title: project_spec_documents.title,
        version_label: project_spec_documents.version_label,
        notes: project_spec_documents.notes,
        is_active: project_spec_documents.is_active,
        uploaded_by: project_spec_documents.uploaded_by,
        file_name: files.original_file_name,
        created_at: project_spec_documents.created_at,
        updated_at: project_spec_documents.updated_at,
      })
      .from(project_spec_documents)
      .leftJoin(files, eq(project_spec_documents.file_id, files.id))
      .where(eq(project_spec_documents.id, req.params.id))
      .limit(1);
    const requirements = await getRequirementsForDoc(req.params.id);
    return success(res, { ...full, requirements });
  } catch (err) {
    return next(err);
  }
});

specDocumentRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertSpecDocAccess(req.params.id, orgId);
    const body = updateSpecDocSchema.parse(req.body);
    const [updated] = await db
      .update(project_spec_documents)
      .set({ ...body, updated_at: new Date() })
      .where(eq(project_spec_documents.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

specDocumentRouter.post('/:id/set-active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const doc = await assertSpecDocAccess(req.params.id, orgId);
    // Clear existing active flag on this project
    await db
      .update(project_spec_documents)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(project_spec_documents.project_id, doc.project_id));
    const [updated] = await db
      .update(project_spec_documents)
      .set({ is_active: true, updated_at: new Date() })
      .where(eq(project_spec_documents.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

specDocumentRouter.post('/:id/extract', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const doc = await assertSpecDocAccess(req.params.id, orgId);

    // Resolve file path if available
    let filePath: string | null = null;
    let mimeType: string | null = null;
    if (doc) {
      const [full] = await db
        .select({ file_id: project_spec_documents.file_id })
        .from(project_spec_documents)
        .where(eq(project_spec_documents.id, req.params.id))
        .limit(1);
      if (full?.file_id) {
        const [fileRow] = await db
          .select({ mime_type: files.mime_type })
          .from(files)
          .where(eq(files.id, full.file_id))
          .limit(1);
        mimeType = fileRow?.mime_type ?? null;
      }
    }

    const extractor = getSpecExtractor();
    const extracted = await extractor.extract({ specDocumentId: req.params.id, filePath, mimeType });

    // Delete any previously extracted requirements (not manually added ones)
    await db
      .delete(project_spec_requirements)
      .where(
        and(
          eq(project_spec_requirements.spec_document_id, req.params.id),
          eq(project_spec_requirements.status, 'extracted'),
        ),
      );

    if (extracted.length > 0) {
      await db.insert(project_spec_requirements).values(
        extracted.map((r) => ({ ...r, spec_document_id: req.params.id, status: 'extracted' as const })),
      );
    }

    const requirements = await getRequirementsForDoc(req.params.id);
    return success(res, { extracted_count: extracted.length, requirements });
  } catch (err) {
    return next(err);
  }
});

specDocumentRouter.post('/:id/diff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const fromDoc = await assertSpecDocAccess(req.params.id, orgId);
    const { compare_to_id } = diffSchema.parse(req.body);
    await assertSpecDocAccess(compare_to_id, orgId);

    const [fromReqs, toReqs] = await Promise.all([
      getRequirementsForDoc(req.params.id),
      getRequirementsForDoc(compare_to_id),
    ]);

    const diffSummary = computeDiff(fromReqs, toReqs);

    const [existing] = await db
      .select({ id: spec_version_diffs.id })
      .from(spec_version_diffs)
      .where(
        and(
          eq(spec_version_diffs.from_spec_document_id, req.params.id),
          eq(spec_version_diffs.to_spec_document_id, compare_to_id),
        ),
      )
      .limit(1);

    let diff;
    if (existing) {
      [diff] = await db
        .update(spec_version_diffs)
        .set({ diff_summary: diffSummary as any })
        .where(eq(spec_version_diffs.id, existing.id))
        .returning();
    } else {
      [diff] = await db
        .insert(spec_version_diffs)
        .values({
          project_id: fromDoc.project_id,
          from_spec_document_id: req.params.id,
          to_spec_document_id: compare_to_id,
          diff_summary: diffSummary as any,
        })
        .returning();
    }

    return success(res, { diff, summary: diffSummary });
  } catch (err) {
    return next(err);
  }
});

// ─── Router 3: /spec-requirements ─────────────────────────────────────────

export const specRequirementRouter = Router();
specRequirementRouter.use(authenticate);

specRequirementRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createRequirementSchema.parse(req.body);
    await assertSpecDocAccess(body.spec_document_id, orgId);
    const [req_row] = await db
      .insert(project_spec_requirements)
      .values({ ...body, status: 'manual' as const })
      .returning();
    return success(res, req_row, 201);
  } catch (err) {
    return next(err);
  }
});

specRequirementRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ spec_document_id: project_spec_requirements.spec_document_id })
      .from(project_spec_requirements)
      .where(eq(project_spec_requirements.id, req.params.id))
      .limit(1);
    if (!existing) throw new AppError(404, 'Requirement not found');
    await assertSpecDocAccess(existing.spec_document_id, orgId);

    const body = updateRequirementSchema.parse(req.body);
    const [updated] = await db
      .update(project_spec_requirements)
      .set({ ...body, updated_at: new Date() })
      .where(eq(project_spec_requirements.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});

specRequirementRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ spec_document_id: project_spec_requirements.spec_document_id })
      .from(project_spec_requirements)
      .where(eq(project_spec_requirements.id, req.params.id))
      .limit(1);
    if (!existing) throw new AppError(404, 'Requirement not found');
    await assertSpecDocAccess(existing.spec_document_id, orgId);
    await db.delete(project_spec_requirements).where(eq(project_spec_requirements.id, req.params.id));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

// ─── Router 4: /spec-comparisons + /spec-comparison-results ───────────────

export const specComparisonRouter = Router();
specComparisonRouter.use(authenticate);

specComparisonRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const body = createComparisonSchema.parse(req.body);
    const specDoc = await assertSpecDocAccess(body.spec_document_id, orgId);

    // Verify target exists in same project
    let targetLabel = '';
    if (body.target_type === 'product') {
      const [product] = await db
        .select({ id: products.id, model_number: products.model_number, manufacturer: products.manufacturer })
        .from(products)
        .where(and(eq(products.id, body.target_id), eq(products.project_id, specDoc.project_id)))
        .limit(1);
      if (!product) throw new AppError(404, 'Product not found in this project');
      targetLabel = [product.manufacturer, product.model_number].filter(Boolean).join(' — ') || 'Unnamed product';
    }

    // Load spec requirements
    const requirements = await getRequirementsForDoc(body.spec_document_id);
    if (requirements.length === 0) {
      throw new AppError(400, 'This spec version has no requirements. Run extraction first or add requirements manually.');
    }

    // Load product attributes
    const attributes = body.target_type === 'product'
      ? await db
          .select()
          .from(product_attributes)
          .where(eq(product_attributes.product_id, body.target_id))
      : [];

    const { results, summary } = compareProductToSpec(requirements, attributes);

    // Create run record
    const [run] = await db
      .insert(spec_comparison_runs)
      .values({
        project_id: specDoc.project_id,
        spec_document_id: body.spec_document_id,
        target_type: body.target_type,
        target_id: body.target_id,
        target_label: targetLabel,
        run_status: 'completed',
        ...summary,
        created_by: req.user!.userId,
      })
      .returning();

    // Insert result rows
    if (results.length > 0) {
      await db.insert(spec_comparison_results).values(
        results.map((r) => ({ ...r, comparison_run_id: run.id })),
      );
    }

    const savedResults = await db
      .select()
      .from(spec_comparison_results)
      .where(eq(spec_comparison_results.comparison_run_id, run.id))
      .orderBy(asc(spec_comparison_results.created_at));

    return success(res, { run, results: savedResults }, 201);
  } catch (err) {
    return next(err);
  }
});

specComparisonRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [run] = await db
      .select()
      .from(spec_comparison_runs)
      .where(eq(spec_comparison_runs.id, req.params.id))
      .limit(1);
    if (!run) throw new AppError(404, 'Comparison run not found');
    await assertProjectAccess(run.project_id, orgId);

    const results = await db
      .select({
        id: spec_comparison_results.id,
        comparison_run_id: spec_comparison_results.comparison_run_id,
        spec_requirement_id: spec_comparison_results.spec_requirement_id,
        attribute_key: spec_comparison_results.attribute_key,
        compared_value: spec_comparison_results.compared_value,
        compared_unit: spec_comparison_results.compared_unit,
        comparison_status: spec_comparison_results.comparison_status,
        deviation_reason: spec_comparison_results.deviation_reason,
        confidence_score: spec_comparison_results.confidence_score,
        source_reference: spec_comparison_results.source_reference,
        override_status: spec_comparison_results.override_status,
        override_notes: spec_comparison_results.override_notes,
        // Spec requirement context
        attribute_label: project_spec_requirements.attribute_label,
        operator: project_spec_requirements.operator,
        target_value: project_spec_requirements.target_value,
        target_unit: project_spec_requirements.target_unit,
        priority: project_spec_requirements.priority,
        requirement_group: project_spec_requirements.requirement_group,
        created_at: spec_comparison_results.created_at,
        updated_at: spec_comparison_results.updated_at,
      })
      .from(spec_comparison_results)
      .innerJoin(
        project_spec_requirements,
        eq(spec_comparison_results.spec_requirement_id, project_spec_requirements.id),
      )
      .where(eq(spec_comparison_results.comparison_run_id, req.params.id))
      .orderBy(asc(spec_comparison_results.created_at));

    return success(res, { run, results });
  } catch (err) {
    return next(err);
  }
});

export const specComparisonResultRouter = Router();
specComparisonResultRouter.use(authenticate);

specComparisonResultRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [existing] = await db
      .select({ id: spec_comparison_results.id, comparison_run_id: spec_comparison_results.comparison_run_id })
      .from(spec_comparison_results)
      .where(eq(spec_comparison_results.id, req.params.id))
      .limit(1);
    if (!existing) throw new AppError(404, 'Comparison result not found');
    const [run] = await db
      .select({ project_id: spec_comparison_runs.project_id })
      .from(spec_comparison_runs)
      .where(eq(spec_comparison_runs.id, existing.comparison_run_id))
      .limit(1);
    if (!run) throw new AppError(404, 'Comparison run not found');
    await assertProjectAccess(run.project_id, orgId);

    const body = overrideResultSchema.parse(req.body);
    const [updated] = await db
      .update(spec_comparison_results)
      .set({ ...body, updated_at: new Date() })
      .where(eq(spec_comparison_results.id, req.params.id))
      .returning();
    return success(res, updated);
  } catch (err) {
    return next(err);
  }
});
