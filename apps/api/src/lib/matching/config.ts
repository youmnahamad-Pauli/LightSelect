/**
 * All matching engine constants in one place — change here, never in logic files.
 */

export const MATCHING_CONFIG = {
  // ── Scoring constants ──────────────────────────────────────────────────────
  /** Score for a full Comply verdict. */
  SCORE_COMPLY: 1.0,
  /** Score for a Comply-with-comment verdict. */
  SCORE_COMMENT: 0.7,
  /** Score for a Deviation verdict. */
  SCORE_DEVIATION: 0.0,

  // ── High-weight deviation cap ──────────────────────────────────────────────
  /** Weight threshold at or above which a deviation triggers the fit cap. */
  HIGH_WEIGHT_THRESHOLD: 2.5,
  /** Maximum fit% when a high-weight deviation is present. */
  FIT_CAP_PCT: 80,

  // ── Default match_target tolerances ───────────────────────────────────────
  /** Within ±this % of target → Comply. */
  DEFAULT_TIGHT_TOLERANCE_PCT: 2,
  /** Within ±this % of target → Comment; beyond → Deviation. */
  DEFAULT_OUTER_TOLERANCE_PCT: 10,

  // ── CCT absolute-K tolerance (match_target_cct operator) ──────────────────
  /** Closest CCT in product list within this many K of target → comment; 0K delta → comply. */
  CCT_OUTER_ABS_K: 100,

  // ── Lumen-output bands (match_target_lumen operator) ──────────────────────
  /** Within ±this % of lumen target → Comply (symmetric tight band). */
  LUMEN_TIGHT_PCT: 2,
  /** Undershoot: -(this)% to -TIGHT% → Comment; beyond -(this)% → Deviation. */
  LUMEN_UNDERSHOOT_COMMENT_PCT: 10,
  /** Overshoot comment limit for DIMMABLE products (+2% to +this% → Comment). */
  LUMEN_OVERSHOOT_COMMENT_PCT_DIMMABLE: 20,
  /** Overshoot comment limit for NON-DIMMABLE or unknown-dimmability products (+2% to +this% → Comment). */
  LUMEN_OVERSHOOT_COMMENT_PCT_NONDIMMABLE: 10,

  // ── Provenance confidence scores ───────────────────────────────────────────
  PROVENANCE_SCORES: {
    test_report_backed: 1.0,
    manufacturer_confirmed: 1.0,
    human_confirmed: 0.9,
    extracted: 0.6,
    missing: 0.0,
  } as Record<string, number>,

  // ── Confidence band thresholds ─────────────────────────────────────────────
  /** avg provenance score ≥ this → 'High' */
  CONFIDENCE_HIGH: 0.8,
  /** avg provenance score ≥ this → 'Med' (else 'Low') */
  CONFIDENCE_MED: 0.5,

  // ── Weight vocabulary ──────────────────────────────────────────────────────
  WEIGHT_HIGH: 3,
  WEIGHT_HIGH_MED: 2.5,
  WEIGHT_MED: 2,
  WEIGHT_MED_LOW: 1.5,
  WEIGHT_LOW: 1,
} as const;
