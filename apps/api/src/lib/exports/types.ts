/**
 * Phase 5 exports — spine types.
 *
 * ComplianceStatement is the consultant-agnostic data model produced by
 * MatchDecisionExportSource. Templates receive this and render it to a
 * file buffer.
 *
 * Design intent:
 *   - verdict and comment are SEPARATE fields so each template decides how
 *     to compose them (e.g. AECOM: "Comply with <comment>").
 *   - gate_results duplicates gate evidence as a summary; attributes list
 *     covers every adjudicated item (gates + scored) in evaluation order.
 */

/** Normalised verdict for the export spine. */
export type SpineVerdict = 'comply' | 'comply_with_comment' | 'deviation';

export interface StatementMetadata {
  project_name: string;
  /** Consultant name — "AECOM", "WSP", etc. */
  consultant: string;
  /** Display date string, e.g. "21 Jun 2026". */
  date: string;
  revision: string;
  /** Document reference code, e.g. "LS-2026-001". */
  ref: string;
  /** Sheet / item code, e.g. "FLEX-TAPE". Used as the XLSX sheet name. */
  item_code: string;
  /** Human-readable item type label, e.g. "Flexible LED Tape — Soft Cove 3000K". */
  item_type: string;
}

export interface ProposedProduct {
  display_name: string;
  manufacturer: string | null;
  model_code: string | null;
  country_of_origin: string | null;
  fit_score: number | null;
  rank: number | null;
}

/**
 * One row in the compliance table — covers both gate and scored attributes.
 *
 * verdict=null means not_applicable; templates typically skip these rows.
 * comment holds the engine's evidence_note, cleaned of the attribute-key
 * prefix — templates use it to compose "Comply with <comment>" etc.
 */
export interface AttributeEntry {
  attribute_key: string;
  label: string;
  /** Formatted requirement — e.g. "≥ IP20", "3000 K", "~2000 lm/m". */
  specified_value: string | null;
  /** Raw product value from match evidence. */
  proposed_value: string | null;
  verdict: SpineVerdict | null;
  comment: string | null;
  provenance: string | null;
  is_gate: boolean;
  weight: number | null;
}

export interface GateResult {
  attribute_key: string;
  label: string;
  verdict: 'pass' | 'fail' | 'unverifiable';
  product_value: string | null;
  required_value: string | null;
}

export interface ComplianceStatement {
  metadata: StatementMetadata;
  general_description: string;
  proposed_product: ProposedProduct;
  /**
   * All adjudicated entries (gates first, then scored attrs in evaluation
   * order). not_applicable entries are included with verdict=null.
   */
  attributes: AttributeEntry[];
  /** Gate-only summary (subset of attributes where is_gate=true). */
  gate_results: GateResult[];
}

export interface RenderOptions {
  /** Output format — template may ignore if it only supports one format. */
  format?: 'xlsx' | 'pdf';
  /** BCP-47 locale for date/number formatting. Default 'en-GB'. */
  locale?: string;
}
