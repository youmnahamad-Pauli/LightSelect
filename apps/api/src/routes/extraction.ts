import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { extraction_jobs } from '../db/schema/extraction-jobs';
import { project_files } from '../db/schema/project-files';
import { products, product_attributes } from '../db/schema/products';
import { files } from '../db/schema/files';
import { projects } from '../db/schema/projects';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { getExtractionService } from '../lib/extraction';
import { getStorageAdapter, LocalStorageAdapter } from '../lib/storage';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function assertProjectFileAccess(projectFileId: string, orgId: string) {
  const [row] = await db
    .select({
      id: project_files.id,
      project_id: project_files.project_id,
      file_id: project_files.file_id,
      product_id: project_files.product_id,
      organization_id: projects.organization_id,
    })
    .from(project_files)
    .innerJoin(projects, eq(project_files.project_id, projects.id))
    .where(eq(project_files.id, projectFileId))
    .limit(1);

  if (!row) throw new AppError(404, 'Project file not found');
  if (row.organization_id !== orgId) throw new AppError(404, 'Project file not found');
  return row;
}

// ─── Nested router: /project-files/:projectFileId/... ─────────────────────

export const extractionNestedRouter = Router();
extractionNestedRouter.use(authenticate);

/**
 * POST /project-files/:projectFileId/extract
 *
 * Queues and immediately runs extraction against the linked product.
 * Returns the completed job + updated product attributes.
 */
extractionNestedRouter.post(
  '/:projectFileId/extract',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const pf = await assertProjectFileAccess(req.params.projectFileId, orgId);

      if (!pf.product_id) {
        throw new AppError(
          400,
          'This file must be linked to a product before running extraction. Open the product and link this file first.',
          'NO_PRODUCT_LINKED',
        );
      }

      // Get raw file metadata for the extraction service
      const [rawFile] = await db
        .select({ id: files.id, mime_type: files.mime_type, storage_path: files.storage_path })
        .from(files)
        .where(eq(files.id, pf.file_id))
        .limit(1);

      // Create extraction job record (queued)
      const [job] = await db
        .insert(extraction_jobs)
        .values({
          project_file_id: pf.id,
          product_id: pf.product_id,
          status: 'queued',
          parser_type: 'stub',
        })
        .returning();

      // Mark processing
      await db
        .update(extraction_jobs)
        .set({ status: 'processing', updated_at: new Date() })
        .where(eq(extraction_jobs.id, job.id));

      try {
        // Resolve local file path if available
        const adapter = getStorageAdapter();
        const filePath =
          rawFile?.storage_path && adapter instanceof LocalStorageAdapter
            ? adapter.resolvePath(rawFile.storage_path)
            : null;

        const service = getExtractionService();
        const result = await service.extract({
          fileId: pf.file_id,
          filePath,
          mimeType: rawFile?.mime_type ?? null,
        });

        // Write extracted attributes to product_attributes via upsert
        for (const attr of result.attributes) {
          await db
            .insert(product_attributes)
            .values({
              product_id: pf.product_id!,
              attribute_name: attr.attribute_name,
              attribute_value: attr.attribute_value,
              value_source: 'extracted',
              confidence_score: attr.confidence_score,
            })
            .onConflictDoUpdate({
              target: [product_attributes.product_id, product_attributes.attribute_name],
              set: {
                attribute_value: sql`excluded.attribute_value`,
                value_source: sql`'extracted'`,
                confidence_score: sql`excluded.confidence_score`,
                updated_at: sql`now()`,
              },
            });
        }

        // Mark product as pdf_extract source
        await db
          .update(products)
          .set({ source_type: 'pdf_extract', updated_at: new Date() })
          .where(eq(products.id, pf.product_id!));

        // Mark job completed
        const [completed] = await db
          .update(extraction_jobs)
          .set({
            status: 'completed',
            extracted_count: result.attributes.length,
            raw_output: result.raw_output as any,
            updated_at: new Date(),
          })
          .where(eq(extraction_jobs.id, job.id))
          .returning();

        // Return completed job + current attributes (all, not just extracted)
        const updatedAttrs = await db
          .select()
          .from(product_attributes)
          .where(eq(product_attributes.product_id, pf.product_id!));

        return success(res, { job: completed, attributes: updatedAttrs }, 201);
      } catch (extractionErr) {
        const message = extractionErr instanceof Error ? extractionErr.message : 'Extraction failed';
        const [failed] = await db
          .update(extraction_jobs)
          .set({ status: 'failed', error_message: message, updated_at: new Date() })
          .where(eq(extraction_jobs.id, job.id))
          .returning();
        return success(res, { job: failed, attributes: [] });
      }
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /project-files/:projectFileId/extraction-jobs
 * Returns all extraction jobs for this file, newest first.
 */
extractionNestedRouter.get(
  '/:projectFileId/extraction-jobs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      await assertProjectFileAccess(req.params.projectFileId, orgId);
      const jobs = await db
        .select()
        .from(extraction_jobs)
        .where(eq(extraction_jobs.project_file_id, req.params.projectFileId))
        .orderBy(desc(extraction_jobs.created_at));
      return success(res, jobs);
    } catch (err) {
      return next(err);
    }
  },
);

// ─── Standalone router: /extraction-jobs/:jobId ───────────────────────────

export const extractionJobRouter = Router();
extractionJobRouter.use(authenticate);

/**
 * GET /extraction-jobs/:jobId
 * Returns a single job by ID with org check.
 */
extractionJobRouter.get('/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [job] = await db
      .select()
      .from(extraction_jobs)
      .where(eq(extraction_jobs.id, req.params.jobId))
      .limit(1);
    if (!job) throw new AppError(404, 'Extraction job not found');
    // Verify org access via the linked project file
    await assertProjectFileAccess(job.project_file_id, orgId);
    return success(res, job);
  } catch (err) {
    return next(err);
  }
});
