/**
 * Phase 5 exports — AECOM Compliance Statement template (XLSX).
 *
 * Layout (per sheet = one item code):
 *   Rows 1-4:  Dark header band — title, item type, project/date, consultant/ref
 *   Row 5:     Blank spacer
 *   Row 6-7:   "General Description" section + description text
 *   Row 8:     Blank spacer
 *   Row 9:     "Technical Description" section header
 *   Row 10:    Column headers (Parameter | Specified | Proposed | Comments/Compliance)
 *   Row 11-13: Identity rows — Manufacturer, Reference, Country of Origin
 *   Row 14+:   One row per adjudicated attribute (gates + scored)
 *   Last row:  "Other" trailing row
 *
 * "Comments / compliance" cell composition (AECOM style):
 *   comply            → "Comply"
 *   comply_with_comment → "Comply with <comment>"
 *   deviation         → "Deviation – <comment>"
 *   null (N/A)        → "N/A"
 */
import ExcelJS from 'exceljs';
import type { ExportTemplate } from './base';
import type { ComplianceStatement, AttributeEntry, RenderOptions } from '../types';

// ─── AECOM palette ────────────────────────────────────────────────────────────

const DARK_HDR_BG   = 'FF2D2D2D';
const DARK_HDR_FG   = 'FFFFFFFF';
const SECTION_BG    = 'FFF2F2F2';
const SECTION_FG    = 'FF1A1A1A';
const COL_HDR_BG    = 'FFD9D9D9';
const COL_HDR_FG    = 'FF1A1A1A';
const IDENTITY_BG   = 'FFFAFAFA';

const COMPLY_BG     = 'FFE8F5E9';
const COMPLY_FG     = 'FF2E7D32';
const COMMENT_BG    = 'FFFFF8E1';
const COMMENT_FG    = 'FFE65100';
const DEVIATION_BG  = 'FFFDE8E8';
const DEVIATION_FG  = 'FFC62828';
const NA_FG         = 'FF9E9E9E';
const ROW_BORDER    = 'FFE0E0E0';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: 'thin', color: { argb: ROW_BORDER } };
  return { top: s, bottom: s, left: s, right: s };
}

/** Write a merged, styled header row (spans all 4 data columns). */
function addBannerRow(
  ws: ExcelJS.Worksheet,
  text: string,
  bgArgb: string,
  fgArgb: string,
  bold: boolean,
  fontSize: number,
  height: number,
): ExcelJS.Row {
  const row = ws.addRow([text, '', '', '']);
  row.height = height;
  ws.mergeCells(row.number, 1, row.number, 4);
  const cell = row.getCell(1);
  cell.font      = { bold, size: fontSize, color: { argb: fgArgb } };
  cell.fill      = solidFill(bgArgb);
  cell.alignment = { vertical: 'middle', wrapText: false };
  return row;
}

/** Compose the AECOM "Comments / Compliance" cell text from verdict + comment. */
function aecomText(entry: AttributeEntry): string {
  switch (entry.verdict) {
    case 'comply':
      return 'Comply';
    case 'comply_with_comment':
      return entry.comment ? `Comply with ${entry.comment}` : 'Comply';
    case 'deviation':
      // em-dash (U+2013)
      return entry.comment ? `Deviation – ${entry.comment}` : 'Deviation';
    default:
      return 'N/A';
  }
}

function applyVerdictStyle(cell: ExcelJS.Cell, verdict: AttributeEntry['verdict']): void {
  if (verdict === 'comply') {
    cell.fill = solidFill(COMPLY_BG);
    cell.font = { color: { argb: COMPLY_FG }, size: 9 };
  } else if (verdict === 'comply_with_comment') {
    cell.fill = solidFill(COMMENT_BG);
    cell.font = { color: { argb: COMMENT_FG }, size: 9 };
  } else if (verdict === 'deviation') {
    cell.fill = solidFill(DEVIATION_BG);
    cell.font = { color: { argb: DEVIATION_FG }, bold: true, size: 9 };
  } else {
    cell.font = { color: { argb: NA_FG }, size: 9 };
  }
  cell.alignment = { vertical: 'middle', wrapText: true };
}

// ─── AECOM XLSX template ──────────────────────────────────────────────────────

export class AecomXlsxTemplate implements ExportTemplate {
  key = 'aecom';
  label = 'AECOM Compliance Statement (XLSX)';

  async render(statement: ComplianceStatement, _options?: RenderOptions): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'LightSelect';
    wb.created  = new Date();
    wb.modified = new Date();
    wb.properties.date1904 = false;

    const { metadata, general_description, proposed_product, attributes } = statement;

    // Sheet name = item_code (Excel limit: 31 chars)
    const ws = wb.addWorksheet(metadata.item_code.slice(0, 31), {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { key: 'A', width: 32 },
      { key: 'B', width: 26 },
      { key: 'C', width: 26 },
      { key: 'D', width: 54 },
    ];

    // ── Rows 1–4: dark header band ─────────────────────────────────────────

    addBannerRow(ws, 'COMPLIANCE STATEMENT', DARK_HDR_BG, DARK_HDR_FG, true, 13, 26);
    addBannerRow(ws, `Item Type: ${metadata.item_type}`, DARK_HDR_BG, DARK_HDR_FG, false, 10, 16);
    addBannerRow(ws,
      `PROJECT: ${metadata.project_name}   |   DATE: ${metadata.date}`,
      DARK_HDR_BG, DARK_HDR_FG, false, 10, 14);
    addBannerRow(ws,
      `LIGHTING CONSULTANT: ${metadata.consultant}   |   REF: ${metadata.ref}   REV. ${metadata.revision}`,
      DARK_HDR_BG, DARK_HDR_FG, false, 10, 14);

    const gap1 = ws.addRow([]);
    gap1.height = 6;

    // ── General Description ────────────────────────────────────────────────

    addBannerRow(ws, 'GENERAL DESCRIPTION', SECTION_BG, SECTION_FG, true, 10, 16);

    const descRow = ws.addRow(['Description', general_description, '', '']);
    descRow.height = 28;
    ws.mergeCells(descRow.number, 2, descRow.number, 4);
    descRow.getCell(1).font      = { bold: true, size: 9.5, color: { argb: SECTION_FG } };
    descRow.getCell(1).fill      = solidFill(IDENTITY_BG);
    descRow.getCell(2).font      = { size: 9.5 };
    descRow.getCell(2).fill      = solidFill(IDENTITY_BG);
    descRow.getCell(2).alignment = { vertical: 'top', wrapText: true };

    const gap2 = ws.addRow([]);
    gap2.height = 6;

    // ── Technical Description ──────────────────────────────────────────────

    addBannerRow(ws, 'TECHNICAL DESCRIPTION', SECTION_BG, SECTION_FG, true, 10, 16);

    // Column header row
    const hdrRow = ws.addRow(['Parameter', 'Specified', 'Proposed', 'Comments / Compliance']);
    hdrRow.height = 14;
    hdrRow.eachCell((cell) => {
      cell.fill      = solidFill(COL_HDR_BG);
      cell.font      = { bold: true, size: 9.5, color: { argb: COL_HDR_FG } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hdrRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

    // ── Identity rows (Manufacturer / Reference / Country of Origin) ───────

    const addIdentityRow = (label: string, value: string | null) => {
      const r = ws.addRow([label, '—', value ?? '—', '']);  // em-dash
      r.height = 13;
      r.getCell(1).font = { bold: true, size: 9, color: { argb: SECTION_FG } };
      r.getCell(2).font = { size: 9, color: { argb: NA_FG } };
      r.getCell(3).font = { size: 9 };
      r.getCell(4).font = { size: 9 };
      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill      = solidFill(IDENTITY_BG);
        cell.alignment = { vertical: 'middle' };
      });
    };

    addIdentityRow('Manufacturer',      proposed_product.manufacturer);
    addIdentityRow('Reference',         proposed_product.model_code);
    addIdentityRow('Country of Origin', proposed_product.country_of_origin);

    // ── Attribute rows ─────────────────────────────────────────────────────

    for (const entry of attributes) {
      if (entry.verdict === null) continue; // skip not_applicable

      const r = ws.addRow([
        entry.label,
        entry.specified_value ?? '—',
        entry.proposed_value  ?? '—',
        aecomText(entry),
      ]);
      r.height = 14;

      r.getCell(1).font      = { bold: entry.is_gate, size: 9 };
      r.getCell(1).alignment = { vertical: 'middle' };

      r.getCell(2).font      = { size: 9 };
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

      r.getCell(3).font      = { size: 9 };
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };

      applyVerdictStyle(r.getCell(4), entry.verdict);

      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = thinBorder();
      });
    }

    // ── Other (trailing catch-all row) ─────────────────────────────────────

    const otherRow = ws.addRow(['Other', '', '', '']);
    otherRow.height = 13;
    otherRow.getCell(1).font = { bold: true, size: 9, color: { argb: NA_FG } };
    otherRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder();
    });

    // Freeze top header band (4 rows)
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
