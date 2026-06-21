/**
 * Comparison operators: map a requirement constraint + product value → verdict.
 *
 * Each function returns:
 *   'comply'          — product fully meets the constraint
 *   'comment'         — product partially meets it (comment required)
 *   'deviation'       — product does not meet it
 *   'not_applicable'  — comparison cannot be made (missing value treated separately)
 *   'gate_unverifiable' — gate constraint but product value is absent
 */
import type { VerdictType } from '../../db/schema/matching';
import {
  parseAttributeValue, parseIpRating, lowerBound, upperBound, midpoint, normCert,
} from './parse-value';
import { MATCHING_CONFIG as C } from './config';

// ── ≥ operator ────────────────────────────────────────────────────────────────

/** IP rating: product IP must be ≥ required. Compares the two-digit number (20, 65, …). */
export function compareIpGte(productRaw: string | null, requiredRaw: string, isGate: boolean): VerdictType {
  if (!productRaw) return isGate ? 'gate_unverifiable' : 'not_applicable';
  const prodIp = parseIpRating(productRaw);
  const reqIp  = parseIpRating(requiredRaw);
  if (prodIp === null || reqIp === null) return isGate ? 'gate_unverifiable' : 'not_applicable';
  return prodIp >= reqIp ? (isGate ? 'gate_pass' : 'comply') : (isGate ? 'gate_fail' : 'deviation');
}

/** Generic ≥ numeric comparison. Uses the product's lower bound (worst case). */
export function compareGte(productRaw: string | null, requiredRaw: string, isGate: boolean): VerdictType {
  if (!productRaw) return isGate ? 'gate_unverifiable' : 'not_applicable';
  const prod = lowerBound(parseAttributeValue(productRaw));
  const req  = parseAttributeValue(requiredRaw).primary;
  if (prod === null || req === null) return isGate ? 'gate_unverifiable' : 'not_applicable';
  return prod >= req ? (isGate ? 'gate_pass' : 'comply') : (isGate ? 'gate_fail' : 'deviation');
}

/** Generic ≤ numeric comparison. Uses the product's upper bound (worst case). */
export function compareLte(productRaw: string | null, requiredRaw: string, isGate: boolean): VerdictType {
  if (!productRaw) return isGate ? 'gate_unverifiable' : 'not_applicable';
  const prod = upperBound(parseAttributeValue(productRaw));
  const req  = parseAttributeValue(requiredRaw).primary;
  if (prod === null || req === null) return isGate ? 'gate_unverifiable' : 'not_applicable';
  return prod <= req ? (isGate ? 'gate_pass' : 'comply') : (isGate ? 'gate_fail' : 'deviation');
}

// ── Exact equality ────────────────────────────────────────────────────────────

/**
 * Equality for voltage: DC must match exactly (24V ≠ 48V).
 * Strips units, compares normalised strings; falls back to numeric equality.
 */
export function compareEq(productRaw: string | null, requiredRaw: string, isGate: boolean): VerdictType {
  if (!productRaw) return isGate ? 'gate_unverifiable' : 'not_applicable';
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  if (norm(productRaw) === norm(requiredRaw)) return isGate ? 'gate_pass' : 'comply';
  // Numeric fallback
  const pv = parseAttributeValue(productRaw).primary;
  const rv = parseAttributeValue(requiredRaw).primary;
  if (pv !== null && rv !== null && Math.abs(pv - rv) < 0.001) return isGate ? 'gate_pass' : 'comply';
  return isGate ? 'gate_fail' : 'deviation';
}

// ── Contains (substring/membership) ──────────────────────────────────────────

/**
 * CCT list or protocol list: the product's value must contain the required value.
 * e.g. product CCT = "2700K, 3000K, 4000K" must contain "3000K".
 */
export function compareContainsValue(productRaw: string | null, requiredRaw: string, isGate: boolean): VerdictType {
  if (!productRaw) return isGate ? 'gate_unverifiable' : 'not_applicable';
  const prodNorm  = productRaw.toLowerCase().replace(/\s+/g, '');
  const reqNorm   = requiredRaw.toLowerCase().replace(/\s+/g, '');
  const found = prodNorm.includes(reqNorm);
  return found ? (isGate ? 'gate_pass' : 'comply') : (isGate ? 'gate_fail' : 'deviation');
}

/**
 * Dimming protocol: product's dimming capability must include the required protocol.
 * "0-10V" contains "0-10V" → gate_pass; "DALI" does not contain "0-10V" → gate_fail.
 */
export function compareDimmingContains(productRaw: string | null, requiredRaw: string): VerdictType {
  if (!productRaw) return 'gate_unverifiable';
  const prod = productRaw.toLowerCase();
  const req  = requiredRaw.toLowerCase();
  return prod.includes(req) ? 'gate_pass' : 'gate_fail';
}

// ── Operating temp range covers ───────────────────────────────────────────────

/**
 * Product's operating temp range must cover the required range.
 * e.g. product = "-20°C to +50°C", required = "-10°C to +40°C" → gate_pass.
 * Parses both sides as numeric ranges.
 */
export function compareRangeCovers(productRaw: string | null, requiredRaw: string): VerdictType {
  if (!productRaw) return 'gate_unverifiable';
  const prod = parseAttributeValue(productRaw);
  const req  = parseAttributeValue(requiredRaw);
  if (prod.min === null || prod.max === null || req.min === null || req.max === null) {
    return 'gate_unverifiable';
  }
  return prod.min <= req.min && prod.max >= req.max ? 'gate_pass' : 'gate_fail';
}

// ── Match-target (lm/m, lux) ─────────────────────────────────────────────────

/**
 * Product value must be within tolerance bands of the required target.
 *   |delta%| ≤ tight → comply
 *   |delta%| ≤ outer → comment
 *   otherwise        → deviation
 */
export function compareMatchTarget(
  productRaw: string | null,
  requiredRaw: string,
  tightPct: number = C.DEFAULT_TIGHT_TOLERANCE_PCT,
  outerPct: number = C.DEFAULT_OUTER_TOLERANCE_PCT,
): VerdictType {
  if (!productRaw) return 'not_applicable';
  const prodMid = midpoint(parseAttributeValue(productRaw));
  const reqVal  = parseAttributeValue(requiredRaw).primary;
  if (prodMid === null || reqVal === null || reqVal === 0) return 'not_applicable';
  const deltaPct = Math.abs((prodMid - reqVal) / reqVal) * 100;
  if (deltaPct <= tightPct) return 'comply';
  if (deltaPct <= outerPct) return 'comment';
  return 'deviation';
}

/**
 * Asymmetric lumen-output comparator (match_target_lumen operator).
 *
 * Undershoot (delta < 0):
 *   |delta| ≤ LUMEN_TIGHT_PCT            → comply (lumen-basis may downgrade to comment)
 *   |delta| ≤ LUMEN_UNDERSHOOT_COMMENT_PCT → comment
 *   otherwise                             → deviation
 *
 * Overshoot (delta > 0), watts NOT within spec:
 *   → deviation (power over spec; extra lumens not credible)
 *
 * Overshoot (delta > 0), watts within spec:
 *   delta ≤ LUMEN_TIGHT_PCT              → comply (lumen-basis may downgrade to comment)
 *   dimmable=true:  delta ≤ LUMEN_OVERSHOOT_COMMENT_PCT_DIMMABLE    → comment
 *   dimmable=false/null: delta ≤ LUMEN_OVERSHOOT_COMMENT_PCT_NONDIMMABLE → comment
 *   otherwise                             → deviation
 *
 * Returns the verdict and a pre-built evidence note (empty string when verdict=comply,
 * letting the caller fall through to lumen-basis-downgrade or buildNote).
 */
export function compareMatchTargetLumen(
  productRaw: string | null,
  requiredRaw: string,
  attrKey: string,
  isDimmable: boolean | null,
  wattsIsWithinSpec: boolean,
): { verdict: VerdictType; note: string } {
  if (!productRaw) return { verdict: 'not_applicable', note: '' };
  const prodMid = midpoint(parseAttributeValue(productRaw));
  const reqVal  = parseAttributeValue(requiredRaw).primary;
  if (prodMid === null || reqVal === null || reqVal === 0) {
    return { verdict: 'not_applicable', note: '' };
  }

  const delta    = ((prodMid - reqVal) / reqVal) * 100;
  const absDelta = Math.abs(delta);

  if (absDelta <= C.LUMEN_TIGHT_PCT) {
    return { verdict: 'comply', note: '' };
  }

  if (delta < 0) {
    // Undershoot
    if (absDelta <= C.LUMEN_UNDERSHOOT_COMMENT_PCT) {
      return {
        verdict: 'comment',
        note: `${attrKey}: ${productRaw} — undershoot ${absDelta.toFixed(1)}% within −${C.LUMEN_UNDERSHOOT_COMMENT_PCT}% band`,
      };
    }
    return {
      verdict: 'deviation',
      note: `${attrKey}: ${productRaw} — undershoot ${absDelta.toFixed(1)}% exceeds −${C.LUMEN_UNDERSHOOT_COMMENT_PCT}% limit`,
    };
  }

  // Overshoot (delta > 0)
  if (!wattsIsWithinSpec) {
    return {
      verdict: 'deviation',
      note: `${attrKey}: ${productRaw} — overshoot +${delta.toFixed(1)}%; watts over spec → deviation`,
    };
  }

  const overshootLimit = isDimmable === true
    ? C.LUMEN_OVERSHOOT_COMMENT_PCT_DIMMABLE
    : C.LUMEN_OVERSHOOT_COMMENT_PCT_NONDIMMABLE;
  const dimmableLabel = isDimmable === true ? 'dimmable' : isDimmable === false ? 'non-dimmable' : 'dimmability unknown';

  if (delta <= overshootLimit) {
    return {
      verdict: 'comment',
      note: `${attrKey}: ${productRaw} — overshoot +${delta.toFixed(1)}%; watts OK + ${dimmableLabel} → within +${overshootLimit}% band`,
    };
  }
  return {
    verdict: 'deviation',
    note: `${attrKey}: ${productRaw} — overshoot +${delta.toFixed(1)}% exceeds +${overshootLimit}% limit (${dimmableLabel})`,
  };
}

// ── Colour family gate ────────────────────────────────────────────────────

const WHITE_FAMILIES  = new Set(['white', 'tunable_white', 'dim_to_warm']);
const COLOUR_FAMILIES = new Set(['rgb', 'rgbw', 'rgbww', 'rgbic']);

/**
 * Colour family hard gate per Matching Rules Spec §B.
 *
 * WHITE requirement: only white / tunable_white / dim_to_warm qualify.
 *   Any colour channel product (rgb, rgbw, rgbic) → gate_fail.
 *
 * Colour requirement: white-only products → gate_fail.
 *   RGBIC over-capable for RGB spec → gate_pass (superset).
 */
export function compareColourFamilyGate(
  productFamily: string | null,
  requiredFamily: string,
): VerdictType {
  if (!productFamily) return 'gate_unverifiable';
  const prod = productFamily.toLowerCase().trim();
  const req  = requiredFamily.toLowerCase().trim();

  if (WHITE_FAMILIES.has(req)) {
    return WHITE_FAMILIES.has(prod) ? 'gate_pass' : 'gate_fail';
  }

  if (req === 'rgb') {
    return COLOUR_FAMILIES.has(prod) ? 'gate_pass' : 'gate_fail';
  }

  if (req === 'rgbw' || req === 'rgbww') {
    return (prod === 'rgbw' || prod === 'rgbww' || prod === 'rgbic') ? 'gate_pass' : 'gate_fail';
  }

  if (req === 'rgbic') {
    return prod === 'rgbic' ? 'gate_pass' : 'gate_fail';
  }

  // Unknown requirement family: exact match
  return prod === req ? 'gate_pass' : 'gate_fail';
}

// ── CCT match-target (absolute-K tolerance) ───────────────────────────────

/**
 * CCT scored comparator (match_target_cct operator).
 *
 * For a product CCT list like "2700K, 3000K, 4000K":
 *   • Finds the closest CCT to the required value.
 *   • delta = 0 → comply; 0 < delta ≤ outerAbsK → comment; delta > outerAbsK → deviation.
 *
 * For tunable-white expressed as a range (e.g. "2700K – 6500K"):
 *   • If the required CCT falls within the range → comply.
 *
 * Returns 'not_applicable' only if the value cannot be parsed at all.
 */
export function compareMatchTargetCct(
  productRaw: string | null,
  requiredK: number,
  outerAbsK: number,
): VerdictType {
  if (!productRaw) return 'not_applicable';
  const parsed = parseAttributeValue(productRaw);

  // Tunable-white range: if required CCT is covered → comply
  if (parsed.min !== null && parsed.max !== null && parsed.items.length === 0) {
    if (parsed.min <= requiredK && requiredK <= parsed.max) return 'comply';
    const delta = Math.min(
      Math.abs(parsed.min - requiredK),
      Math.abs(parsed.max - requiredK),
    );
    return delta <= outerAbsK ? 'comment' : 'deviation';
  }

  // Discrete list (most common: "2700K, 3000K, 4000K" → items = ['2700', '3000', '4000'])
  if (parsed.items.length > 0) {
    const ccts = parsed.items.map((s) => parseFloat(s)).filter((n) => !isNaN(n));
    if (ccts.length === 0) return 'not_applicable';
    const minDelta = Math.min(...ccts.map((v) => Math.abs(v - requiredK)));
    if (minDelta === 0) return 'comply';
    return minDelta <= outerAbsK ? 'comment' : 'deviation';
  }

  // Single value
  if (parsed.primary !== null) {
    const delta = Math.abs(parsed.primary - requiredK);
    if (delta === 0) return 'comply';
    return delta <= outerAbsK ? 'comment' : 'deviation';
  }

  return 'not_applicable';
}

// ── Certifications soft gate ──────────────────────────────────────────────────

/**
 * Certifications soft gate: checks whether the product holds ALL required certs.
 *
 * Return 'comply'   — all required certs present in product.approvals_held
 * Return 'comment'  — some certs absent (standard case: comply-with-comment means
 *                     "supplier to obtain before delivery")
 *
 * 'deviation' is only raised if the product or supplier has confirmed it will
 * NOT obtain a required cert — this is expressed by approvals_held containing
 * "will_not_obtain:<cert>". This is unlikely in extracted data but supported.
 */
export function compareCertifications(
  productApprovalsHeld: string[] | null,
  requiredCerts: string[],
): VerdictType {
  if (requiredCerts.length === 0) return 'comply';
  if (!productApprovalsHeld || productApprovalsHeld.length === 0) return 'comment';

  const heldNorm = productApprovalsHeld.map(normCert);
  const willNotObtain = heldNorm
    .filter((h) => h.startsWith('willnotobtain:'))
    .map((h) => h.slice('willnotobtain:'.length));

  let allPresent = true;
  let anyWillNotObtain = false;

  for (const cert of requiredCerts) {
    const cn = normCert(cert);
    if (!heldNorm.includes(cn)) {
      allPresent = false;
      if (willNotObtain.includes(cn)) anyWillNotObtain = true;
    }
  }

  if (allPresent) return 'comply';
  if (anyWillNotObtain) return 'deviation';
  return 'comment'; // absent → comply-with-comment (standard case)
}
