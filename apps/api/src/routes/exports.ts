import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import fs from 'fs';
import { db } from '../db/client';
import {
  export_packages,
  export_package_items,
  export_package_boq_items,
  export_package_artifacts,
} from '../db/schema/exports';
import { projects } from '../db/schema/projects';
import { organizations } from '../db/schema/organizations';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import {
  buildChecklistSnapshot,
  buildBoqSnapshot,
  buildAndInsertPackageItems,
  buildAndInsertBoqItems,
  getActiveSpecDocumentId,
} from '../services/export-snapshot';
import { generateArtifact, resolveArtifactPath, resolveContentType, resolveFileExtension } from '../services/export-artifact';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function assertProjectAccess(projectId: string, orgId: string) {
  const [project] = await db
    .select({ id: projects.id, organization_id: projects.organization_id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

async function assertExportAccess(exportId: string, orgId: string) {
  const [pkg] = await db
    .select({ id: export_packages.id, project_id: export_packages.project_id })
    .from(export_packages)
    .where(eq(export_packages.id, exportId))
    .limit(1);
  if (!pkg) throw new AppError(404, 'Export not found');
  await assertProjectAccess(pkg.project_id, orgId);
  return pkg;
}

async function getOrgIdForProject(projectId: string): Promise<string> {
  const [project] = await db
    .select({ organization_id: projects.organization_id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project!.organization_id;
}

// ─── Nested router: /projects/:projectId/exports ──────────────────────────

export const exportProjectRouter = Router();
exportProjectRouter.use(authenticate);

// GET /projects/:projectId/exports
exportProjectRouter.get('/:projectId/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const packages = await db
      .select()
      .from(export_packages)
      .where(eq(export_packages.project_id, req.params.projectId))
      .orderBy(desc(export_packages.created_at));

    // Attach artifacts to each package (lightweight: id, type, label, url, error)
    const withArtifacts = await Promise.all(
      packages.map(async (pkg) => {
        const artifacts = await db
          .select({
            id: export_package_artifacts.id,
            artifact_type: export_package_artifacts.artifact_type,
            label: export_package_artifacts.label,
            artifact_url: export_package_artifacts.artifact_url,
            sort_order: export_package_artifacts.sort_order,
            error_message: export_package_artifacts.error_message,
          })
          .from(export_package_artifacts)
          .where(eq(export_package_artifacts.export_package_id, pkg.id))
          .orderBy(asc(export_package_artifacts.sort_order));
        return { ...pkg, artifacts };
      }),
    );

    return success(res, withArtifacts);
  } catch (err) {
    return next(err);
  }
});

// POST /projects/:projectId/exports  — generate a new export
exportProjectRouter.post('/:projectId/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);

    // ── 1. Readiness gate ───────────────────────────────────────────────────
    const { snapshot: checklistSnapshot, is_export_ready } = await buildChecklistSnapshot(req.params.projectId);

    if (!is_export_ready) {
      const reasons = checklistSnapshot.blocking_items.map((b) => b.item_label);
      return res.status(422).json({
        success: false,
        error: {
          message: 'Export is blocked because required checklist items are incomplete.',
          code: 'EXPORT_BLOCKED',
          blocking_reasons: reasons,
          checklist_summary: checklistSnapshot,
        },
      });
    }

    // ── 2. Compute snapshots ───────────────────────────────────────────────

    const boqSnapshot = await buildBoqSnapshot(req.params.projectId);
    const activeSpecDocumentId = await getActiveSpecDocumentId(req.params.projectId);

    // ── 3. Create package record ───────────────────────────────────────────

    const [pkg] = await db
      .insert(export_packages)
      .values({
        project_id: req.params.projectId,
        created_by: req.user!.userId,
        status: 'queued',
        artifact_type: 'placeholder',
        snapshot_active_spec_document_id: activeSpecDocumentId,
        snapshot_checklist_summary: checklistSnapshot as any,
        snapshot_boq_summary: boqSnapshot as any,
        snapshot_notes: req.body?.notes ?? null,
      })
      .returning();

    try {
      // ── 4. Build immutable section+file rows ───────────────────────────

      await buildAndInsertPackageItems(req.params.projectId, pkg.id);

      // ── 5. Build immutable BOQ rows ────────────────────────────────────

      await buildAndInsertBoqItems(req.params.projectId, pkg.id);

      // ── 6. Generate placeholder artifact ──────────────────────────────

      const artifact = await generateArtifact({
        exportPackageId: pkg.id,
        projectId: req.params.projectId,
        orgId,
        checklistSnapshot,
        boqSnapshot,
        activeSpecDocumentId,
      });

      // ── 7. Mark as generated ──────────────────────────────────────────

      const [updated] = await db
        .update(export_packages)
        .set({
          status: 'generated',
          artifact_type: artifact.artifact_type,
          artifact_path: artifact.artifact_path,
          artifact_url: artifact.artifact_url,
          updated_at: new Date(),
        })
        .where(eq(export_packages.id, pkg.id))
        .returning();

      // Return full detail
      const items = await db
        .select()
        .from(export_package_items)
        .where(eq(export_package_items.export_package_id, pkg.id))
        .orderBy(asc(export_package_items.section_order), asc(export_package_items.sort_order));

      const boqItems = await db
        .select()
        .from(export_package_boq_items)
        .where(eq(export_package_boq_items.export_package_id, pkg.id))
        .orderBy(asc(export_package_boq_items.sort_order));

      return success(res, { package: updated, items, boq_items: boqItems }, 201);
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : 'Generation failed';
      await db
        .update(export_packages)
        .set({ status: 'failed', error_message: message, updated_at: new Date() })
        .where(eq(export_packages.id, pkg.id));
      throw new AppError(500, `Export generation failed: ${message}`);
    }
  } catch (err) {
    return next(err);
  }
});

// ─── Standalone router: /exports/:id ──────────────────────────────────────

export const exportRouter = Router();
exportRouter.use(authenticate);

// GET /exports/:id
exportRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertExportAccess(req.params.id, orgId);

    const [pkg] = await db
      .select()
      .from(export_packages)
      .where(eq(export_packages.id, req.params.id))
      .limit(1);

    const items = await db
      .select()
      .from(export_package_items)
      .where(eq(export_package_items.export_package_id, req.params.id))
      .orderBy(asc(export_package_items.section_order), asc(export_package_items.sort_order));

    const boqItems = await db
      .select()
      .from(export_package_boq_items)
      .where(eq(export_package_boq_items.export_package_id, req.params.id))
      .orderBy(asc(export_package_boq_items.sort_order));

    const artifacts = await db
      .select()
      .from(export_package_artifacts)
      .where(eq(export_package_artifacts.export_package_id, req.params.id))
      .orderBy(asc(export_package_artifacts.sort_order));

    return success(res, { package: pkg, items, boq_items: boqItems, artifacts });
  } catch (err) {
    return next(err);
  }
});

// GET /exports/:id/download
exportRouter.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const pkg = await assertExportAccess(req.params.id, orgId);

    const [full] = await db
      .select({
        artifact_path: export_packages.artifact_path,
        artifact_type: export_packages.artifact_type,
        status: export_packages.status,
        created_at: export_packages.created_at,
      })
      .from(export_packages)
      .where(eq(export_packages.id, req.params.id))
      .limit(1);

    if (full?.status !== 'generated' || !full?.artifact_path) {
      throw new AppError(409, 'Export artifact is not yet available.');
    }

    const absPath = resolveArtifactPath(full.artifact_path);
    if (!fs.existsSync(absPath)) {
      throw new AppError(404, 'Export artifact file not found on disk.');
    }

    const dateStr = new Date(full.created_at).toISOString().slice(0, 10);
    const contentType = resolveContentType(full.artifact_type ?? 'placeholder');
    const ext = resolveFileExtension(full.artifact_type ?? 'placeholder');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="lightselect-export-${dateStr}.${ext}"`);
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    return next(err);
  }
});

// GET /exports/:id/artifacts/:artifactId/download
exportRouter.get('/:id/artifacts/:artifactId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertExportAccess(req.params.id, orgId);

    const [artifact] = await db
      .select()
      .from(export_package_artifacts)
      .where(
        and(
          eq(export_package_artifacts.id, req.params.artifactId),
          eq(export_package_artifacts.export_package_id, req.params.id),
        ),
      )
      .limit(1);

    if (!artifact) throw new AppError(404, 'Artifact not found');
    if (artifact.error_message) throw new AppError(409, `Artifact failed to generate: ${artifact.error_message}`);

    const absPath = resolveArtifactPath(artifact.artifact_path);
    if (!fs.existsSync(absPath)) {
      throw new AppError(404, 'Artifact file not found on disk.');
    }

    const contentType = resolveContentType(artifact.artifact_type);
    const ext = resolveFileExtension(artifact.artifact_type);
    const label = artifact.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${label}.${ext}"`);
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    return next(err);
  }
});
