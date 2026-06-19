/**
 * Export artifact orchestrator.
 *
 * Priority 13: XLSX primary artifact.
 * Priority 16: PDF secondary artifact (stored in export_package_artifacts).
 *
 * Upgrade path for future renderers:
 *   - Add a generator function and call it here.
 *   - Store results via storeArtifact().
 *   - No DB schema changes needed.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { export_package_items, export_package_boq_items, export_package_artifacts } from '../db/schema/exports';
import { projects } from '../db/schema/projects';
import { project_spec_documents } from '../db/schema/spec';
import { config } from '../config';
import { generatePackagePdf } from './export-pdf';
import { generateExportZip } from './export-zip';
import { consultant_templates } from '../db/schema/projects';
import type { ChecklistSnapshot, BoqSnapshot } from './export-snapshot';
import type { PdfBranding } from './export-pdf';

// ─── Brand colours ─────────────────────────────────────────────────────────
const BRAND_ARGB      = 'FF7B5A43';
const HEADER_TEXT_ARGB = 'FFFCFAF7';
const ALT_ROW_ARGB    = 'FFFAF8F4';
const TOTALS_ROW_ARGB = 'FFE8D9CB';

const COMP_STRONG_ARGB     = 'FF2D6A4F';
const COMP_ACCEPTABLE_ARGB = 'FF5E7A5F';
const COMP_WEAK_ARGB       = 'FFA06A3B';
const COMP_POOR_ARGB       = 'FFA14B3B';

// ─── Compliance helpers ────────────────────────────────────────────────────

function complianceText(score: number | null): string {
  if (score == null) return 'No data';
  const pct = Math.round(score * 100);
  if (score >= 0.80) return `${pct}% — Strong`;
  if (score >= 0.55) return `${pct}% — Acceptable`;
  if (score >= 0.25) return `${pct}% — Weak`;
  return `${pct}% — Poor`;
}

function complianceARGB(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 0.80) return COMP_STRONG_ARGB;
  if (score >= 0.55) return COMP_ACCEPTABLE_ARGB;
  if (score >= 0.25) return COMP_WEAK_ARGB;
  return COMP_POOR_ARGB;
}

// ─── Artifact I/O ─────────────────────────────────────────────────────────

export interface ArtifactInput {
  exportPackageId: string;
  projectId: string;
  orgId: string;
  checklistSnapshot: ChecklistSnapshot;
  boqSnapshot: BoqSnapshot;
  activeSpecDocumentId: string | null;
}

export interface ArtifactOutput {
  /** Primary artifact type (XLSX). Kept on export_packages for backward compat. */
  artifact_type: 'xlsx' | 'pdf' | 'placeholder';
  artifact_path: string;
  artifact_url: string;
}

export interface StoredArtifact {
  id: string;
  artifact_type: string;
  label: string;
  artifact_path: string;
  artifact_url: string | null;
  error_message: string | null;
}

export function resolveContentType(artifactType: string): string {
  switch (artifactType) {
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':  return 'application/pdf';
    case 'zip':  return 'application/zip';
    default:     return 'application/json';
  }
}

export function resolveFileExtension(artifactType: string): string {
  switch (artifactType) {
    case 'xlsx': return 'xlsx';
    case 'pdf':  return 'pdf';
    case 'zip':  return 'zip';
    default:     return 'json';
  }
}

export function resolveArtifactPath(artifactPath: string): string {
  return path.join(config.uploadsDir, artifactPath);
}

// ─── Persist an artifact to the artifacts table ────────────────────────────

async function persistArtifact(
  exportPackageId: string,
  artifactType: 'xlsx' | 'pdf' | 'zip',
  label: string,
  artifactPath: string,
  artifactUrl: string,
  sortOrder: number,
  errorMessage?: string,
): Promise<void> {
  await db.insert(export_package_artifacts).values({
    export_package_id: exportPackageId,
    artifact_type: artifactType,
    label,
    artifact_path: artifactPath,
    artifact_url: artifactUrl,
    sort_order: sortOrder,
    error_message: errorMessage ?? null,
  });
}

// ─── XLSX helpers ──────────────────────────────────────────────────────────

function applyHeaderStyle(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND_ARGB } } };
  });
}

function applyAltRowFill(row: ExcelJS.Row, index: number): void {
  if (index % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_ARGB } };
    });
  }
}

function applyTotalsStyle(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALS_ROW_ARGB } };
    cell.border = { top: { style: 'thin', color: { argb: BRAND_ARGB } } };
  });
}

function numFmt(cell: ExcelJS.Cell, value: number | null | undefined, format = '#,##0.00'): void {
  if (value != null) { cell.value = value; cell.numFmt = format; }
  else { cell.value = null; }
}

// ─── XLSX generator ────────────────────────────────────────────────────────

async function generateBoqXlsx(
  exportPackageId: string,
  projectMeta: { project_name: string; client_name: string | null; project_code: string | null; revision_label: string | null },
  activeSpec: { title: string; version_label: string } | null,
  checklistSnapshot: ChecklistSnapshot,
  boqSnapshot: BoqSnapshot,
): Promise<Buffer> {
  const boqRows = await db
    .select()
    .from(export_package_boq_items)
    .where(eq(export_package_boq_items.export_package_id, exportPackageId))
    .orderBy(asc(export_package_boq_items.sort_order));

  const sectionItems = await db
    .select()
    .from(export_package_items)
    .where(eq(export_package_items.export_package_id, exportPackageId))
    .orderBy(asc(export_package_items.section_order), asc(export_package_items.sort_order));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LightSelect';
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  // ── Sheet 1: BOQ Schedule ─────────────────────────────────────────────────

  const boqSheet = wb.addWorksheet('BOQ Schedule', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  boqSheet.columns = [
    { header: 'No.',           key: 'no',          width: 6  },
    { header: 'Description',   key: 'description', width: 38 },
    { header: 'Category',      key: 'category',    width: 20 },
    { header: 'Qty',           key: 'qty',         width: 9  },
    { header: 'Unit',          key: 'unit',        width: 8  },
    { header: 'Product',       key: 'product',     width: 28 },
    { header: 'Manufacturer',  key: 'manufacturer',width: 20 },
    { header: 'Model',         key: 'model',       width: 20 },
    { header: 'Match Quality', key: 'compliance',  width: 18 },
    { header: 'Unit Price',    key: 'unit_price',  width: 14 },
    { header: 'Total Price',   key: 'total_price', width: 14 },
    { header: 'Currency',      key: 'currency',    width: 10 },
  ];

  applyHeaderStyle(boqSheet.getRow(1));

  let totalQty = 0;
  let totalPrice = 0;
  let hasPricing = false;

  for (const [i, row] of boqRows.entries()) {
    const dataRow = boqSheet.addRow({
      no: i + 1,
      description: row.description ?? '',
      category: row.category_name ?? '',
      qty: row.quantity ?? 0,
      unit: row.unit ?? 'pcs',
      product: row.product_name ?? (row.product_name === null ? '(no product)' : ''),
      manufacturer: row.manufacturer ?? '',
      model: row.model_code ?? '',
      compliance: complianceText(row.compliance_score),
      unit_price: row.unit_price ?? null,
      total_price: row.total_price ?? null,
      currency: row.currency ?? '',
    });

    applyAltRowFill(dataRow, i);

    const rowNum = dataRow.number;

    const qtyCell = boqSheet.getCell(`D${rowNum}`);
    qtyCell.numFmt = '#,##0.##';
    qtyCell.alignment = { horizontal: 'right' };

    const compCell = boqSheet.getCell(`I${rowNum}`);
    compCell.alignment = { horizontal: 'center' };
    const compColor = complianceARGB(row.compliance_score);
    if (compColor) {
      compCell.font = { color: { argb: compColor }, bold: row.compliance_score != null && row.compliance_score < 0.55 };
    } else {
      compCell.font = { color: { argb: 'FF8A8178' } };
    }

    numFmt(boqSheet.getCell(`J${rowNum}`), row.unit_price);
    boqSheet.getCell(`J${rowNum}`).alignment = { horizontal: 'right' };
    numFmt(boqSheet.getCell(`K${rowNum}`), row.total_price);
    boqSheet.getCell(`K${rowNum}`).alignment = { horizontal: 'right' };

    totalQty += row.quantity ?? 0;
    if (row.total_price != null) { totalPrice += row.total_price; hasPricing = true; }
  }

  const totalsRow = boqSheet.addRow({
    no: '', description: 'TOTAL', category: '', qty: totalQty,
    unit: '', product: '', manufacturer: '', model: '', compliance: '',
    unit_price: '', total_price: hasPricing ? totalPrice : null, currency: boqRows[0]?.currency ?? '',
  });
  applyTotalsStyle(totalsRow);
  const tR = totalsRow.number;
  boqSheet.getCell(`D${tR}`).numFmt = '#,##0.##';
  boqSheet.getCell(`D${tR}`).alignment = { horizontal: 'right' };
  if (hasPricing) { boqSheet.getCell(`K${tR}`).numFmt = '#,##0.00'; boqSheet.getCell(`K${tR}`).alignment = { horizontal: 'right' }; }

  boqSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────

  const sumSheet = wb.addWorksheet('Summary');
  sumSheet.columns = [{ key: 'label', width: 32 }, { key: 'value', width: 48 }];

  function addSummarySection(title: string): void {
    const row = sumSheet.addRow([title]);
    row.font = { bold: true, size: 12, color: { argb: HEADER_TEXT_ARGB } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
    row.height = 20;
    sumSheet.mergeCells(`A${row.number}:B${row.number}`);
  }

  function addSummaryRow(label: string, value: string | number | null): void {
    const r = sumSheet.addRow([label, value ?? '—']);
    r.getCell(1).font = { bold: false, color: { argb: 'FF6F685F' } };
  }

  function addBlank(): void { sumSheet.addRow([]); }

  addSummarySection('Project Information');
  addSummaryRow('Project Name', projectMeta.project_name);
  addSummaryRow('Client', projectMeta.client_name);
  addSummaryRow('Project Code', projectMeta.project_code);
  addSummaryRow('Revision', projectMeta.revision_label);
  addSummaryRow('Generated At', new Date().toLocaleString());
  addBlank();

  if (activeSpec) {
    addSummarySection('Active Specification');
    addSummaryRow('Title', activeSpec.title);
    addSummaryRow('Version', activeSpec.version_label);
    addBlank();
  }

  addSummarySection('Checklist Status');
  addSummaryRow('Template', checklistSnapshot.template_name);
  addSummaryRow('Sections Complete', `${checklistSnapshot.complete_count} of ${checklistSnapshot.total_required}`);
  addSummaryRow('Export Ready', checklistSnapshot.is_export_ready ? 'Yes' : 'No');
  if (checklistSnapshot.waived_count > 0) addSummaryRow('Waived Items', String(checklistSnapshot.waived_count));
  addBlank();

  addSummarySection('BOQ Summary');
  addSummaryRow('Total Line Items', String(boqSnapshot.total_items));
  addSummaryRow('Total Quantity', String(boqSnapshot.total_quantity));
  if (boqSnapshot.total_price != null) {
    addSummaryRow('Total Price', `${boqSnapshot.currency ?? ''} ${boqSnapshot.total_price.toFixed(2)}`);
  }
  addSummaryRow('Items with Product Assigned', `${boqSnapshot.items_with_product} of ${boqSnapshot.total_items}`);
  addSummaryRow('Items without Product', String(boqSnapshot.total_items - boqSnapshot.items_with_product));
  addBlank();

  if (boqSnapshot.total_items > 0) {
    addSummarySection('Product Compliance vs Specification');
    const cb = boqSnapshot.compliance_bands;
    addSummaryRow('Strong (≥80% match)',       String(cb.fully_compliant + cb.mostly_compliant));
    addSummaryRow('Acceptable (55–79% match)', String(cb.partially_compliant));
    addSummaryRow('Weak / Poor (<55% match)',  String(cb.poor_or_missing));
    addSummaryRow('Note', 'Match Quality based on weighted attribute comparison against active spec');
    addBlank();
  }

  const sectionMap = new Map<string, { name: string; order: number; is_required: boolean; count: number }>();
  for (const item of sectionItems) {
    const key = `${item.section_order}-${item.section_name}`;
    if (!sectionMap.has(key)) sectionMap.set(key, { name: item.section_name, order: item.section_order, is_required: item.is_section_required, count: 0 });
    if (item.file_name) sectionMap.get(key)!.count++;
  }

  if (sectionMap.size > 0) {
    addSummarySection('Package Sections');
    for (const sec of Array.from(sectionMap.values()).sort((a, b) => a.order - b.order)) {
      addSummaryRow(`${sec.order}. ${sec.name}${sec.is_required ? ' *' : ''}`, `${sec.count} file${sec.count !== 1 ? 's' : ''}`);
    }
    addBlank();
    addSummaryRow('* Required sections', '');
    addBlank();
  }

  addSummarySection('Match Quality Legend');
  addSummaryRow('Strong (≥80%)',      'Product meets all key spec requirements');
  addSummaryRow('Acceptable (55–79%)', 'Product meets most requirements; minor gaps');
  addSummaryRow('Weak (<55%)',        'Product has significant deviations; review recommended');
  addSummaryRow('No data',            'No product assigned or no comparison run yet');

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Main entry point ──────────────────────────────────────────────────────

export async function generateArtifact(input: ArtifactInput): Promise<ArtifactOutput> {
  const { exportPackageId, projectId, orgId } = input;

  const [project] = await db
    .select({
      project_name: projects.project_name,
      client_name: projects.client_name,
      project_code: projects.project_code,
      revision_label: projects.revision_label,
      consultant_template_id: projects.consultant_template_id,
    })
    .from(projects).where(eq(projects.id, projectId)).limit(1);

  // Load consultant branding for PDF header
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

  let activeSpec: { title: string; version_label: string } | null = null;
  if (input.activeSpecDocumentId) {
    const [doc] = await db
      .select({ title: project_spec_documents.title, version_label: project_spec_documents.version_label })
      .from(project_spec_documents).where(eq(project_spec_documents.id, input.activeSpecDocumentId)).limit(1);
    activeSpec = doc ?? null;
  }

  const dir = path.join(config.uploadsDir, orgId, 'exports', exportPackageId);
  fs.mkdirSync(dir, { recursive: true });

  const projectMeta = {
    project_name: project?.project_name ?? 'Unknown Project',
    client_name: project?.client_name ?? null,
    project_code: project?.project_code ?? null,
    revision_label: project?.revision_label ?? null,
  };

  // ── 1. Generate XLSX (primary) ─────────────────────────────────────────

  const xlsxBuffer = await generateBoqXlsx(exportPackageId, projectMeta, activeSpec, input.checklistSnapshot, input.boqSnapshot);
  const xlsxFileName = 'boq-schedule.xlsx';
  fs.writeFileSync(path.join(dir, xlsxFileName), xlsxBuffer);

  const xlsxPath = `${orgId}/exports/${exportPackageId}/${xlsxFileName}`;
  const xlsxUrl  = `/exports/${exportPackageId}/download`;

  // Mirror XLSX into artifacts table (sort_order 0)
  await persistArtifact(exportPackageId, 'xlsx', 'BOQ Workbook', xlsxPath, xlsxUrl, 0);

  // ── 2. Generate PDF (secondary) ────────────────────────────────────────

  let pdfAbsPath: string | null = null;

  try {
    const pdfBuffer = await generatePackagePdf({
      exportPackageId,
      project: projectMeta,
      activeSpec,
      checklistSnapshot: input.checklistSnapshot,
      boqSnapshot: input.boqSnapshot,
      branding: pdfBranding,
    });

    const pdfFileName = 'package-summary.pdf';
    pdfAbsPath = path.join(dir, pdfFileName);
    fs.writeFileSync(pdfAbsPath, pdfBuffer);

    const pdfPath = `${orgId}/exports/${exportPackageId}/${pdfFileName}`;
    const pdfUrl  = `/exports/${exportPackageId}/artifacts/pdf/download`;

    await persistArtifact(exportPackageId, 'pdf', 'Package Summary PDF', pdfPath, pdfUrl, 1);
  } catch (pdfErr) {
    const msg = pdfErr instanceof Error ? pdfErr.message : 'PDF generation failed';
    console.error(`[export-artifact] PDF generation failed for ${exportPackageId}: ${msg}`);
    await persistArtifact(exportPackageId, 'pdf', 'Package Summary PDF',
      `${orgId}/exports/${exportPackageId}/package-summary.pdf`,
      `/exports/${exportPackageId}/artifacts/pdf/download`,
      1, msg,
    ).catch(() => {});
  }

  // ── 3. Generate ZIP bundle (tertiary) ─────────────────────────────────

  try {
    const zipFileName = 'export-bundle.zip';
    const zipAbsPath  = path.join(dir, zipFileName);
    const xlsxAbsPath = path.join(config.uploadsDir, xlsxPath);

    await generateExportZip({
      projectName: projectMeta.project_name,
      xlsxAbsPath: fs.existsSync(xlsxAbsPath) ? xlsxAbsPath : null,
      pdfAbsPath,
      outputAbsPath: zipAbsPath,
    });

    const zipStoragePath = `${orgId}/exports/${exportPackageId}/${zipFileName}`;
    const zipUrl = `/exports/${exportPackageId}/artifacts/zip/download`;

    await persistArtifact(exportPackageId, 'zip', 'Export Bundle (.zip)', zipStoragePath, zipUrl, 2);
  } catch (zipErr) {
    const msg = zipErr instanceof Error ? zipErr.message : 'ZIP generation failed';
    console.error(`[export-artifact] ZIP generation failed for ${exportPackageId}: ${msg}`);
    await persistArtifact(exportPackageId, 'zip', 'Export Bundle (.zip)',
      `${orgId}/exports/${exportPackageId}/export-bundle.zip`,
      `/exports/${exportPackageId}/artifacts/zip/download`,
      2, msg,
    ).catch(() => {});
  }

  return { artifact_type: 'xlsx', artifact_path: xlsxPath, artifact_url: xlsxUrl };
}
