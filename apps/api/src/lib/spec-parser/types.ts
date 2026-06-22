/**
 * Types for the consultant spec parser pipeline.
 *
 * Flow:
 *   raw spec file
 *     → LLM (spec-llm.ts) → ExtractedSpecDocument
 *     → attr-mapper.ts    → MappedSpecItem[]
 *     → writer.ts         → ParsedSpecResult (written to DB)
 */

// ── Raw LLM output ──────────────────────────────────────────────────────────

/** One attribute value extracted by the LLM from the spec. */
export interface RawExtractedAttr {
  /** Must be a key from ATTR_CONFIG. */
  attribute_key: string;
  /**
   * The raw value string as extracted (e.g. "900", "3000", "IP44", "24V DC").
   * Numeric prefix only — no operator symbol (the config provides the operator).
   */
  value: string;
  /**
   * Confidence 0.0–1.0 of this extraction.
   * 1.0 = verbatim from a clearly-structured table cell.
   * <0.7 = inferred from prose or ambiguous text.
   */
  confidence: number;
  /** Source hint (page or section reference in the spec document). */
  source_reference: string | null;
}

/** One line item as extracted by the LLM. */
export interface ExtractedSpecItem {
  /** Item code as printed, e.g. "LCL-015". */
  item_code: string;
  /** Short description from the spec. */
  description: string;
  /**
   * Luminaire type as classified by the LLM. Must be a canonical_type from
   * LUMINAIRE_TYPES, or null when the LLM cannot classify with confidence.
   * Null items are flagged for human review.
   */
  luminaire_type: string | null;
  /** Confidence 0.0–1.0 of the luminaire type classification. */
  luminaire_type_confidence: number;
  /** Reason given by LLM when luminaire_type is null or low-confidence. */
  luminaire_type_note: string | null;
  /** Extracted attribute values. Keys must exist in ATTR_CONFIG. */
  attributes: RawExtractedAttr[];
  /** Page or section reference in the spec document. */
  source_reference: string | null;
}

/** Full LLM extraction result. */
export interface ExtractedSpecDocument {
  items: ExtractedSpecItem[];
  meta: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    elapsed_ms: number;
  };
}

// ── Post-mapping ────────────────────────────────────────────────────────────

/** One attribute resolved through the locked attr config. */
export interface MappedAttr {
  attribute_key: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  gate_type: 'hard' | 'soft' | 'conditional' | null;
  weight: number | null;
  notes: string;
}

/** One informational field (not written to matching_requirement_attrs). */
export interface InformationalAttr {
  key: string;
  label: string;
  value: string;
}

/** A spec item after mapping through the locked config. */
export interface MappedSpecItem {
  item_code: string;
  description: string;
  luminaire_type: string | null;
  luminaire_type_confidence: number;
  luminaire_type_note: string | null;
  source_reference: string | null;
  matchable_attrs: MappedAttr[];
  informational_attrs: InformationalAttr[];
  /** Keys that the LLM returned but are not in ATTR_CONFIG (logged, not written). */
  unknown_keys: string[];
  /** Values where the LLM confidence was below 0.7 (flagged for review). */
  low_confidence_flags: string[];
}

// ── DB write result ─────────────────────────────────────────────────────────

/** What was written to the DB for one spec item. */
export interface SpecItemWriteResult {
  requirement_id: string;
  item_code: string;
  luminaire_type: string | null;
  luminaire_type_confidence: number;
  matchable_attrs_written: number;
  informational_attrs_count: number;
  unknown_keys: string[];
  low_confidence_flags: string[];
  needs_review: boolean;
}

/** Full result of the spec parse pipeline run. */
export interface SpecParseResult {
  source_file: string;
  parsed_at: string;
  org_id: string;
  items_detected: number;
  items_written: number;
  items: SpecItemWriteResult[];
  llm_meta: ExtractedSpecDocument['meta'];
}

/** Options for running the pipeline. */
export interface SpecParseOptions {
  filePath: string;
  orgId: string;
  model?: string;
  /** If provided, restrict to only items whose item_code matches any substring. */
  itemFilter?: string[];
}
