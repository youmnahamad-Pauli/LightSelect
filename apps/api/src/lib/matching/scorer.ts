/**
 * Scored attribute evaluation and fit calculation (Matching Rules Spec §B–C).
 *
 * Fit = Σ(weight × score) / Σ(weight) × 100
 *
 * High-weight deviation (weight ≥ HIGH_WEIGHT_THRESHOLD) caps the headline
 * fit score at FIT_CAP_PCT regardless of other attributes.
 */
import type { LoadedRequirementAttr } from './types';
import type { MatchCandidate } from './types';
import type { AttributeVerdict } from './types';
import type { VerdictType } from '../../db/schema/matching';
import type { ProvenanceState } from '../../db/schema/matching';
import {
  compareGte, compareLte, compareEq, compareContainsValue,
  compareMatchTarget, compareMatchTargetCct, compareMatchTargetLumen,
} from './comparators';
import { parseIpRating, parseAttributeValue } from './parse-value';
import { MATCHING_CONFIG as C } from './config';

// Attributes where unconfirmed basis (lumen output not test-backed) warrants a comment flag
const LUMEN_BASIS_ATTRS = new Set(['lumens', 'lumens_per_metre']);

// Wattage and lumen attribute keys — watts must be evaluated before lumens for the overshoot rule
const WATT_ATTR_KEYS  = new Set(['watts_per_metre', 'watts']);
const LUMEN_ATTR_KEYS = new Set(['lumens_per_metre', 'lumens']);

// Provenances that confirm the lumen value is a measured delivered output
const CONFIRMED_LUMEN_PROVENANCE = new Set<ProvenanceState>([
  'test_report_backed',
  'manufacturer_confirmed',
]);

/** Evaluate all scored (non-gate) attributes for one candidate. */
export function evaluateScoredAttributes(
  scoredAttrs: LoadedRequirementAttr[],
  candidate: MatchCandidate,
): AttributeVerdict[] {
  const results: AttributeVerdict[] = [];

  // Evaluate watts before lumens so the overshoot rule can read the watts verdict.
  const ordered = [
    ...scoredAttrs.filter((a) => WATT_ATTR_KEYS.has(a.attribute_key)),
    ...scoredAttrs.filter((a) => !WATT_ATTR_KEYS.has(a.attribute_key) && !LUMEN_ATTR_KEYS.has(a.attribute_key)),
    ...scoredAttrs.filter((a) => LUMEN_ATTR_KEYS.has(a.attribute_key)),
  ];
  const verdictCache = new Map<string, VerdictType>();

  for (const attr of ordered) {
    if (!attr.weight) continue;

    const attrRow   = candidate.attributes.get(attr.attribute_key);
    const productRaw: string | null = attrRow?.attribute_value ?? null;
    const provenance: ProvenanceState = attrRow?.provenance ?? 'missing';

    let verdict: VerdictType;
    let evidenceNote: string | null = null;

    if (attrRow?.is_explicit_na) {
      // Explicitly tagged not_applicable: excluded from denominator
      verdict = 'not_applicable';
    } else if (!productRaw) {
      // Missing: required attribute has no value → DEVIATION (included in weight total)
      verdict = 'deviation';
    } else {
      switch (attr.operator) {
        case 'gte':
          verdict = attr.attribute_key === 'ip_rating'
            ? (parseIpRating(productRaw) !== null && parseIpRating(attr.target_value) !== null
                ? parseIpRating(productRaw)! >= parseIpRating(attr.target_value)! ? 'comply' : 'deviation'
                : 'not_applicable')
            : compareGte(productRaw, attr.target_value, false) as VerdictType;
          break;
        case 'lte':
          verdict = compareLte(productRaw, attr.target_value, false) as VerdictType;
          break;
        case 'eq':
          verdict = compareEq(productRaw, attr.target_value, false) as VerdictType;
          break;
        case 'contains_value':
          verdict = compareContainsValue(productRaw, attr.target_value, false) as VerdictType;
          break;
        case 'match_target':
          verdict = compareMatchTarget(
            productRaw,
            attr.target_value,
            attr.tolerance_tight_pct ?? C.DEFAULT_TIGHT_TOLERANCE_PCT,
            attr.tolerance_outer_pct ?? C.DEFAULT_OUTER_TOLERANCE_PCT,
          );
          break;
        case 'match_target_cct': {
          const reqK = parseAttributeValue(attr.target_value).primary;
          if (reqK === null) {
            verdict = 'not_applicable';
            break;
          }
          if (attrRow?.cct_kelvin != null) {
            // Structured single value — compare directly
            const delta = Math.abs(attrRow.cct_kelvin - reqK);
            verdict = delta === 0 ? 'comply' : delta <= C.CCT_OUTER_ABS_K ? 'comment' : 'deviation';
          } else {
            // Legacy path: check if the raw value is a multi-value list
            const parsed = parseAttributeValue(productRaw);
            if (parsed.items.length > 1) {
              // Multi-value CCT stored at family level — data needs per-SKU re-ingestion
              verdict = 'deviation';
              evidenceNote = `cct: value "${productRaw}" is a family-level list, not this SKU's CCT — re-ingest to resolve per-SKU value`;
            } else {
              verdict = compareMatchTargetCct(productRaw, reqK, C.CCT_OUTER_ABS_K);
            }
          }
          break;
        }
        case 'match_target_lumen': {
          const dimmableRaw  = candidate.attributes.get('dimmable')?.attribute_value ?? null;
          const isDimmable   = dimmableRaw === 'true' ? true : dimmableRaw === 'false' ? false : null;
          const wattsVerdict = verdictCache.get('watts_per_metre') ?? verdictCache.get('watts');
          const wattsIsWithinSpec = wattsVerdict === undefined || wattsVerdict !== 'deviation';
          const lumenResult = compareMatchTargetLumen(
            productRaw,
            attr.target_value,
            attr.attribute_key,
            isDimmable,
            wattsIsWithinSpec,
          );
          verdict = lumenResult.verdict;
          if (lumenResult.note) evidenceNote = lumenResult.note;
          break;
        }
        default:
          verdict = 'not_applicable';
      }

      // Lumen basis flag — downgrade 'comply' to 'comment' when basis is unconfirmed
      if (
        verdict === 'comply' &&
        LUMEN_BASIS_ATTRS.has(attr.attribute_key) &&
        !CONFIRMED_LUMEN_PROVENANCE.has(provenance)
      ) {
        verdict = 'comment';
        evidenceNote = `${attr.attribute_key}: ${productRaw} meets target ${attr.target_value}${attr.target_unit ? ' ' + attr.target_unit : ''} — delivered output basis unconfirmed (verify from test report)`;
      }
    }

    const score         = verdictScore(verdict);
    const weightedScore = score !== null ? score * attr.weight : null;

    results.push({
      attribute_key:    attr.attribute_key,
      required_value:   attr.target_value,
      required_operator: attr.operator,
      product_value:    productRaw,
      provenance,
      verdict,
      is_gate:          false,
      gate_type:        null,
      weight:           attr.weight,
      score,
      weighted_score: weightedScore,
      evidence_note: evidenceNote ?? buildNote(attr, productRaw, verdict),
    });

    verdictCache.set(attr.attribute_key, verdict);
  }

  return results;
}

/** Calculate the headline fit score and cap from scored attribute verdicts. */
export function calculateFit(scoredVerdicts: AttributeVerdict[]): {
  fit_score: number;
  is_fit_capped: boolean;
  fit_cap_reason: string | null;
  deviations_high_weight: number;
  deviations_medium_weight: number;
  deviations_low_weight: number;
  comments_count: number;
} {
  const applicable = scoredVerdicts.filter(
    (v) => v.verdict !== 'not_applicable' && v.weight !== null,
  );

  const totalWeight = applicable.reduce((s, v) => s + (v.weight ?? 0), 0);
  const totalScore  = applicable.reduce((s, v) => s + (v.weighted_score ?? 0), 0);

  if (applicable.length === 0) {
    return {
      fit_score: 0,
      is_fit_capped: false,
      fit_cap_reason: null,
      deviations_high_weight: 0,
      deviations_medium_weight: 0,
      deviations_low_weight: 0,
      comments_count: 0,
    };
  }
  const rawFit = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

  const deviations = applicable.filter((v) => v.verdict === 'deviation');
  const deviations_high_weight   = deviations.filter((v) => (v.weight ?? 0) >= C.HIGH_WEIGHT_THRESHOLD).length;
  const deviations_medium_weight = deviations.filter(
    (v) => (v.weight ?? 0) >= 2 && (v.weight ?? 0) < C.HIGH_WEIGHT_THRESHOLD,
  ).length;
  const deviations_low_weight    = deviations.filter((v) => (v.weight ?? 0) < 2).length;
  const comments_count           = applicable.filter((v) => v.verdict === 'comment').length;

  const is_fit_capped = deviations_high_weight > 0 && rawFit > C.FIT_CAP_PCT;
  const fit_score     = is_fit_capped ? C.FIT_CAP_PCT : rawFit;
  const fit_cap_reason = deviations_high_weight > 0
    ? `High-weight deviation on: ${deviations.filter((v) => (v.weight ?? 0) >= C.HIGH_WEIGHT_THRESHOLD).map((v) => v.attribute_key).join(', ')}`
    : null;

  return {
    fit_score: Math.max(0, Math.min(100, fit_score)),
    is_fit_capped,
    fit_cap_reason,
    deviations_high_weight,
    deviations_medium_weight,
    deviations_low_weight,
    comments_count,
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function verdictScore(verdict: VerdictType): number | null {
  switch (verdict) {
    case 'comply':  return C.SCORE_COMPLY;
    case 'comment': return C.SCORE_COMMENT;
    case 'deviation': return C.SCORE_DEVIATION;
    default: return null; // not_applicable excluded from scoring
  }
}

function buildNote(attr: LoadedRequirementAttr, productRaw: string | null, verdict: VerdictType): string {
  const req  = attr.target_unit ? `${attr.target_value} ${attr.target_unit}` : attr.target_value;
  const prod = productRaw ?? '(missing)';
  switch (verdict) {
    case 'comply':   return `${attr.attribute_key}: ${prod} meets ${req}`;
    case 'comment':  return `${attr.attribute_key}: ${prod} — within outer tolerance of ${req} (comment)`;
    case 'deviation':
      return productRaw
        ? `${attr.attribute_key}: ${prod} does not meet ${req}`
        : `${attr.attribute_key}: no value found — required ${req}`;
    case 'not_applicable': return `${attr.attribute_key}: not applicable for this product`;
    default: return `${attr.attribute_key}: ${prod} vs ${req}`;
  }
}
