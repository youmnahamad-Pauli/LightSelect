/**
 * ExportSource — the typed seam between data-gathering and rendering.
 *
 * Phase 0 goal: pure indirection, zero behaviour change.
 *
 * All data the XLSX renderer, PDF renderer, and ZIP bundler need is
 * assembled here once and passed through, so the renderers are pure
 * functions of their inputs (no internal DB calls).
 *
 * LegacyExportSource.resolve() is the concrete implementation that
 * reproduces exactly what generateArtifact() + the renderers used to
 * gather on their own from the DB.
 */
import { eq, asc, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { projects, consultant_templates } from '../db/schema/projects';
import { project_spec_documents } from '../db/schema/spec';
import { export_package_boq_items, export_package_items } from '../db/schema/exports';
import { buildComplianceBlocks } from './compliance-statement';
import type { ChecklistSnapshot, BoqSnapshot } from './export-snapshot';
import type { PdfBranding } from './export-pdf';
import type { LuminaireComplianceBlock } from './compliance-statement';
import type { ExportPackageItem, ExportPackageBoqItem } from '../db/schema/exports';

// ─── ArtifactInput (unchanged public contract) ─────────────────────────────

/** The data the export route assembles before calling generateArtifact. */
export interface ArtifactInput {
  exportPackageId: string;
  projectId: string;
  orgId: string;
  checklistSnapshot: ChecklistSnapshot;
  boqSnapshot: BoqSnapshot;
  activeSpecDocumentId: string | null;
}

// ─── ExportSource ──────────────────────────────────────────────────────────

/**
 * Everything the XLSX renderer, PDF renderer, and ZIP bundler need —
 * fully resolved, no further DB access required after this is built.
 *
 * The shape is intentionally flat to make the data dependency explicit
 * and the renderers independently testable.
 */
export interface ExportSource {
  // ── Identity ──────────────────────────────────────────────────────────
  exportPackageId: string;
  projectId: string;
  orgId: string;

  // ── Project context ───────────────────────────────────────────────────
  projectMeta: {
    project_name: string;
    client_name: string | null;
    project_code: string | null;
    revision_label: string | null;
  };
  /** Consultant branding for the PDF header. Defaults are applied by LegacyExportSource. */
  pdfBranding: PdfBranding;

  // ── Spec context ──────────────────────────────────────────────────────
  activeSpecDocumentId: string | null;
  activeSpec: { title: string; version_label: string } | null;

  // ── Pre-computed snapshots ────────────────────────────────────────────
  /** Checklist gate result. Stored on export_packages; passed through from the route. */
  checklistSnapshot: ChecklistSnapshot;
  /** BOQ aggregate stats. Stored on export_packages; passed through from the route. */
  boqSnapshot: BoqSnapshot;

  // ── Compliance ────────────────────────────────────────────────────────
  /** Per-luminaire attribute compliance. Null → section omitted from XLSX/PDF. */
  complianceBlocks: LuminaireComplianceBlock[] | null;

  // ── Package snapshot rows ─────────────────────────────────────────────
  /** Immutable BOQ schedule rows written at export time. */
  packageBoqItems: ExportPackageBoqItem[];
  /** Immutable section ↔ file composition rows written at export time. */
  packageSectionItems: ExportPackageItem[];
}

// ─── LegacyExportSource ────────────────────────────────────────────────────

/**
 * Resolves ExportSource from the DB exactly as the pre-seam code did.
 *
 * Every query here is a verbatim lift from the previous generateArtifact()
 * body and the two renderer functions. No logic has changed.
 */
export class LegacyExportSource {
  static async resolve(input: ArtifactInput): Promise<ExportSource> {
    const { exportPackageId, projectId, orgId, checklistSnapshot, boqSnapshot, activeSpecDocumentId } = input;

    // ── Project metadata ───────────────────────────────────────────────
    const [project] = await db
      .select({
        project_name: projects.project_name,
        client_name: projects.client_name,
        project_code: projects.project_code,
        revision_label: projects.revision_label,
        consultant_template_id: projects.consultant_template_id,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const projectMeta = {
      project_name: project?.project_name ?? 'Unknown Project',
      client_name: project?.client_name ?? null,
      project_code: project?.project_code ?? null,
      revision_label: project?.revision_label ?? null,
    };

    // ── Consultant branding ────────────────────────────────────────────
    let pdfBranding: PdfBranding = { headerTitle: 'LIGHTSELECT — EXPORT PACKAGE SUMMARY' };
    if (project?.consultant_template_id) {
      const [tmpl] = await db
        .select({
          template_name: consultant_templates.template_name,
          logo_url: consultant_templates.logo_url,
          brand_color: consultant_templates.brand_color,
        })
        .from(consultant_templates)
        .where(eq(consultant_templates.id, project.consultant_template_id))
        .limit(1);
      if (tmpl) {
        pdfBranding = {
          headerTitle: tmpl.template_name
            ? `${tmpl.template_name.toUpperCase()} — EXPORT PACKAGE SUMMARY`
            : 'LIGHTSELECT — EXPORT PACKAGE SUMMARY',
          logoUrl: tmpl.logo_url,
          brandColor: tmpl.brand_color,
        };
      }
    }

    // ── Active spec ────────────────────────────────────────────────────
    let activeSpec: { title: string; version_label: string } | null = null;
    if (activeSpecDocumentId) {
      const [doc] = await db
        .select({
          title: project_spec_documents.title,
          version_label: project_spec_documents.version_label,
        })
        .from(project_spec_documents)
        .where(eq(project_spec_documents.id, activeSpecDocumentId))
        .limit(1);
      activeSpec = doc ?? null;
    }

    // ── Compliance blocks ──────────────────────────────────────────────
    const complianceBlocks = await buildComplianceBlocks(projectId, activeSpecDocumentId);

    // ── Package snapshot rows ──────────────────────────────────────────
    // Both XLSX and PDF previously ran these queries independently;
    // we run them once here and pass the results to both renderers.
    const packageBoqItems = await db
      .select()
      .from(export_package_boq_items)
      .where(eq(export_package_boq_items.export_package_id, exportPackageId))
      .orderBy(asc(export_package_boq_items.sort_order));

    const packageSectionItems = await db
      .select()
      .from(export_package_items)
      .where(eq(export_package_items.export_package_id, exportPackageId))
      .orderBy(asc(export_package_items.section_order), asc(export_package_items.sort_order));

    return {
      exportPackageId,
      projectId,
      orgId,
      projectMeta,
      pdfBranding,
      activeSpecDocumentId,
      activeSpec,
      checklistSnapshot,
      boqSnapshot,
      complianceBlocks,
      packageBoqItems,
      packageSectionItems,
    };
  }
}
