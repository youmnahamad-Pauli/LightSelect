/**
 * Export artifact orchestrator.
 *
 * Phase 0 seam: generateArtifact() now routes through ExportSource so the
 * renderers (generateBoqXlsx, generatePackagePdf) are pure functions of
 * their inputs — no internal DB calls. Behaviour is identical.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { export_package_artifacts } from '../db/schema/exports';
import { config } from '../config';
import { generatePackagePdf } from './export-pdf';
import { generateExportZip } from './export-zip';
import { LegacyExportSource } from './export-source';
import type { ArtifactInput, ExportSource } from './export-source';
import type { ExportPackageItem, ExportPackageBoqItem } from '../db/schema/exports';
import type { LuminaireComplianceBlock, ComplianceVerdict } from './compliance-statement';
import type { ChecklistSnapshot, BoqSnapshot } from './export-snapshot';

// ─── Brand colours ─────────────────────────────────────────────────────────
const BRAND_ARGB      = 'FF7B5A43';
const HEADER_TEXT_ARGB = 'FFFCFAF7';
const ALT_ROW_ARGB    = 'FFFAF8F4';
const TOTALS_ROW_ARGB = 'FFE8D9CB';

const COMP_STRONG_ARGB     = 'FF2D6A4F';
const COMP_ACCEPTABLE_ARGB = 'FF5E7A5F';
const COMP_WEAK_ARGB       = 'FFA06A3B';
const COMP_POOR_ARGB       = 'FFA14B3B';

// ─── Compliance-statement colours ──────────────────────────────────────────
const CS_COMPLY_BG    = 'FFE8F5E9';
const CS_COMPLY_TEXT  = 'FF2D6A4F';
const CS_REVIEW_BG    = 'FFE3F2FD';
const CS_REVIEW_TEXT  = 'FF1565C0';
const CS_DEV_BG       = 'FFFDE8E8';
const CS_DEV_TEXT     = 'FFC62828';
const CS_MISS_BG      = 'FFFFF3E0';
const CS_MISS_TEXT    = 'FFE65100';
const CS_OVERRIDE_TEXT = 'FF795548';

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
// ArtifactInput is now canonical in export-source.ts; re-exported here for
// backward compat with existing import sites.
export type { ArtifactInput } from './export-source';

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

// ─── Compliance-statement helpers ─────────────────────────────────────────

function verdictLabel(verdict: ComplianceVerdict): string {
  switch (verdict) {
    case 'comply':              return '✓  Comply';
    case 'comply_with_comment': return '~  Review';
    case 'deviation':           return '✗  Deviation';
    case 'missing':             return '—  Missing';
  }
}

function applyVerdictCell(cell: ExcelJS.Cell, verdict: ComplianceVerdict): void {
  const styles: Record<ComplianceVerdict, { bg: string; text: string }> = {
    comply:              { bg: CS_COMPLY_BG, text: CS_COMPLY_TEXT },
    comply_with_comment: { bg: CS_REVIEW_BG, text: CS_REVIEW_TEXT },
    deviation:           { bg: CS_DEV_BG,    text: CS_DEV_TEXT   },
    missing:             { bg: CS_MISS_BG,   text: CS_MISS_TEXT  },
  };
  const s = styles[verdict];
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.bg } };
  cell.font = {
    bold: verdict === 'deviation' || verdict === 'missing',
    color: { argb: s.text },
    size: 9,
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

/**
 * Adds "Compliance Statement" as sheet 3 in the workbook.
 * One block per BOQ luminaire type that has requirements.
 * Silently skips if blocks is empty.
 */
function addComplianceSheet(
  wb: ExcelJS.Workbook,
  blocks: LuminaireComplianceBlock[],
): void {
  const relevant = blocks.filter((b) => b.rows.length > 0);
  if (relevant.length === 0) return;

  const ws = wb.addWorksheet('Compliance Statement', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = [
    { key: 'no',        width: 5  },
    { key: 'attribute', width: 24 },
    { key: 'priority',  width: 11 },
    { key: 'specified', width: 22 },
    { key: 'proposed',  width: 22 },
    { key: 'verdict',   width: 20 },
    { key: 'notes',     width: 38 },
  ];

  // Sheet title row
  const titleRow = ws.addRow(['COMPLIANCE STATEMENT — SPECIFIED vs PROPOSED']);
  ws.mergeCells(`A${titleRow.number}:G${titleRow.number}`);
  titleRow.height = 24;
  titleRow.getCell(1).font  = { bold: true, size: 12, color: { argb: HEADER_TEXT_ARGB } };
  titleRow.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
  titleRow.getCell(1).alignment = { vertical: 'middle' };
  ws.addRow([]);

  for (let blockIdx = 0; blockIdx < relevant.length; blockIdx++) {
    const block = relevant[blockIdx];
    const typeNum = blockIdx + 1;

    // ── Block header ───────────────────────────────────────────────────────
    const hdRow = ws.addRow([`Type ${typeNum} — ${block.description}`]);
    ws.mergeCells(`A${hdRow.number}:G${hdRow.number}`);
    hdRow.height = 20;
    hdRow.getCell(1).font      = { bold: true, size: 10.5, color: { argb: HEADER_TEXT_ARGB } };
    hdRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
    hdRow.getCell(1).alignment = { vertical: 'middle' };

    // ── Product + qty row ──────────────────────────────────────────────────
    const prodRow = ws.addRow([`Proposed: ${block.product_label}`]);
    ws.mergeCells(`A${prodRow.number}:F${prodRow.number}`);
    prodRow.height = 16;
    prodRow.getCell(1).font  = { size: 9, italic: true, color: { argb: 'FF5D4037' } };
    prodRow.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_ARGB } };
    prodRow.getCell(7).value = `Qty: ${block.quantity} ${block.unit}`;
    prodRow.getCell(7).font  = { size: 9, italic: true, color: { argb: 'FF5D4037' } };
    prodRow.getCell(7).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_ARGB } };
    prodRow.getCell(7).alignment = { horizontal: 'right' };

    // ── Source note ────────────────────────────────────────────────────────
    const sourceLabel = block.source === 'comparison_run'
      ? 'Source: Stored comparison run (includes manual overrides)'
      : 'Source: Live calculation from BOQ spec profile';
    const srcRow = ws.addRow([sourceLabel]);
    ws.mergeCells(`A${srcRow.number}:G${srcRow.number}`);
    srcRow.height = 13;
    srcRow.getCell(1).font = { size: 7.5, italic: true, color: { argb: 'FF8A8178' } };

    // ── Table header ───────────────────────────────────────────────────────
    const tblHdr = ws.addRow(['#', 'Attribute', 'Priority', 'Specified', 'Proposed Value', 'Verdict', 'Notes / Reason']);
    applyHeaderStyle(tblHdr);
    tblHdr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    tblHdr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    tblHdr.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

    // ── Data rows ──────────────────────────────────────────────────────────
    for (const [i, row] of block.rows.entries()) {
      const notesText = row.is_overridden
        ? `Overridden${row.override_notes ? ': ' + row.override_notes : ''}`
        : (row.deviation_reason ?? '');

      const dataRow = ws.addRow([
        i + 1,
        row.attribute_label,
        row.priority.toUpperCase(),
        row.specified_display,
        row.proposed_value ?? '—',
        verdictLabel(row.verdict),
        notesText,
      ]);

      dataRow.height = 15;
      dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

      // Priority column: bold + dark for mandatory
      if (row.priority === 'mandatory') {
        dataRow.getCell(3).font = { bold: true, size: 9 };
      } else {
        dataRow.getCell(3).font = { size: 9, color: { argb: '8A8178' } };
      }

      // Alt-row base fill (applied first so verdict cell can override it)
      applyAltRowFill(dataRow, i);

      // Verdict cell (overrides alt-row fill)
      applyVerdictCell(dataRow.getCell(6), row.verdict);

      // Override indicator in notes column
      if (row.is_overridden) {
        dataRow.getCell(7).font = { size: 8.5, italic: true, color: { argb: CS_OVERRIDE_TEXT } };
      }
    }

    // ── Summary row ────────────────────────────────────────────────────────
    const hasIssues = block.deviated_count > 0 || block.missing_count > 0;
    const sumRow = ws.addRow([
      '',
      'SUMMARY',
      '',
      `✓ Comply: ${block.compliant_count}`,
      `~ Review: ${block.review_needed_count}`,
      `✗ Dev: ${block.deviated_count}   — Missing: ${block.missing_count}`,
      '',
    ]);
    applyTotalsStyle(sumRow);
    sumRow.getCell(4).font = { bold: true, color: { argb: CS_COMPLY_TEXT } };
    sumRow.getCell(5).font = { bold: true, color: { argb: CS_REVIEW_TEXT } };
    sumRow.getCell(6).font = { bold: true, color: { argb: hasIssues ? CS_DEV_TEXT : CS_COMPLY_TEXT } };

    ws.addRow([]); // gap between types
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ─── XLSX generator ────────────────────────────────────────────────────────

/**
 * Renders the XLSX workbook from pre-resolved data.
 * Pure function — no DB access. Exported for testing.
 */
export async function generateBoqXlsx(
  projectMeta: { project_name: string; client_name: string | null; project_code: string | null; revision_label: string | null },
  activeSpec: { title: string; version_label: string } | null,
  checklistSnapshot: ChecklistSnapshot,
  boqSnapshot: BoqSnapshot,
  complianceBlocks: LuminaireComplianceBlock[] | null,
  // Snapshot rows — pre-fetched by LegacyExportSource (formerly queried internally)
  boqRows: ExportPackageBoqItem[],
  sectionItems: ExportPackageItem[],
): Promise<Buffer> {

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

  // ── Sheet 3: Compliance Statement (omitted if no compliance data) ─────────
  if (complianceBlocks) addComplianceSheet(wb, complianceBlocks);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Main entry points ─────────────────────────────────────────────────────

/**
 * Public API — unchanged signature.
 * Resolves the ExportSource via LegacyExportSource then delegates to
 * generateArtifactFromSource. Behaviour is identical to the pre-seam code.
 */
export async function generateArtifact(input: ArtifactInput): Promise<ArtifactOutput> {
  const source = await LegacyExportSource.resolve(input);
  return generateArtifactFromSource(source);
}

/**
 * The core renderer — takes a fully-resolved ExportSource, writes files
 * to disk, persists artifact rows, and returns the primary artifact path.
 *
 * Exported for testing: supply fixture ExportSource without touching the DB.
 */
export async function generateArtifactFromSource(source: ExportSource): Promise<ArtifactOutput> {
  const {
    exportPackageId, orgId,
    projectMeta, pdfBranding, activeSpec,
    checklistSnapshot, boqSnapshot,
    complianceBlocks,
    packageBoqItems, packageSectionItems,
  } = source;

  const dir = path.join(config.uploadsDir, orgId, 'exports', exportPackageId);
  fs.mkdirSync(dir, { recursive: true });

  // ── 1. Generate XLSX (primary) ─────────────────────────────────────────

  const xlsxBuffer = await generateBoqXlsx(
    projectMeta, activeSpec, checklistSnapshot, boqSnapshot, complianceBlocks,
    packageBoqItems, packageSectionItems,
  );
  const xlsxFileName = 'boq-schedule.xlsx';
  fs.writeFileSync(path.join(dir, xlsxFileName), xlsxBuffer);

  const xlsxPath = `${orgId}/exports/${exportPackageId}/${xlsxFileName}`;
  const xlsxUrl  = `/exports/${exportPackageId}/download`;

  await persistArtifact(exportPackageId, 'xlsx', 'BOQ Workbook', xlsxPath, xlsxUrl, 0);

  // ── 2. Generate PDF (secondary) ────────────────────────────────────────

  let pdfAbsPath: string | null = null;

  try {
    const pdfBuffer = await generatePackagePdf({
      project: projectMeta,
      activeSpec,
      checklistSnapshot,
      boqSnapshot,
      branding: pdfBranding,
      complianceBlocks,
      packageSectionItems,
      packageBoqItems,
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
