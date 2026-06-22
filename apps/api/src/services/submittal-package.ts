/**
 * Submittal package assembly — INCREMENT 4.
 *
 * Assembles the resolved compliance statements + linked project documents
 * into ONE ordered submittal package in the template's required sequence.
 *
 * Output:
 *   pdf  — merged PDF: index page → per-item CS sheets → uploaded PDFs (in template order)
 *   zip  — companion ZIP for any non-PDF uploads (images, XLSX, DWG, etc.)
 *          null when all uploaded documents are PDFs
 *
 * Assembly order (primary = template sort_order; secondary = requirement order):
 *   project-scope items  → linked project_documents (PDF → merged; non-PDF → zip)
 *   per_item non-CS      → per requirement, linked doc (PDF → merged; non-PDF → zip)
 *   per_item CS          → per requirement, pdfkit-rendered AECOM PDF (always merged)
 *
 * Gate: respects Increment-3 completeness gate. Blocked if incomplete and no override.
 * Missing components are VISIBLE in the index; nothing is silently dropped.
 */
import path from 'path';
import fs from 'fs';
import { Writable } from 'stream';
import archiver from 'archiver';
import { PDFDocument as PdfLib } from 'pdf-lib';
import PDFKit from 'pdfkit';
import { eq, and, asc, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { projects, project_documents } from '../db/schema/projects';
import {
  submittal_templates,
  submittal_template_items,
  submittal_override_log,
  type SubmittalDocumentType,
} from '../db/schema/submittal';
import { matching_requirements, match_decisions } from '../db/schema/matching';
import { delivery_combos } from '../db/schema/delivery-combos';
import { AppError } from '../lib/errors';
import { buildSubmittalCompleteness } from './submittal-completeness';
import { MatchDecisionExportSource } from '../lib/exports/spine';
import { renderStatement } from '../lib/exports/templates/registry';

// ─── Public types ──────────────────────────────────────────────────────────────

export interface PackageManifestItem {
  /** 1-based index in the assembled PDF (index page = 1; undefined for zip-only items). */
  pdf_component_index?: number;
  template_item_id: string;
  sort_order: number;
  label: string;
  document_type: string;
  scope: 'project' | 'per_item';
  requirement_id?: string;
  requirement_name?: string;
  item_code?: string;
  status: 'present' | 'generated' | 'missing_overridden' | 'missing';
  filename?: string;
  mime_type?: string;
  in_pdf: boolean;
  in_zip: boolean;
  note?: string;
}

export interface PackageManifest {
  project_id: string;
  template_id: string;
  template_name: string;
  generated_at: string;
  gate_state: 'ready' | 'override_applied' | 'blocked';
  items: PackageManifestItem[];
  pdf_component_count: number;
  zip_component_count: number;
}

export interface AssembledPackage {
  manifest: PackageManifest;
  pdf: Buffer;
  zip: Buffer | null;
  pdf_filename: string;
  zip_filename: string | null;
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface RequirementSelection {
  requirement_id: string;
  requirement_name: string;
  item_code: string | null;
  luminaire_type: string;
  canonical_product_id: string | null;
  is_override: boolean;
  is_stub: boolean;
}

// ─── Selection resolution ──────────────────────────────────────────────────────

async function resolveRequirementSelection(req: {
  id: string;
  name: string;
  item_code: string | null;
  luminaire_type: string;
  selected_candidate_type: string | null;
  selected_candidate_id: string | null;
  selection_is_override: boolean;
}): Promise<RequirementSelection> {
  const base = {
    requirement_id:   req.id,
    requirement_name: req.name,
    item_code:        req.item_code,
    luminaire_type:   req.luminaire_type,
  };

  if (!req.selected_candidate_type || !req.selected_candidate_id) {
    const [top] = await db
      .select({ canonical_product_id: match_decisions.canonical_product_id })
      .from(match_decisions)
      .where(
        and(
          eq(match_decisions.requirement_id, req.id),
          eq(match_decisions.status, 'evaluated'),
          isNotNull(match_decisions.rank),
        ),
      )
      .orderBy(match_decisions.rank)
      .limit(1);

    return {
      ...base,
      canonical_product_id: top?.canonical_product_id ?? null,
      is_override: false,
      is_stub: !top,
    };
  }

  let canonicalId: string | null = null;
  if (req.selected_candidate_type === 'product') {
    canonicalId = req.selected_candidate_id;
  } else {
    const [combo] = await db
      .select({ canonical_product_id: delivery_combos.canonical_product_id })
      .from(delivery_combos)
      .where(eq(delivery_combos.id, req.selected_candidate_id))
      .limit(1);
    canonicalId = combo?.canonical_product_id ?? null;
  }

  return {
    ...base,
    canonical_product_id: canonicalId,
    is_override: req.selection_is_override,
    is_stub: !canonicalId,
  };
}

// ─── PDF merge ────────────────────────────────────────────────────────────────

async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PdfLib.create();
  for (const buf of buffers) {
    try {
      const src = await PdfLib.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch {
      // Corrupted or empty PDF component — skip silently (already noted in manifest)
    }
  }
  return Buffer.from(await merged.save());
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

async function buildZipBuffer(
  files: { name: string; data: Buffer }[],
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk: Buffer, _enc: string, cb: () => void) {
        chunks.push(chunk);
        cb();
      },
    });
    writable.on('finish', () => resolve(Buffer.concat(chunks)));
    writable.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(writable);
    for (const f of files) archive.append(f.data, { name: f.name });
    archive.finalize();
  });
}

// ─── Index PDF (cover + contents page) ────────────────────────────────────────

async function generateIndexPdf(
  projectName: string,
  templateName: string,
  revisionLabel: string | null,
  gateState: PackageManifest['gate_state'],
  items: PackageManifestItem[],
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const M    = 40;
    const PW   = 595.28;
    const PH   = 841.89;
    const CW   = PW - M * 2;
    const FOOTER_Y = PH - M - 28;

    const doc = new PDFKit({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      bufferPages: true,
      info: { Title: `Submittal Package — ${projectName}`, Author: 'LightSelect' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', reject);

    let y = M;
    const BRAND   = '#7B5A43';
    const BRAND_L = '#E8D9CB';
    const INK     = '#2B2621';
    const MUTED   = '#6F685F';
    const FAINT   = '#8A8178';
    const WHITE   = '#FFFFFF';
    const OK_FG   = '#2D6A4F';
    const WARN_FG = '#C62828';
    const MISS_FG = '#A06A3B';
    const ROW_H   = 14;

    function checkPage(n: number) {
      if (y + n > FOOTER_Y) { doc.addPage(); y = M; }
    }

    // Cover header
    doc.rect(M, y, CW, 32).fill(BRAND);
    doc.fill(WHITE).font('Helvetica-Bold').fontSize(13)
       .text('SUBMITTAL PACKAGE', M + 10, y + 9, { width: CW - 20, lineBreak: false });
    y += 32;

    doc.fill(INK).font('Helvetica').fontSize(9);
    y += 6;
    doc.text('', M, y);

    const kvRow = (label: string, value: string) => {
      checkPage(14);
      doc.fill(MUTED).fontSize(8.5)
         .text(label, M, y, { width: 110, lineBreak: false, continued: false });
      doc.fill(INK).text(value, M + 115, y, { width: CW - 115, lineBreak: false });
      doc.text('', M, y + 13);
      y += 13;
    };

    kvRow('Project',  projectName);
    kvRow('Template', templateName);
    kvRow('Revision', revisionLabel ?? '—');
    kvRow('Generated', new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }));

    y += 6;
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BRAND_L).lineWidth(0.6).stroke();
    y += 8;

    // Gate state block
    checkPage(22);
    const gateColor = gateState === 'ready' ? OK_FG : gateState === 'override_applied' ? WARN_FG : WARN_FG;
    const gateLabel = gateState === 'ready'
      ? '✓  READY FOR EXPORT'
      : gateState === 'override_applied'
        ? '⚠  EXPORT WITH OVERRIDE — some required items are missing'
        : '✗  BLOCKED — required items missing';
    doc.fill(gateColor).font('Helvetica-Bold').fontSize(10)
       .text(gateLabel, M, y);
    y += 18;

    y += 6;
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BRAND_L).lineWidth(0.6).stroke();
    y += 8;

    // Contents header
    checkPage(20);
    doc.rect(M, y, CW, 16).fill(BRAND);
    doc.fill(WHITE).font('Helvetica-Bold').fontSize(9)
       .text('CONTENTS — IN ASSEMBLY ORDER', M + 5, y + 4, { width: CW - 10, lineBreak: false });
    y += 16;

    // Column headers
    checkPage(12);
    doc.rect(M, y, CW, 12).fill(BRAND_L);
    doc.fill(INK).font('Helvetica-Bold').fontSize(7)
       .text('#',        M + 2, y + 2, { width: 18, lineBreak: false })
       .text('Label',    M + 22, y + 2, { width: 170, lineBreak: false })
       .text('Scope',    M + 195, y + 2, { width: 55, lineBreak: false })
       .text('Status',   M + 252, y + 2, { width: 90, lineBreak: false })
       .text('Location', M + 344, y + 2, { width: CW - 344 - 2, lineBreak: false });
    y += 12;

    // Item rows
    let pdfIdx = 1; // index PDF is component 1 — will show as "Index"
    for (const item of items) {
      checkPage(ROW_H);
      const rowBg = item.status === 'missing' ? '#FFF5F5'
                  : item.status === 'missing_overridden' ? '#FFFDE7'
                  : '#FFFFFF';
      doc.rect(M, y, CW, ROW_H).fill(rowBg);

      const itemNum = item.in_pdf ? String(++pdfIdx) : '—';
      const statusFg = item.status === 'present' || item.status === 'generated' ? OK_FG
                     : item.status === 'missing_overridden' ? MISS_FG : WARN_FG;
      const statusIcon = item.status === 'present' ? '✓  Present'
                       : item.status === 'generated' ? '⚙  Generated'
                       : item.status === 'missing_overridden' ? '⚠  Missing (override)'
                       : '✗  Missing';
      const location = item.in_pdf ? `PDF component ${pdfIdx}`
                     : item.in_zip ? `ZIP: ${item.filename ?? '—'}`
                     : '—';

      const scopeLabel = item.scope === 'project' ? 'Project'
                       : (item.item_code ?? item.requirement_name ?? 'Per item');

      doc.fill(FAINT).font('Helvetica').fontSize(7)
         .text(itemNum, M + 2, y + 3, { width: 18, lineBreak: false });
      doc.fill(INK).font('Helvetica').fontSize(7)
         .text(item.label + (item.requirement_name ? ` — ${item.item_code ?? item.requirement_name}` : ''),
           M + 22, y + 3, { width: 170, lineBreak: false });
      doc.fill(MUTED).fontSize(7)
         .text(scopeLabel, M + 195, y + 3, { width: 55, lineBreak: false });
      doc.fill(statusFg).font(item.status.startsWith('miss') ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
         .text(statusIcon, M + 252, y + 3, { width: 90, lineBreak: false });
      doc.fill(MUTED).font('Helvetica').fontSize(7)
         .text(location, M + 344, y + 3, { width: CW - 344 - 2, lineBreak: false });

      if (item.note) {
        y += ROW_H - 2;
        checkPage(10);
        doc.fill(MISS_FG).font('Helvetica-Oblique').fontSize(6.5)
           .text(`    ${item.note}`, M + 22, y + 1, { width: CW - 24, lineBreak: false });
        y += 10;
      } else {
        y += ROW_H;
      }
    }

    // Page footers
    const totalPages = (doc as unknown as { bufferedPageRange(): { count: number } }).bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      (doc as unknown as { switchToPage(n: number): void }).switchToPage(i);
      const fy = PH - M;
      doc.moveTo(M, fy - 18).lineTo(M + CW, fy - 18).strokeColor(BRAND_L).lineWidth(0.4).stroke();
      doc.fill(FAINT).font('Helvetica').fontSize(6.5)
         .text('Generated by LightSelect', M, fy - 12, { width: CW / 2, lineBreak: false })
         .text(`Page ${i + 1} of ${totalPages}`, M, fy - 12, { width: CW, align: 'right', lineBreak: false });
    }

    (doc as unknown as { flushPages(): void }).flushPages();
    doc.end();
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ─── Absolute path helper ─────────────────────────────────────────────────────

function absDocPath(storedPath: string): string {
  return path.join(process.cwd(), '..', storedPath);
}

// ─── buildPackageManifest ─────────────────────────────────────────────────────

export async function buildPackageManifest(projectId: string): Promise<PackageManifest> {
  const completeness = await buildSubmittalCompleteness(projectId);

  if (completeness.no_template) {
    return {
      project_id: projectId,
      template_id: '',
      template_name: '',
      generated_at: new Date().toISOString(),
      gate_state: 'blocked',
      items: [],
      pdf_component_count: 0,
      zip_component_count: 0,
    };
  }

  const [project] = await db
    .select({
      project_name:    projects.project_name,
      revision_label:  projects.revision_label,
      consultant_name: projects.consultant_name,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const templateItems = await db
    .select()
    .from(submittal_template_items)
    .where(eq(submittal_template_items.template_id, completeness.template_id!))
    .orderBy(asc(submittal_template_items.sort_order));

  const docs = await db
    .select()
    .from(project_documents)
    .where(eq(project_documents.project_id, projectId));

  const requirements = await db
    .select()
    .from(matching_requirements)
    .where(eq(matching_requirements.project_id, projectId))
    .orderBy(asc(matching_requirements.created_at));

  // Resolve all selections up-front
  const selections = await Promise.all(requirements.map(resolveRequirementSelection));

  // Check if there's an existing override log
  const [latestOverride] = await db
    .select({ override_reason: submittal_override_log.override_reason })
    .from(submittal_override_log)
    .where(eq(submittal_override_log.project_id, projectId))
    .orderBy(asc(submittal_override_log.overridden_at))
    .limit(1);

  const gate_state: PackageManifest['gate_state'] =
    completeness.is_export_ready ? 'ready'
    : latestOverride ? 'override_applied'
    : 'blocked';

  const items = buildManifestItems(templateItems, docs, selections, gate_state !== 'ready');

  return {
    project_id: projectId,
    template_id: completeness.template_id!,
    template_name: completeness.template_name!,
    generated_at: new Date().toISOString(),
    gate_state,
    items,
    pdf_component_count: items.filter((i) => i.in_pdf).length,
    zip_component_count: items.filter((i) => i.in_zip).length,
  };
}

// ─── buildManifestItems (pure data, no I/O) ───────────────────────────────────

function buildManifestItems(
  templateItems: (typeof submittal_template_items.$inferSelect)[],
  docs: (typeof project_documents.$inferSelect)[],
  selections: RequirementSelection[],
  hasIncomplete: boolean,
): PackageManifestItem[] {
  const items: PackageManifestItem[] = [];

  for (const ti of templateItems) {
    if (ti.scope === 'project') {
      // Find all project docs of this type (item_id may be null)
      const matching = docs.filter((d) => d.document_type === ti.document_type);

      if (matching.length > 0) {
        for (const doc of matching) {
          const isPdf = doc.mime_type === 'application/pdf';
          items.push({
            template_item_id: ti.id,
            sort_order:       ti.sort_order,
            label:            ti.label,
            document_type:    ti.document_type,
            scope:            'project',
            status:           'present',
            filename:         doc.original_filename,
            mime_type:        doc.mime_type ?? undefined,
            in_pdf:           isPdf,
            in_zip:           !isPdf,
            note:             !isPdf ? 'non-PDF attachment — included in companion ZIP' : undefined,
          });
        }
      } else {
        const isMissingOverridden = ti.required && hasIncomplete;
        items.push({
          template_item_id: ti.id,
          sort_order:       ti.sort_order,
          label:            ti.label,
          document_type:    ti.document_type,
          scope:            'project',
          status:           isMissingOverridden ? 'missing_overridden' : 'missing',
          in_pdf:           false,
          in_zip:           false,
          note:             ti.required ? 'required — not provided' : 'optional — not provided',
        });
      }
    } else {
      // per_item
      if (ti.document_type === 'compliance_statement') {
        for (const sel of selections) {
          items.push({
            template_item_id: ti.id,
            sort_order:       ti.sort_order,
            label:            ti.label,
            document_type:    ti.document_type,
            scope:            'per_item',
            requirement_id:   sel.requirement_id,
            requirement_name: sel.requirement_name,
            item_code:        sel.item_code ?? undefined,
            status:           'generated',
            in_pdf:           true,
            in_zip:           false,
            note: sel.is_stub
              ? 'no compliant candidate — stub sheet generated'
              : sel.is_override
                ? 'override — proposed against engine assessment'
                : undefined,
          });
        }
      } else {
        for (const sel of selections) {
          const matching = docs.filter(
            (d) => d.item_id === sel.requirement_id && d.document_type === ti.document_type,
          );

          if (matching.length > 0) {
            for (const doc of matching) {
              const isPdf = doc.mime_type === 'application/pdf';
              items.push({
                template_item_id: ti.id,
                sort_order:       ti.sort_order,
                label:            ti.label,
                document_type:    ti.document_type,
                scope:            'per_item',
                requirement_id:   sel.requirement_id,
                requirement_name: sel.requirement_name,
                item_code:        sel.item_code ?? undefined,
                status:           'present',
                filename:         doc.original_filename,
                mime_type:        doc.mime_type ?? undefined,
                in_pdf:           isPdf,
                in_zip:           !isPdf,
                note:             !isPdf ? 'non-PDF attachment — included in companion ZIP' : undefined,
              });
            }
          } else {
            const isMissingOverridden = ti.required && hasIncomplete;
            items.push({
              template_item_id: ti.id,
              sort_order:       ti.sort_order,
              label:            ti.label,
              document_type:    ti.document_type,
              scope:            'per_item',
              requirement_id:   sel.requirement_id,
              requirement_name: sel.requirement_name,
              item_code:        sel.item_code ?? undefined,
              status:           isMissingOverridden ? 'missing_overridden' : 'missing',
              in_pdf:           false,
              in_zip:           false,
              note:             ti.required ? 'required — not provided' : 'optional — not provided',
            });
          }
        }
      }
    }
  }

  return items;
}

// ─── assembleSubmittalPackage ─────────────────────────────────────────────────

export async function assembleSubmittalPackage(
  projectId: string,
  options?: { is_override?: boolean; override_reason?: string },
): Promise<AssembledPackage> {
  const completeness = await buildSubmittalCompleteness(projectId);

  if (completeness.no_template) {
    throw new AppError(422, 'No submittal template assigned to this project.', 'NO_SUBMITTAL_TEMPLATE');
  }

  // Gate check
  const [latestOverride] = await db
    .select({ override_reason: submittal_override_log.override_reason })
    .from(submittal_override_log)
    .where(eq(submittal_override_log.project_id, projectId))
    .orderBy(asc(submittal_override_log.overridden_at))
    .limit(1);

  const existingOverride = !!latestOverride;
  const isOverride = options?.is_override ?? existingOverride;

  if (!completeness.is_export_ready && !isOverride) {
    throw new AppError(422, 'Export blocked: submittal is incomplete. Run gate check with override to proceed.', 'SUBMITTAL_INCOMPLETE');
  }

  // Log override if newly requested
  if (!completeness.is_export_ready && options?.is_override && !existingOverride) {
    const missingItems = [
      ...completeness.project_scope_items
        .filter((i) => i.required && !i.satisfied)
        .map((i) => `[project] ${i.label}`),
      ...completeness.per_item_rows.flatMap((row) =>
        row.items.filter((i) => i.required && !i.satisfied)
          .map((i) => `[${row.item_code ?? row.requirement_name}] ${i.label}`),
      ),
    ];
    await db.insert(submittal_override_log).values({
      project_id:      projectId,
      template_id:     completeness.template_id,
      missing_items:   missingItems,
      override_reason: options.override_reason ?? null,
    });
  }

  const gate_state: PackageManifest['gate_state'] =
    completeness.is_export_ready ? 'ready' : 'override_applied';

  // Load project + template + requirements
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const [template] = await db
    .select()
    .from(submittal_templates)
    .where(eq(submittal_templates.id, completeness.template_id!))
    .limit(1);

  const templateItems = await db
    .select()
    .from(submittal_template_items)
    .where(eq(submittal_template_items.template_id, completeness.template_id!))
    .orderBy(asc(submittal_template_items.sort_order));

  const docs = await db
    .select()
    .from(project_documents)
    .where(eq(project_documents.project_id, projectId));

  const requirements = await db
    .select()
    .from(matching_requirements)
    .where(eq(matching_requirements.project_id, projectId))
    .orderBy(asc(matching_requirements.created_at));

  const selections = await Promise.all(requirements.map(resolveRequirementSelection));

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const projectSlug = (project?.project_name ?? 'package')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

  // Spine metadata options (shared across all CS items)
  const spineBase = {
    project_name: project?.project_name ?? 'LightSelect Project',
    consultant:   template?.consultant ?? completeness.template_name ?? 'AECOM',
    date:         today,
    revision:     project?.revision_label ?? 'Rev A',
  };

  // ── Build manifest items ──────────────────────────────────────────────────

  const manifestItems = buildManifestItems(
    templateItems, docs, selections, gate_state !== 'ready',
  );

  // ── Assemble PDF components ────────────────────────────────────────────────

  const pdfBuffers: Buffer[] = [];
  const zipFiles: { name: string; data: Buffer }[] = [];
  let pdfComponentIdx = 1; // 1 = index page (added last once count is known)

  // Walk manifest items to gather PDF buffers and ZIP files
  const docMap = new Map(docs.map((d) => [d.id, d]));

  for (const item of manifestItems) {
    if (item.status === 'missing' || item.status === 'missing_overridden') {
      // Not in PDF, not in ZIP — only visible in index
      continue;
    }

    if (item.document_type === ('compliance_statement' as SubmittalDocumentType)) {
      const sel = selections.find((s) => s.requirement_id === item.requirement_id);
      if (!sel) continue;

      try {
        const stmt = sel.is_stub
          ? await MatchDecisionExportSource.resolveStub(db, sel.requirement_id, {
              ...spineBase,
              item_code: sel.item_code ?? undefined,
              item_type: sel.requirement_name,
            })
          : await MatchDecisionExportSource.resolve(
              db,
              sel.requirement_id,
              sel.canonical_product_id ?? undefined,
              {
                ...spineBase,
                item_code:   sel.item_code ?? undefined,
                item_type:   sel.requirement_name,
                is_override: sel.is_override,
              },
            );

        const pdfBuf = await renderStatement(stmt, 'aecom-pdf');
        pdfBuffers.push(pdfBuf);
        item.pdf_component_index = ++pdfComponentIdx;
      } catch (err) {
        item.note = `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`;
        item.in_pdf = false;
        item.status = 'missing';
      }
    } else if (item.in_pdf || item.in_zip) {
      // Find the matching project doc
      const doc = docs.find(
        (d) =>
          d.document_type === item.document_type &&
          (item.scope === 'project' || d.item_id === item.requirement_id) &&
          d.original_filename === item.filename,
      );
      if (!doc) continue;

      const absPath = absDocPath(doc.stored_path);
      if (!fs.existsSync(absPath)) {
        item.note = (item.note ? item.note + '; ' : '') + 'file not found on disk — omitted';
        item.in_pdf = false;
        item.in_zip = false;
        continue;
      }

      const fileBuf = fs.readFileSync(absPath);

      if (item.in_pdf) {
        pdfBuffers.push(fileBuf);
        item.pdf_component_index = ++pdfComponentIdx;
      } else if (item.in_zip) {
        zipFiles.push({ name: item.filename!, data: fileBuf });
      }
    }
  }

  // ── Generate index PDF (prepend to merge) ─────────────────────────────────

  const indexPdf = await generateIndexPdf(
    project?.project_name ?? projectId,
    completeness.template_name ?? '',
    project?.revision_label ?? null,
    gate_state,
    manifestItems,
  );

  // Merge: index first, then all component PDFs
  const mergedPdf = await mergePdfs([indexPdf, ...pdfBuffers]);

  // ── Build companion ZIP (non-PDF attachments only) ─────────────────────────

  let zip: Buffer | null = null;
  if (zipFiles.length > 0) {
    zip = await buildZipBuffer(zipFiles);
  }

  // ── Assemble final manifest ────────────────────────────────────────────────

  const manifest: PackageManifest = {
    project_id:          projectId,
    template_id:         completeness.template_id!,
    template_name:       completeness.template_name!,
    generated_at:        new Date().toISOString(),
    gate_state,
    items:               manifestItems,
    pdf_component_count: manifestItems.filter((i) => i.in_pdf).length + 1, // +1 for index
    zip_component_count: zipFiles.length,
  };

  return {
    manifest,
    pdf:          mergedPdf,
    zip,
    pdf_filename: `submittal-${projectSlug}-${dateSlug}.pdf`,
    zip_filename: zip ? `submittal-attachments-${projectSlug}-${dateSlug}.zip` : null,
  };
}
