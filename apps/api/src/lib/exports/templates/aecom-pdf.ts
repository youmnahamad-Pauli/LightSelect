/**
 * AECOM Compliance Statement — pdfkit PDF renderer.
 *
 * Mirrors the three-section layout of aecom-xlsx.ts (LUMINAIRE / LAMP /
 * CONTROL GEAR) but outputs a PDF buffer instead of XLSX.
 *
 * Used in the submittal package assembly (INCREMENT 4) so that compliance
 * statements can be merged into the combined PDF via pdf-lib.
 * The existing AECOM XLSX template is left untouched.
 */
import PDFDocument from 'pdfkit';
import type { ExportTemplate } from './base';
import type {
  ComplianceStatement, AttributeEntry, RenderOptions,
  SpineVerdict, LumenRepresentation, ComponentIdentity,
} from '../types';

// ─── Layout ────────────────────────────────────────────────────────────────────

const M    = 40;    // page margin
const PW   = 595.28;
const PH   = 841.89;
const CW   = PW - M * 2;  // 515.28

const C1 = 130;          // Parameter column width
const C2 = 110;          // Specified
const C3 = 110;          // Proposed
const C4 = CW - C1 - C2 - C3; // Compliance (165.28)

const HDR_H = 18;  // dark header band rows
const BNR_H = 22;  // override / no-candidate banners
const SEC_H = 15;  // section title bar
const COL_H = 12;  // column header row
const ROW_H = 13;  // data row
const SPC   = 5;

const FOOTER_Y = PH - M - 28;

// ─── Colours ────────────────────────────────────────────────────────────────────

const DARK_HDR    = '#2D2D2D';
const W           = '#FFFFFF';
const SECTION_BG  = '#E8EAF6';
const SECTION_FG  = '#1A237E';
const COL_HDR_BG  = '#D9D9D9';
const COL_HDR_FG  = '#1A1A1A';
const IDENTITY_BG = '#FAFAFA';
const COMPLY_FG   = '#2E7D32';
const COMMENT_FG  = '#E65100';
const DEVI_FG     = '#C62828';
const NA_FG       = '#9E9E9E';
const OVERRIDE_BG = '#FCE4EC';
const OVERRIDE_FG = '#C62828';
const NO_CAND_BG  = '#F5F5F5';
const NO_CAND_FG  = '#616161';

// ─── Row specs (mirrors aecom-xlsx.ts) ────────────────────────────────────────

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
  { label: 'IP Rating',                      attrKey: 'ip_rating',             bold: true },
  { label: 'IK Rating',                      productAttr: 'ik_rating' },
  { label: 'Mounting Type',                  attrKey: 'mounting',              productAttr: 'mounting' },
  { label: 'Body Material',                  productAttr: 'body_material' },
  { label: 'Reflector Material',             productAttr: 'reflector_material' },
  { label: 'Body Colour',                    productAttr: 'body_colour' },
  { label: 'Country of Origin',              identity: 'country_of_origin' },
  { label: 'Operating Temperature',          attrKey: 'operating_temperature', productAttr: 'operating_temperature' },
  { label: 'Physical Dimensions',            attrKey: 'dimensions',            productAttr: 'dimensions' },
  { label: 'Accessories',                    productAttr: 'accessories' },
];

const LAMP_ROWS: RowSpec[] = [
  { label: 'Manufacturer',             identity: 'manufacturer' },
  { label: 'Reference',                identity: 'model_code' },
  { label: 'Type',                     productAttr: 'lamp_type' },
  { label: 'Beam Angle',               attrKey: 'beam_angle',      productAttr: 'beam_angle' },
  { label: 'Voltage',                  attrKey: 'voltage',         bold: true },
  { label: 'Wattage',                  attrKey: 'watts_per_metre', productAttr: 'watts_per_metre' },
  { label: 'SDCM',                     productAttr: 'sdcm' },
  { label: 'CRI',                      attrKey: 'cri',             productAttr: 'cri' },
  { label: 'Colour Temperature',       attrKey: 'cct',             productAttr: 'cct' },
  { label: 'Lumen Output (DELIVERED)', attrKey: 'lumens_per_metre', special: 'lumen_delivered' },
];

const CONTROL_GEAR_ROWS: RowSpec[] = [
  { label: 'Type',         productAttr: 'driver_type' },
  { label: 'Manufacturer', productAttr: 'driver_manufacturer' },
  { label: 'Reference',    productAttr: 'driver_reference' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function complianceText(verdict: SpineVerdict | null, comment: string | null): string {
  switch (verdict) {
    case 'comply':             return 'Comply';
    case 'comply_with_comment': return comment ? `Comply with ${comment}` : 'Comply';
    case 'deviation':          return comment ? `Deviation — ${comment}` : 'Deviation';
    case 'delivered_pending':  return comment ? `DELIVERED PENDING — ${comment}` : 'DELIVERED PENDING';
    default:                   return '';
  }
}

function verdictFg(v: SpineVerdict | null): string {
  switch (v) {
    case 'comply':             return COMPLY_FG;
    case 'comply_with_comment': return COMMENT_FG;
    case 'deviation':          return DEVI_FG;
    case 'delivered_pending':  return COMMENT_FG;
    default:                   return NA_FG;
  }
}

// ─── AecomPdfTemplate ─────────────────────────────────────────────────────────

export class AecomPdfTemplate implements ExportTemplate {
  key   = 'aecom-pdf';
  label = 'AECOM Compliance Statement (PDF)';

  async render(statement: ComplianceStatement, _options?: RenderOptions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: M, bottom: M, left: M, right: M },
        bufferPages: true,
        info: {
          Title:  `Compliance Statement — ${statement.metadata.item_code}`,
          Author: 'LightSelect',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);

      let y = M;

      // ── layout helpers ──────────────────────────────────────────────────

      function checkPage(needed: number) {
        if (y + needed > FOOTER_Y) { doc.addPage(); y = M; }
      }

      function band(text: string, bg: string, fg: string, h: number, sz: number, bold: boolean) {
        checkPage(h);
        doc.rect(M, y, CW, h).fill(bg);
        doc.fill(fg)
           .font(bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(sz)
           .text(clamp(text, 160), M + 5, y + (h - sz) / 2 + 0.5, {
             width: CW - 10, lineBreak: false,
           });
        y += h;
      }

      function spacer() { y += SPC; }

      function sectionHeader(title: string) {
        checkPage(SEC_H + COL_H + ROW_H * 2 + 10);
        doc.rect(M, y, CW, SEC_H).fill(SECTION_BG);
        doc.fill(SECTION_FG).font('Helvetica-Bold').fontSize(9)
           .text(title, M + 5, y + (SEC_H - 9) / 2 + 0.5, { width: CW - 10, lineBreak: false });
        y += SEC_H;
      }

      function colHeaders() {
        const labels = ['Parameter', 'Specified', 'Proposed', 'Comments / Compliance'];
        const widths = [C1, C2, C3, C4];
        doc.rect(M, y, CW, COL_H).fill(COL_HDR_BG);
        let x = M;
        for (let i = 0; i < 4; i++) {
          doc.fill(COL_HDR_FG).font('Helvetica-Bold').fontSize(7)
             .text(labels[i], x + 2, y + (COL_H - 7) / 2 + 0.5, {
               width: widths[i] - 4, lineBreak: false,
             });
          x += widths[i];
        }
        y += COL_H;
      }

      function dataRow(
        label: string,
        specified: string | null,
        proposed: string | null,
        verdict: SpineVerdict | null,
        comment: string | null,
        bold = false,
      ) {
        checkPage(ROW_H);
        doc.rect(M, y, CW, ROW_H).fill(IDENTITY_BG);

        // Parameter
        doc.fill(COL_HDR_FG).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
           .text(clamp(label, 26), M + 2, y + 2, { width: C1 - 4, lineBreak: false });

        // Specified
        doc.fill(specified ? COL_HDR_FG : NA_FG).font('Helvetica').fontSize(7)
           .text(specified ?? '—', M + C1 + 2, y + 2, { width: C2 - 4, lineBreak: false });

        // Proposed
        doc.fill(proposed ? COL_HDR_FG : NA_FG).font('Helvetica').fontSize(7)
           .text(proposed ?? '—', M + C1 + C2 + 2, y + 2, { width: C3 - 4, lineBreak: false });

        // Compliance (colour-coded text)
        const compText = complianceText(verdict, comment);
        const compFg   = verdictFg(verdict);
        const compBold = verdict === 'deviation' || verdict === 'delivered_pending';
        doc.fill(compFg).font(compBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
           .text(clamp(compText, 54), M + C1 + C2 + C3 + 2, y + 2, {
             width: C4 - 4, lineBreak: false,
           });

        y += ROW_H;
      }

      function lumenRow(
        specifiedValue: string | null,
        adjAttr: AttributeEntry | undefined,
        lr: LumenRepresentation | null,
      ) {
        const label = 'Lumen Output (DELIVERED)';

        if (adjAttr?.verdict === 'delivered_pending') {
          const sourceNote = lr?.source_lumens != null
            ? `Source: ${lr.source_lumens} ${lr.unit ?? 'lm/m'}`
            : (adjAttr.comment ?? 'diffuser transmission not characterised');
          dataRow(label, specifiedValue, '—', 'delivered_pending',
            `bare strip — ${sourceNote}`);
          return;
        }

        if (lr && lr.delivered_lumens === null && lr.pending_reason) {
          const src = lr.source_lumens !== null
            ? `source ${lr.source_lumens} ${lr.unit}`
            : 'source unknown';
          dataRow(label, specifiedValue, 'pending diffuser transmission',
            'comply_with_comment', `Delivered not confirmed — ${src}`);
          return;
        }

        if (lr && lr.delivered_lumens !== null) {
          const deliveredStr = `${lr.delivered_lumens} ${lr.unit}`;
          const verdict = adjAttr?.verdict ?? 'comply';
          let comment  = adjAttr?.comment ?? null;
          if (lr.diffuser_transmission !== null && lr.transmission_provenance) {
            const prov: Record<string, string> = {
              combo_tested: 'manufacturer-tested combination',
              published:    'published diffuser transmission',
              estimated:    'estimated transmission',
            };
            const note = prov[lr.transmission_provenance] ?? lr.transmission_provenance;
            comment = (comment ? comment + '. ' : '') +
              `Delivered = source × ${(lr.diffuser_transmission * 100).toFixed(0)}% (${note})`;
          }
          dataRow(label, specifiedValue, deliveredStr, verdict, comment);
          return;
        }

        if (adjAttr) {
          dataRow(label, specifiedValue, adjAttr.proposed_value, adjAttr.verdict, adjAttr.comment);
          return;
        }

        dataRow(label, specifiedValue, null, null, null);
      }

      function renderSection(
        title: string,
        rows: RowSpec[],
        adjAttrMap: Map<string, AttributeEntry>,
        componentIdentity: ComponentIdentity | null = null,
      ) {
        sectionHeader(title);
        colHeaders();

        const prod = statement.proposed_product;

        for (const spec of rows) {
          if (spec.special === 'lumen_delivered') {
            const adjAttr = spec.attrKey ? adjAttrMap.get(spec.attrKey) : undefined;
            lumenRow(adjAttr?.specified_value ?? null, adjAttr, prod.lumen_representation);
            continue;
          }

          const adjAttr = spec.attrKey ? adjAttrMap.get(spec.attrKey) : undefined;
          const specifiedValue = adjAttr?.specified_value ?? null;

          let proposedValue: string | null = null;
          if (adjAttr?.proposed_value) {
            proposedValue = adjAttr.proposed_value;
          } else if (spec.identity) {
            if (spec.identity === 'country_of_origin') {
              proposedValue = prod.country_of_origin ?? null;
            } else if (componentIdentity) {
              proposedValue = componentIdentity[spec.identity] ?? null;
            } else {
              proposedValue = (prod as unknown as Record<string, string | null>)[spec.identity] ?? null;
            }
          } else if (spec.productAttr) {
            proposedValue = prod.raw_attributes[spec.productAttr] ?? null;
          }

          dataRow(
            spec.label,
            specifiedValue,
            proposedValue,
            adjAttr?.verdict ?? null,
            adjAttr?.comment ?? null,
            spec.bold ?? false,
          );
        }
      }

      // ── Render document ─────────────────────────────────────────────────

      const { metadata, general_description } = statement;

      // Header band (4 rows)
      band('COMPLIANCE STATEMENT', DARK_HDR, W, HDR_H, 12, true);
      band(`Item Type: ${metadata.item_type}`, DARK_HDR, W, HDR_H, 9, false);
      band(`PROJECT: ${metadata.project_name}   |   DATE: ${metadata.date}`, DARK_HDR, W, HDR_H, 9, false);
      band(
        `LIGHTING CONSULTANT: ${metadata.consultant}   |   REF: ${metadata.ref}   REV. ${metadata.revision}`,
        DARK_HDR, W, HDR_H, 9, false,
      );

      // Override banner (red — must be impossible to miss)
      if (statement.is_override) {
        const reason = statement.override_reason ?? 'override — review required';
        band(
          `⚠  OVERRIDE — proposed against engine assessment: ${reason}`,
          OVERRIDE_BG, OVERRIDE_FG, BNR_H, 8.5, true,
        );
      }

      // No-candidate banner (grey)
      if (statement.no_candidate) {
        band(
          'NO COMPLIANT CANDIDATE IDENTIFIED — proposed product column is blank pending further supply-chain review',
          NO_CAND_BG, NO_CAND_FG, BNR_H, 8.5, true,
        );
      }

      spacer();

      // General Description
      band('GENERAL DESCRIPTION', '#F2F2F2', '#1A1A1A', 14, 9, true);
      checkPage(ROW_H * 2);
      doc.rect(M, y, CW, ROW_H * 2).fill(IDENTITY_BG);
      doc.fill(COL_HDR_FG).font('Helvetica-Bold').fontSize(8.5)
         .text('Description', M + 2, y + 3, { width: C1 - 4, lineBreak: false });
      doc.fill(COL_HDR_FG).font('Helvetica').fontSize(8.5)
         .text(general_description || '—', M + C1 + 2, y + 3, {
           width: CW - C1 - 4,
           height: ROW_H * 2 - 6,
           lineBreak: true,
         });
      y += ROW_H * 2;

      spacer();

      // Build adjudicated attribute lookup
      const adjAttrMap = new Map<string, AttributeEntry>(
        statement.attributes.map((a) => [a.attribute_key, a]),
      );

      const prod = statement.proposed_product;

      // Section 1: LUMINAIRE (FIXTURE)
      renderSection('LUMINAIRE (FIXTURE)', LUMINAIRE_ROWS, adjAttrMap, prod.luminaire_component ?? null);
      spacer();

      // Section 2: LAMP / SOURCE
      renderSection('LAMP / SOURCE', LAMP_ROWS, adjAttrMap, prod.lamp_component ?? null);
      spacer();

      // Section 3: CONTROL GEAR
      renderSection('CONTROL GEAR / BALLAST / TRANSFORMER', CONTROL_GEAR_ROWS, adjAttrMap);
      spacer();

      // Other catch-all row
      checkPage(ROW_H);
      doc.rect(M, y, CW, ROW_H).fill(IDENTITY_BG);
      doc.fill(NA_FG).font('Helvetica-Bold').fontSize(8)
         .text('Other', M + 2, y + 2, { width: C1 - 4, lineBreak: false });
      y += ROW_H;

      // Page footers
      const totalPages = (doc as unknown as { bufferedPageRange(): { count: number } }).bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        (doc as unknown as { switchToPage(n: number): void }).switchToPage(i);
        const fy = PH - M;
        doc.moveTo(M, fy - 20).lineTo(M + CW, fy - 20)
           .strokeColor('#D9D9D9').lineWidth(0.4).stroke();
        doc.fill(NA_FG).font('Helvetica').fontSize(6.5)
           .text(`LightSelect — ${metadata.item_code}`, M, fy - 14, {
             width: CW / 2, lineBreak: false,
           })
           .text(`Page ${i + 1} of ${totalPages}`, M, fy - 14, {
             width: CW, align: 'right', lineBreak: false,
           });
      }

      (doc as unknown as { flushPages(): void }).flushPages();
      doc.end();
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
