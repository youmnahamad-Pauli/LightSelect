/**
 * Phase 5 exports — AECOM Compliance Statement template (XLSX).
 *
 * Three-section skeleton, each with full standing rows and Specified | Proposed | Comments/Compliance.
 *
 * Sheet layout (per item code):
 *   Rows 1–4:   Dark header band
 *   Row  5:     Spacer
 *   Rows 6–7:   General Description
 *   Row  8:     Spacer
 *   Row  9:     LUMINAIRE (FIXTURE) banner
 *   Row  10:    Column headers
 *   Rows 11–22: 12 standing luminaire rows
 *   Row  23:    Spacer
 *   Row  24:    LAMP / SOURCE banner
 *   Row  25:    Column headers
 *   Rows 26–35: 10 standing lamp rows (incl. special DELIVERED lumen row)
 *   Row  36:    Spacer
 *   Row  37:    CONTROL GEAR / BALLAST / TRANSFORMER banner
 *   Row  38:    Column headers
 *   Rows 39–41: 3 standing control gear rows
 *   Row  42:    Spacer
 *   Row  43:    Other (trailing catch-all)
 *
 * Rendering rules:
 *   - ALL standing rows always rendered (blanks are honest gaps).
 *   - Each row cascade: adjudicated evidence → raw product attr → blank.
 *   - Lumen Output (DELIVERED) row: special handling for component_build without
 *     characterised diffuser_transmission — shows "pending diffuser transmission"
 *     with the source lm/m figure in the comment, styled amber.
 *   - Comments/Compliance: "Comply" / "Comply with <comment>" / "Deviation – <comment>".
 */
import ExcelJS from 'exceljs';
import type { ExportTemplate } from './base';
import type {
  ComplianceStatement, AttributeEntry, RenderOptions,
  SpineVerdict, LumenRepresentation,
} from '../types';

// ─── AECOM palette ────────────────────────────────────────────────────────────

const DARK_HDR_BG  = 'FF2D2D2D';
const DARK_HDR_FG  = 'FFFFFFFF';
const SECTION_BG   = 'FFE8EAF6';   // indigo-50 tint — distinguishes sections from general bands
const SECTION_FG   = 'FF1A237E';   // indigo-900
const COL_HDR_BG   = 'FFD9D9D9';
const COL_HDR_FG   = 'FF1A1A1A';
const IDENTITY_BG  = 'FFFAFAFA';
const COMPLY_BG    = 'FFE8F5E9';
const COMPLY_FG    = 'FF2E7D32';
const COMMENT_BG   = 'FFFFF8E1';
const COMMENT_FG   = 'FFE65100';
const DEVIATION_BG = 'FFFDE8E8';
const DEVIATION_FG = 'FFC62828';
const NA_FG        = 'FF9E9E9E';
const ROW_BORDER   = 'FFE0E0E0';

// ─── Row spec ─────────────────────────────────────────────────────────────────

/**
 * Describes one standing row in a section.
 *
 *   attrKey      — look up adjudicated evidence by this key for Specified + Proposed + verdict.
 *   productAttr  — fallback product_attribute_values key for Proposed when evidence absent.
 *   identity     — pull Proposed from a named field on ProposedProduct (overrides productAttr).
 *   special      — custom rendering logic keyed by name.
 *   bold         — bold the label (used for gate attributes).
 */
interface RowSpec {
  label: string;
  attrKey?: string;
  productAttr?: string;
  identity?: 'manufacturer' | 'model_code' | 'country_of_origin';
  special?: 'lumen_delivered';
  bold?: boolean;
}

const LUMINAIRE_ROWS: RowSpec[] = [
  { label: 'Manufacturer',                   identity: 'manufacturer' },
  { label: 'Manufacturer Product Reference', identity: 'model_code' },
  { label: 'IP Rating',                      attrKey: 'ip_rating',            bold: true },
  { label: 'IK Rating',                      productAttr: 'ik_rating' },
  { label: 'Mounting Type',                  attrKey: 'mounting',             productAttr: 'mounting' },
  { label: 'Body Material',                  productAttr: 'body_material' },
  { label: 'Reflector Material',             productAttr: 'reflector_material' },
  { label: 'Body Colour',                    productAttr: 'body_colour' },
  { label: 'Country of Origin',              identity: 'country_of_origin' },
  { label: 'Operating Temperature',          attrKey: 'operating_temperature', productAttr: 'operating_temperature' },
  { label: 'Physical Dimensions',            attrKey: 'dimensions',            productAttr: 'dimensions' },
  { label: 'Accessories',                    productAttr: 'accessories' },
];

const LAMP_ROWS: RowSpec[] = [
  { label: 'Manufacturer',          identity: 'manufacturer' },
  { label: 'Reference',             identity: 'model_code' },
  { label: 'Type',                  productAttr: 'lamp_type' },
  { label: 'Beam Angle',            attrKey: 'beam_angle',       productAttr: 'beam_angle' },
  { label: 'Voltage',               attrKey: 'voltage',          bold: true },
  { label: 'Wattage',               attrKey: 'watts_per_metre',  productAttr: 'watts_per_metre' },
  { label: 'SDCM',                  productAttr: 'sdcm' },
  { label: 'CRI',                   attrKey: 'cri',              productAttr: 'cri' },
  { label: 'Colour Temperature',    attrKey: 'cct',              productAttr: 'cct' },
  { label: 'Lumen Output (DELIVERED)', attrKey: 'lumens_per_metre', special: 'lumen_delivered' },
];

const CONTROL_GEAR_ROWS: RowSpec[] = [
  { label: 'Type',         productAttr: 'driver_type' },
  { label: 'Manufacturer', productAttr: 'driver_manufacturer' },
  { label: 'Reference',    productAttr: 'driver_reference' },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: 'thin', color: { argb: ROW_BORDER } };
  return { top: s, bottom: s, left: s, right: s };
}

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

function addColHeaders(ws: ExcelJS.Worksheet): void {
  const r = ws.addRow(['Parameter', 'Specified', 'Proposed', 'Comments / Compliance']);
  r.height = 14;
  r.eachCell((cell) => {
    cell.fill      = solidFill(COL_HDR_BG);
    cell.font      = { bold: true, size: 9.5, color: { argb: COL_HDR_FG } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border    = thinBorder();
  });
  r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
}

function composeAecomText(verdict: SpineVerdict | null, comment: string | null): string {
  switch (verdict) {
    case 'comply':             return 'Comply';
    case 'comply_with_comment': return comment ? `Comply with ${comment}` : 'Comply';
    case 'deviation':          return comment ? `Deviation – ${comment}` : 'Deviation';
    default:                   return '';
  }
}

function applyVerdictStyle(cell: ExcelJS.Cell, verdict: SpineVerdict | null): void {
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
    cell.fill = solidFill(IDENTITY_BG);
    cell.font = { color: { argb: NA_FG }, size: 9 };
  }
  cell.alignment = { vertical: 'middle', wrapText: true };
}

function addDataRow(
  ws: ExcelJS.Worksheet,
  label: string,
  specified: string | null,
  proposed: string | null,
  verdict: SpineVerdict | null,
  comment: string | null,
  bold = false,
): void {
  const commentsText = composeAecomText(verdict, comment);

  const r = ws.addRow([
    label,
    specified ?? '—',     // em-dash for "not specified"
    proposed  ?? '—',
    commentsText,
  ]);
  r.height = 14;

  r.getCell(1).font      = { bold, size: 9, color: { argb: COL_HDR_FG } };
  r.getCell(1).alignment = { vertical: 'middle' };
  r.getCell(1).fill      = solidFill(IDENTITY_BG);

  r.getCell(2).font      = { size: 9, color: { argb: verdict ? COL_HDR_FG : NA_FG } };
  r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
  r.getCell(2).fill      = solidFill(IDENTITY_BG);

  r.getCell(3).font      = { size: 9 };
  r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
  r.getCell(3).fill      = solidFill(IDENTITY_BG);

  applyVerdictStyle(r.getCell(4), verdict);

  r.eachCell({ includeEmpty: true }, (cell) => { cell.border = thinBorder(); });
}

function addSpacer(ws: ExcelJS.Worksheet, height = 6): void {
  ws.addRow([]).height = height;
}

// ─── Lumen row renderer ───────────────────────────────────────────────────────

/**
 * Render the "Lumen Output (DELIVERED)" row with archetype-aware logic.
 *
 * component_build, no diffuser_transmission:
 *   Proposed = "pending diffuser transmission"
 *   Comment  = "Delivered not confirmed — source X lm/m (diffuser transmission not characterized)"
 *   Verdict  = comply_with_comment (amber flag — NOT a source-derived comply/deviation)
 *
 * component_build with transmission, or preassembled, or unknown:
 *   Use delivered_lumens and engine verdict as-is.
 */
function addLumenRow(
  ws: ExcelJS.Worksheet,
  specifiedValue: string | null,
  adjAttr: AttributeEntry | undefined,
  lr: LumenRepresentation | null,
): void {
  const label = 'Lumen Output (DELIVERED)';

  // Pending path: component_build with uncharacterised transmission
  if (lr && lr.delivered_lumens === null && lr.pending_reason) {
    const sourceStr = lr.source_lumens !== null
      ? `source ${lr.source_lumens} ${lr.unit}`
      : 'source unknown';
    const comment =
      `Delivered not confirmed — ${sourceStr}; ` +
      `delivered = source × diffuser transmission (${lr.pending_reason})`;

    addDataRow(ws, label, specifiedValue, 'pending diffuser transmission',
      'comply_with_comment', comment, false);
    return;
  }

  // Known delivered path
  if (lr && lr.delivered_lumens !== null) {
    const deliveredStr = `${lr.delivered_lumens} ${lr.unit}`;
    // Use engine verdict from evidence (adjAttr) if available, else default to comply
    const verdict  = adjAttr?.verdict  ?? 'comply';
    const comment  = adjAttr?.comment  ?? null;
    addDataRow(ws, label, specifiedValue, deliveredStr, verdict, comment, false);
    return;
  }

  // No lumen representation at all — fall back to raw evidence or blank
  if (adjAttr) {
    addDataRow(ws, label, specifiedValue, adjAttr.proposed_value,
      adjAttr.verdict, adjAttr.comment, false);
    return;
  }

  addDataRow(ws, label, specifiedValue, null, null, null, false);
}

// ─── Section renderer ─────────────────────────────────────────────────────────

function renderSection(
  ws: ExcelJS.Worksheet,
  title: string,
  rows: RowSpec[],
  statement: ComplianceStatement,
  adjAttrMap: Map<string, AttributeEntry>,
): void {
  addBannerRow(ws, title, SECTION_BG, SECTION_FG, true, 10, 18);
  addColHeaders(ws);

  const { proposed_product: prod } = statement;

  for (const spec of rows) {
    // Lumen row — custom renderer
    if (spec.special === 'lumen_delivered') {
      const adjAttr    = spec.attrKey ? adjAttrMap.get(spec.attrKey) : undefined;
      const specifiedValue = adjAttr?.specified_value ?? null;
      addLumenRow(ws, specifiedValue, adjAttr, prod.lumen_representation);
      continue;
    }

    // Resolved specified value (from adjudicated evidence)
    const adjAttr = spec.attrKey ? adjAttrMap.get(spec.attrKey) : undefined;
    const specifiedValue = adjAttr?.specified_value ?? null;

    // Resolved proposed value — cascade: evidence → identity field → product attr → blank
    let proposedValue: string | null = null;
    if (adjAttr?.proposed_value) {
      proposedValue = adjAttr.proposed_value;
    } else if (spec.identity) {
      proposedValue = prod[spec.identity] ?? null;
    } else if (spec.productAttr) {
      proposedValue = prod.raw_attributes[spec.productAttr] ?? null;
    }

    const verdict = adjAttr?.verdict ?? null;
    const comment = adjAttr?.comment ?? null;
    const bold    = spec.bold ?? false;

    addDataRow(ws, spec.label, specifiedValue, proposedValue, verdict, comment, bold);
  }
}

// ─── AECOM XLSX template ──────────────────────────────────────────────────────

export class AecomXlsxTemplate implements ExportTemplate {
  key   = 'aecom';
  label = 'AECOM Compliance Statement (XLSX)';

  async render(statement: ComplianceStatement, _options?: RenderOptions): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'LightSelect';
    wb.created  = new Date();
    wb.modified = new Date();
    wb.properties.date1904 = false;

    const { metadata, general_description } = statement;

    const ws = wb.addWorksheet(metadata.item_code.slice(0, 31), {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { key: 'A', width: 34 },
      { key: 'B', width: 22 },
      { key: 'C', width: 26 },
      { key: 'D', width: 52 },
    ];

    // ── Rows 1–4: dark header band ─────────────────────────────────────────

    addBannerRow(ws, 'COMPLIANCE STATEMENT', DARK_HDR_BG, DARK_HDR_FG, true,  13, 26);
    addBannerRow(ws, `Item Type: ${metadata.item_type}`,
      DARK_HDR_BG, DARK_HDR_FG, false, 10, 16);
    addBannerRow(ws,
      `PROJECT: ${metadata.project_name}   |   DATE: ${metadata.date}`,
      DARK_HDR_BG, DARK_HDR_FG, false, 10, 14);
    addBannerRow(ws,
      `LIGHTING CONSULTANT: ${metadata.consultant}   |   REF: ${metadata.ref}   REV. ${metadata.revision}`,
      DARK_HDR_BG, DARK_HDR_FG, false, 10, 14);

    addSpacer(ws);

    // ── General Description ────────────────────────────────────────────────

    addBannerRow(ws, 'GENERAL DESCRIPTION', 'FFF2F2F2', 'FF1A1A1A', true, 10, 16);

    const descRow = ws.addRow(['Description', general_description, '', '']);
    descRow.height = 28;
    ws.mergeCells(descRow.number, 2, descRow.number, 4);
    descRow.getCell(1).font      = { bold: true, size: 9.5, color: { argb: 'FF1A1A1A' } };
    descRow.getCell(1).fill      = solidFill(IDENTITY_BG);
    descRow.getCell(2).font      = { size: 9.5 };
    descRow.getCell(2).fill      = solidFill(IDENTITY_BG);
    descRow.getCell(2).alignment = { vertical: 'top', wrapText: true };

    addSpacer(ws);

    // ── Build adjudicated attribute lookup ─────────────────────────────────

    const adjAttrMap = new Map<string, AttributeEntry>(
      statement.attributes.map((a) => [a.attribute_key, a]),
    );

    // ── Section 1: LUMINAIRE (FIXTURE) ─────────────────────────────────────

    renderSection(ws, 'LUMINAIRE (FIXTURE)', LUMINAIRE_ROWS, statement, adjAttrMap);
    addSpacer(ws);

    // ── Section 2: LAMP / SOURCE ───────────────────────────────────────────

    renderSection(ws, 'LAMP / SOURCE', LAMP_ROWS, statement, adjAttrMap);
    addSpacer(ws);

    // ── Section 3: CONTROL GEAR / BALLAST / TRANSFORMER ───────────────────

    renderSection(ws, 'CONTROL GEAR / BALLAST / TRANSFORMER', CONTROL_GEAR_ROWS, statement, adjAttrMap);
    addSpacer(ws);

    // ── Trailing "Other" catch-all ─────────────────────────────────────────

    const otherRow = ws.addRow(['Other', '', '', '']);
    otherRow.height = 13;
    otherRow.getCell(1).font = { bold: true, size: 9, color: { argb: NA_FG } };
    otherRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill   = solidFill(IDENTITY_BG);
      cell.border = thinBorder();
    });

    // Freeze top header band (4 rows)
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
