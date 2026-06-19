/**
 * PDF export renderer — Priority 16/17.
 *
 * Produces a consultant-facing summary PDF from export snapshot data.
 * Uses pdfkit with the warm brown / beige / grey palette.
 * Priority 17 adds optional consultant branding (brand_color, logo_url).
 */
import PDFDocument from 'pdfkit';
import https from 'https';
import http from 'http';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { export_package_items, export_package_boq_items } from '../db/schema/exports';
import type { ChecklistSnapshot, BoqSnapshot } from './export-snapshot';

// ─── Branding ─────────────────────────────────────────────────────────────

/**
 * Optional consultant branding applied to the PDF cover header.
 * All fields are optional — null values fall back to LightSelect defaults.
 */
export interface PdfBranding {
  /** Title shown in the header bar. Defaults to 'LIGHTSELECT — EXPORT PACKAGE SUMMARY'. */
  headerTitle: string;
  /** Publicly accessible image URL (PNG/JPEG). Rendered top-right of header. */
  logoUrl?: string | null;
  /** Hex colour for the header bar and section headers. Defaults to brand brown. */
  brandColor?: string | null;
}

/** Fetch an image URL as a Buffer for embedding in PDFKit. Returns null on any error. */
async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve) => {
    try {
      const proto = url.startsWith('https') ? https : http;
      const req = proto.get(url, { timeout: 5000 }, (res) => {
        if ((res.statusCode ?? 0) >= 300) { resolve(null); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

// ─── Palette ──────────────────────────────────────────────────────────────

const C = {
  brand:     '#7B5A43',
  brandLight:'#E8D9CB',
  ink:       '#2B2621',
  muted:     '#6F685F',
  faint:     '#8A8178',
  canvas:    '#F7F4EF',
  altRow:    '#F1ECE5',
  border:    '#D9D1C7',
  success:   '#2D6A4F',
  acceptable:'#5E7A5F',
  warning:   '#A06A3B',
  danger:    '#A14B3B',
  white:     '#FCFAF7',
};

// ─── Layout constants ─────────────────────────────────────────────────────

const PW     = 595.28; // A4 width
const PH     = 841.89; // A4 height
const M      = 50;     // margin
const CW     = PW - M * 2; // content width = 495.28
const FOOTER_Y = PH - 35;
const TABLE_ROW_H = 16;
const SECTION_HDR_H = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────

function complianceColor(score: number | null): string {
  if (score == null) return C.faint;
  if (score >= 0.80) return C.success;
  if (score >= 0.55) return C.acceptable;
  if (score >= 0.25) return C.warning;
  return C.danger;
}

function complianceLabel(score: number | null): string {
  if (score == null) return 'No data';
  const p = Math.round(score * 100);
  if (score >= 0.80) return `${p}% Strong`;
  if (score >= 0.55) return `${p}% Acceptable`;
  if (score >= 0.25) return `${p}% Weak`;
  return `${p}% Poor`;
}

function clamp(str: string, maxChars: number): string {
  return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str;
}

type Doc = InstanceType<typeof PDFDocument>;

// ─── Section header bar ───────────────────────────────────────────────────

function sectionHeader(doc: Doc, title: string, headerColor = C.brand): void {
  if (doc.y + SECTION_HDR_H + 10 > FOOTER_Y - 20) doc.addPage();
  const y = doc.y;
  doc.rect(M, y, CW, SECTION_HDR_H).fill(headerColor);
  doc.fill(C.white).font('Helvetica-Bold').fontSize(9)
     .text(title, M + 6, y + (SECTION_HDR_H - 9) / 2 + 1, { width: CW - 12, lineBreak: false });
  doc.fill(C.ink).font('Helvetica').fontSize(9);
  doc.text('', M, y + SECTION_HDR_H + 4); // advance cursor
}

// ─── Key-value row ────────────────────────────────────────────────────────

function kvRow(doc: Doc, label: string, value: string, labelColor = C.muted, valueColor = C.ink): void {
  const y = doc.y;
  doc.fill(labelColor).font('Helvetica').fontSize(8.5)
     .text(label, M, y, { width: 120, lineBreak: false, continued: false });
  doc.fill(valueColor).font('Helvetica').fontSize(8.5)
     .text(value, M + 125, y, { width: CW - 125, lineBreak: false });
  doc.text('', M, y + 14);
}

// ─── Horizontal rule ─────────────────────────────────────────────────────

function rule(doc: Doc, color = C.border): void {
  const y = doc.y;
  doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(color).lineWidth(0.5).stroke();
  doc.text('', M, y + 6);
}

// ─── BOQ table ────────────────────────────────────────────────────────────

interface TableCol { header: string; width: number; align?: 'left' | 'right' | 'center' }

const BOQ_COLS: TableCol[] = [
  { header: 'No.',         width: 26,  align: 'center' },
  { header: 'Description', width: 120, align: 'left'   },
  { header: 'Qty',         width: 35,  align: 'right'  },
  { header: 'Unit',        width: 28,  align: 'center' },
  { header: 'Product',     width: 95,  align: 'left'   },
  { header: 'Model',       width: 70,  align: 'left'   },
  { header: 'Match',       width: 67,  align: 'center' },
  { header: 'Total',       width: 54,  align: 'right'  },
];

function drawTableHeader(doc: Doc, y: number, headerColor = C.brand): void {
  let x = M;
  doc.rect(M, y, CW, TABLE_ROW_H).fill(headerColor);
  for (const col of BOQ_COLS) {
    doc.fill(C.white).font('Helvetica-Bold').fontSize(7.5)
       .text(col.header, x + 2, y + (TABLE_ROW_H - 7.5) / 2 + 0.5,
         { width: col.width - 4, align: col.align, lineBreak: false });
    x += col.width;
  }
  doc.fill(C.ink).font('Helvetica');
}

type BoqRow = {
  description: string | null;
  quantity: number;
  unit: string;
  product_name: string | null;
  model_code: string | null;
  compliance_score: number | null;
  total_price: number | null;
  currency: string | null;
};

function drawBoqDataRow(doc: Doc, row: BoqRow, rowIndex: number, y: number): void {
  const bg = rowIndex % 2 === 1 ? C.altRow : '#FFFFFF';
  doc.rect(M, y, CW, TABLE_ROW_H).fill(bg);

  const textY = y + (TABLE_ROW_H - 8) / 2 + 0.5;
  let x = M;
  const cells: { text: string; align?: 'left' | 'right' | 'center'; color?: string }[] = [
    { text: String(rowIndex + 1), align: 'center' },
    { text: clamp(row.description ?? '—', 28), align: 'left' },
    { text: String(row.quantity ?? ''), align: 'right' },
    { text: row.unit ?? '', align: 'center' },
    { text: clamp(row.product_name ?? '—', 20), align: 'left' },
    { text: clamp(row.model_code ?? '—', 16), align: 'left' },
    { text: complianceLabel(row.compliance_score), align: 'center', color: complianceColor(row.compliance_score) },
    { text: row.total_price != null ? `${row.currency ?? ''} ${row.total_price.toFixed(0)}` : '—', align: 'right' },
  ];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const col = BOQ_COLS[i];
    doc.fill(cell.color ?? C.ink).font('Helvetica').fontSize(7.5)
       .text(cell.text, x + 2, textY, { width: col.width - 4, align: cell.align, lineBreak: false });
    x += col.width;
  }
  doc.fill(C.ink);
}

// ─── Page footer ──────────────────────────────────────────────────────────

function drawPageFooter(doc: Doc, pageNum: number, totalPages: number, timestamp: string): void {
  const y = FOOTER_Y;
  doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.4).stroke();
  doc.fill(C.faint).font('Helvetica').fontSize(7)
     .text('Generated by LightSelect', M, y + 5, { width: CW / 2, lineBreak: false })
     .text(`${timestamp}   Page ${pageNum} of ${totalPages}`, M, y + 5, { width: CW, align: 'right', lineBreak: false });
}

// ─── Main generator ────────────────────────────────────────────────────────

export interface PdfGeneratorInput {
  exportPackageId: string;
  project: {
    project_name: string;
    client_name: string | null;
    project_code: string | null;
    revision_label: string | null;
  };
  activeSpec: { title: string; version_label: string } | null;
  checklistSnapshot: ChecklistSnapshot;
  boqSnapshot: BoqSnapshot;
  /** Optional consultant branding. Null fields fall back to LightSelect defaults. */
  branding?: PdfBranding | null;
}

export async function generatePackagePdf(input: PdfGeneratorInput): Promise<Buffer> {
  const { exportPackageId, project, activeSpec, checklistSnapshot, boqSnapshot, branding } = input;

  // Resolve branding — null/missing fields fall back to defaults
  const headerColor   = branding?.brandColor ?? C.brand;
  const headerTitle   = branding?.headerTitle ?? 'LIGHTSELECT — EXPORT PACKAGE SUMMARY';
  const logoBuffer    = branding?.logoUrl ? await fetchLogoBuffer(branding.logoUrl) : null;

  // Load snapshot data
  const sectionItems = await db
    .select()
    .from(export_package_items)
    .where(eq(export_package_items.export_package_id, exportPackageId))
    .orderBy(asc(export_package_items.section_order), asc(export_package_items.sort_order));

  const boqRows = await db
    .select()
    .from(export_package_boq_items)
    .where(eq(export_package_boq_items.export_package_id, exportPackageId))
    .orderBy(asc(export_package_boq_items.sort_order));

  // Group section items by section
  const sectionMap = new Map<string, {
    name: string; order: number; is_required: boolean;
    files: typeof sectionItems;
  }>();
  for (const item of sectionItems) {
    const key = `${item.section_order}-${item.section_name}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { name: item.section_name, order: item.section_order, is_required: item.is_section_required, files: [] });
    }
    if (item.file_name) sectionMap.get(key)!.files.push(item);
  }
  const sections = Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      bufferPages: true,
      info: {
        Title: `LightSelect Export — ${project.project_name}`,
        Author: 'LightSelect',
        Creator: 'LightSelect',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', reject);

    // Branded section-header helper (closes over headerColor)
    const secHeader = (title: string) => sectionHeader(doc, title, headerColor);

    // ── Cover / project info ───────────────────────────────────────────────

    // Main title bar (branded colour + optional logo)
    doc.rect(M, M, CW, 30).fill(headerColor);
    // Logo: right-aligned in the header bar if available
    const logoSlotWidth = logoBuffer ? 44 : 0;
    doc.fill(C.white).font('Helvetica-Bold').fontSize(13)
       .text(headerTitle, M + 10, M + 9, { width: CW - 20 - logoSlotWidth, lineBreak: false });
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, M + CW - 42, M + 4, { height: 22, fit: [40, 22] });
      } catch {
        // Logo embed failed (unsupported format etc.) — ignore, header text already rendered
      }
    }
    doc.fill(C.ink).font('Helvetica').fontSize(9);
    doc.text('', M, M + 38);

    // Project info
    kvRow(doc, 'Project', project.project_name);
    kvRow(doc, 'Client', project.client_name ?? '—');
    kvRow(doc, 'Project Code', project.project_code ?? '—');
    kvRow(doc, 'Revision', project.revision_label ?? '—');
    kvRow(doc, 'Generated', timestamp);
    doc.text('', M, doc.y + 4);
    rule(doc);

    // Active spec
    if (activeSpec) {
      secHeader('ACTIVE SPECIFICATION');
      kvRow(doc, 'Document', activeSpec.title);
      kvRow(doc, 'Version', activeSpec.version_label);
      doc.text('', M, doc.y + 4);
    }

    // ── Export readiness ───────────────────────────────────────────────────

    secHeader('EXPORT READINESS');

    const isReady = checklistSnapshot.is_export_ready;
    const readyColor = isReady ? C.success : C.danger;
    const readyLabel = isReady ? '✓  Export Ready' : '✗  Export Blocked';
    doc.fill(readyColor).font('Helvetica-Bold').fontSize(10)
       .text(readyLabel, M, doc.y);
    doc.fill(C.ink).font('Helvetica').fontSize(9);
    doc.text('', M, doc.y + 6);

    kvRow(doc, 'Template', checklistSnapshot.template_name ?? '—');
    kvRow(doc, 'Sections complete', `${checklistSnapshot.complete_count} of ${checklistSnapshot.total_required}`);
    if (checklistSnapshot.missing_count > 0) {
      kvRow(doc, 'Missing required', String(checklistSnapshot.missing_count), C.muted, C.danger);
    }
    if (checklistSnapshot.waived_count > 0) {
      kvRow(doc, 'Waived', String(checklistSnapshot.waived_count));
    }
    doc.text('', M, doc.y + 4);

    // ── BOQ summary ────────────────────────────────────────────────────────

    secHeader('BOQ SUMMARY');

    kvRow(doc, 'Total items', String(boqSnapshot.total_items));
    kvRow(doc, 'Total quantity', String(boqSnapshot.total_quantity));
    if (boqSnapshot.total_price != null) {
      kvRow(doc, 'Total price', `${boqSnapshot.currency ?? ''} ${boqSnapshot.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    kvRow(doc, 'Items with product', `${boqSnapshot.items_with_product} of ${boqSnapshot.total_items}`);

    // Compliance bands inline
    const cb = boqSnapshot.compliance_bands;
    if (boqSnapshot.total_items > 0) {
      doc.text('', M, doc.y + 4);
      const bands = [
        { label: `Strong (≥80%)`, count: cb.fully_compliant + cb.mostly_compliant, color: C.success },
        { label: `Acceptable (55–79%)`, count: cb.partially_compliant, color: C.acceptable },
        { label: `Weak / Poor (<55%)`, count: cb.poor_or_missing, color: C.warning },
      ];
      for (const b of bands) {
        if (b.count > 0) {
          kvRow(doc, b.label, String(b.count), C.muted, b.color);
        }
      }
    }
    doc.text('', M, doc.y + 4);

    // ── Section composition ────────────────────────────────────────────────

    if (sections.length > 0) {
      secHeader('SUBMITTAL SECTION COMPOSITION');

      for (const sec of sections) {
        if (doc.y + 24 > FOOTER_Y - 20) doc.addPage();

        // Section name row
        const secY = doc.y;
        doc.rect(M, secY, CW, 16).fill(C.altRow);
        doc.fill(headerColor).font('Helvetica-Bold').fontSize(8.5)
           .text(
             `${sec.order}. ${sec.name}${sec.is_required ? ' *' : ''}`,
             M + 4, secY + 4, { width: CW - 60, lineBreak: false }
           );
        doc.fill(C.muted).font('Helvetica').fontSize(8)
           .text(`${sec.files.length} file${sec.files.length !== 1 ? 's' : ''}`, M, secY + 4,
             { width: CW - 4, align: 'right', lineBreak: false });
        doc.fill(C.ink).font('Helvetica').fontSize(8.5);
        doc.text('', M, secY + 18);

        // File rows
        for (const file of sec.files) {
          if (doc.y + 13 > FOOTER_Y - 10) doc.addPage();
          const fy = doc.y;
          const meta = [file.document_type_name, file.category_name].filter(Boolean).join(' · ');
          doc.fill(C.muted).fontSize(7.5)
             .text(`  ${clamp(file.file_name ?? '', 55)}`, M + 10, fy, { width: CW - 60, lineBreak: false });
          doc.fill(C.faint).fontSize(7)
             .text(meta, M, fy, { width: CW - 4, align: 'right', lineBreak: false });
          doc.text('', M, fy + 12);
        }

        if (sec.files.length === 0) {
          const ey = doc.y;
          doc.fill(C.faint).fontSize(7.5).text('  No files assigned', M + 10, ey);
          doc.text('', M, ey + 12);
        }

        doc.text('', M, doc.y + 2);
      }

      doc.text('', M, doc.y + 4);
    }

    // ── BOQ schedule ───────────────────────────────────────────────────────

    if (doc.y + SECTION_HDR_H + TABLE_ROW_H * 2 > FOOTER_Y - 20) doc.addPage();
    secHeader('BOQ SCHEDULE');

    if (boqRows.length === 0) {
      doc.fill(C.faint).fontSize(8.5).text('No BOQ items in this export.', M, doc.y);
      doc.text('', M, doc.y + 12);
    } else {
      // Draw initial header
      let tableY = doc.y;
      drawTableHeader(doc, tableY, headerColor);
      tableY += TABLE_ROW_H;
      doc.text('', M, tableY);

      for (const [i, row] of boqRows.entries()) {
        // Check for page break
        if (tableY + TABLE_ROW_H > FOOTER_Y - 20) {
          doc.addPage();
          tableY = M + 5;
          // Repeat table header on new page
          doc.fill(C.muted).font('Helvetica-Oblique').fontSize(7)
             .text('BOQ Schedule (continued)', M, tableY);
          tableY += 12;
          doc.text('', M, tableY);
          drawTableHeader(doc, tableY, headerColor);
          tableY += TABLE_ROW_H;
          doc.text('', M, tableY);
        }

        drawBoqDataRow(doc, row, i, tableY);
        tableY += TABLE_ROW_H;
        doc.text('', M, tableY);
      }

      // Totals row
      if (tableY + TABLE_ROW_H > FOOTER_Y - 20) {
        doc.addPage();
        tableY = M + 5;
        doc.text('', M, tableY);
      }
      const totalQty = boqRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
      const totalPrice = boqRows.reduce((s, r) => s + (r.total_price ?? 0), 0);
      const hasPricing = boqRows.some((r) => r.total_price != null);

      doc.rect(M, tableY, CW, TABLE_ROW_H).fill(C.brandLight);
      doc.fill(headerColor).font('Helvetica-Bold').fontSize(8)
         .text('TOTAL', M + 2, tableY + (TABLE_ROW_H - 8) / 2 + 0.5, { width: 26 + 120 - 4, lineBreak: false });

      // Qty total
      const qtyX = M + BOQ_COLS[0].width + BOQ_COLS[1].width;
      doc.fill(headerColor).font('Helvetica-Bold').fontSize(8)
         .text(String(totalQty), qtyX + 2, tableY + (TABLE_ROW_H - 8) / 2 + 0.5,
           { width: BOQ_COLS[2].width - 4, align: 'right', lineBreak: false });

      // Price total
      if (hasPricing) {
        const priceX = M + BOQ_COLS.slice(0, 7).reduce((s, c) => s + c.width, 0);
        doc.fill(headerColor).font('Helvetica-Bold').fontSize(8)
           .text(`${boqRows[0]?.currency ?? ''} ${totalPrice.toFixed(0)}`, priceX + 2, tableY + (TABLE_ROW_H - 8) / 2 + 0.5,
             { width: BOQ_COLS[7].width - 4, align: 'right', lineBreak: false });
      }

      tableY += TABLE_ROW_H;
      doc.fill(C.ink).font('Helvetica').fontSize(9);
      doc.text('', M, tableY + 8);
    }

    // ── Notes and legend ───────────────────────────────────────────────────

    if (doc.y + 80 > FOOTER_Y - 20) doc.addPage();

    secHeader('MATCH QUALITY LEGEND');

    const legendItems = [
      { label: 'Strong (≥80%)',      desc: 'Product meets all key specification requirements.', color: C.success },
      { label: 'Acceptable (55–79%)', desc: 'Product meets most requirements; minor gaps remain.', color: C.acceptable },
      { label: 'Weak (<55%)',         desc: 'Product has significant deviations — review recommended.', color: C.warning },
      { label: 'No data',             desc: 'No product assigned or no comparison run yet.', color: C.faint },
    ];

    for (const item of legendItems) {
      if (doc.y + 14 > FOOTER_Y - 20) doc.addPage();
      const ly = doc.y;
      doc.fill(item.color).font('Helvetica-Bold').fontSize(8.5)
         .text(item.label, M, ly, { width: 120, lineBreak: false });
      doc.fill(C.muted).font('Helvetica').fontSize(8.5)
         .text(item.desc, M + 125, ly, { width: CW - 125, lineBreak: false });
      doc.text('', M, ly + 13);
    }

    // ── Page numbers (buffered) ────────────────────────────────────────────

    const totalPages = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      (doc as any).switchToPage(i);
      drawPageFooter(doc, i + 1, totalPages, timestamp);
    }

    (doc as any).flushPages();
    doc.end();

    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
