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
 *   - ProposedProduct carries both archetype and lumen_representation so
 *     any template can render source vs delivered without DB re-queries.
 */

/** Normalised verdict for the export spine. */
export type SpineVerdict = 'comply' | 'comply_with_comment' | 'deviation' | 'delivered_pending';

/**
 * Informational specified attribute captured by the spec parser.
 * Not evaluated by the matching engine — used for the export Specified column only.
 */
export interface InformationalAttr {
  key: string;
  label: string;
  value: string;
}

/**
 * Reliability of the product data used to compute the compliance assessment.
 *   verified             — measured or published by manufacturer.
 *   estimated_placeholder — key value(s) estimated (e.g. diffuser transmission); output not verified.
 *   uncharacterised      — archetype unknown or critical value absent; basis unconfirmed.
 */
export type DataQuality = 'verified' | 'estimated_placeholder' | 'uncharacterised';

/**
 * Identity fields for one physical component within a configured product.
 *   luminaire_component — the profile/diffuser (AECOM Section 1: LUMINAIRE)
 *   lamp_component      — the LED strip/tape  (AECOM Section 2: LAMP / SOURCE)
 */
export interface ComponentIdentity {
  manufacturer: string | null;
  model_code: string | null;
  display_name: string | null;
}

/**
 * Physical construction archetype of the proposed product.
 *
 *   preassembled    — factory-built luminaire; published lm figure is delivered output.
 *   component_build — strip + profile + diffuser; delivered = source × diffuser_transmission.
 *                     If transmission not characterised → delivered_lumens = null (PENDING).
 *   unknown         — archetype not confirmed; lumen basis unverified. Flag for review.
 */
export type ProductArchetype = 'preassembled' | 'component_build' | 'unknown';

/**
 * Lumen output with explicit source vs delivered basis.
 *
 * For component_build products without characterised diffuser_transmission,
 * delivered_lumens is null and pending_reason explains why. Templates must
 * NEVER substitute source_lumens for delivered_lumens in this case.
 */
export interface LumenRepresentation {
  /** Bare strip/module output (lm or lm/m depending on product type). */
  source_lumens: number | null;
  /**
   * Output reaching the application.
   *   preassembled  → equals published figure (basis='delivered').
   *   component_build with transmission → source × transmission.
   *   component_build without transmission → null (PENDING).
   *   unknown       → equals source_lumens (unconfirmed basis).
   */
  delivered_lumens: number | null;
  /** Which figure the published spec cites. */
  basis: 'source' | 'delivered';
  /** Fractional transmission (0.0–1.0). Null if not characterised. */
  diffuser_transmission: number | null;
  /** How transmission was obtained: 'combo_tested' | 'published' | 'estimated'. Null if no transmission. */
  transmission_provenance: string | null;
  /** Unit string, e.g. "lm/m" for tape, "lm" for fixture. */
  unit: string;
  /** Delivered ÷ wattage (lm/W). Null when delivered is pending. */
  efficacy_lm_per_w: number | null;
  /** Non-null when delivered_lumens is null — explains why it's pending. */
  pending_reason: string | null;
}

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
  /** Physical construction archetype — drives lumen basis and template rendering. */
  archetype: ProductArchetype;
  /**
   * Source and delivered lumen figures with explicit basis.
   * Null if no lumen attribute was found in the product data or evidence.
   */
  lumen_representation: LumenRepresentation | null;
  /**
   * True when this product is a configured product (strip + profile/diffuser combo).
   * Templates use this to decide whether to render component sections separately.
   */
  is_configured_product: boolean;
  /**
   * Profile/diffuser component identity. Non-null for configured products.
   * Maps to AECOM Section 1 (LUMINAIRE / FIXTURE).
   */
  luminaire_component: ComponentIdentity | null;
  /**
   * LED strip/tape component identity. Non-null for configured products.
   * Maps to AECOM Section 2 (LAMP / SOURCE).
   */
  lamp_component: ComponentIdentity | null;
  /**
   * All raw product_attribute_values for this product, keyed by attribute_key.
   * Templates can reach any attribute not surfaced by adjudicated evidence.
   */
  raw_attributes: Record<string, string | null>;
  /**
   * Reliability signal for this product's assessment.
   * 'estimated_placeholder' means one or more critical values are estimated,
   * not measured — templates must render a prominent warning.
   */
  data_quality: DataQuality;
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
  /**
   * true when this product was selected as an override (operator chose a
   * disqualified or pending_characterisation candidate). The AECOM template
   * must render a visible override notice inside the sheet.
   */
  is_override: boolean;
  /**
   * Human-readable reason for the override, composed from the actual
   * decision status and gate failures. Non-null iff is_override=true.
   * e.g. "disqualified on ip_rating, voltage" or
   *      "pending_characterisation — delivered output not characterised"
   */
  override_reason: string | null;
  /**
   * true when no assessable candidate exists for this requirement.
   * The sheet is a stub: Specified populated from requirement attrs,
   * Proposed blank, Comments show "No compliant candidate identified".
   */
  no_candidate: boolean;
  /**
   * true when proposed_product.data_quality = 'estimated_placeholder'.
   * Convenience flag so templates don't have to inspect the nested field.
   * Templates must render a prominent data-quality warning when true.
   */
  is_placeholder: boolean;
  /**
   * Informational specified attributes from the spec parser (not engine-evaluated).
   * Used to populate the Specified column for standing rows that lack adjudicated evidence.
   */
  informational_attrs: InformationalAttr[];
}

export interface RenderOptions {
  /** Output format — template may ignore if it only supports one format. */
  format?: 'xlsx' | 'pdf';
  /** BCP-47 locale for date/number formatting. Default 'en-GB'. */
  locale?: string;
}
