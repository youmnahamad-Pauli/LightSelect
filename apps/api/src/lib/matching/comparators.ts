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
