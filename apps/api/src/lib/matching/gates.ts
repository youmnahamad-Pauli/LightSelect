/**
 * Gate evaluation: hard, soft, and conditional gates per the Matching Rules Spec §A.
 *
 * Returns an AttributeVerdict for each gate attribute.
 * Callers check passed_all_hard_gates before scoring.
 */
import type { LoadedRequirementAttr } from './types';
import type { MatchCandidate } from './types';
import type { AttributeVerdict } from './types';
import type { VerdictType } from '../../db/schema/matching';
import type { ProvenanceState } from '../../db/schema/matching';
import {
  compareIpGte,
  compareGte,
  compareLte,
  compareEq,
  compareContainsValue,
  compareDimmingContains,
  compareRangeCovers,
  compareCertifications,
  compareColourFamilyGate,
} from './comparators';
import { MATCHING_CONFIG as C } from './config';

/** Evaluate all gate-type attributes for one candidate product. */
export function evaluateGates(
  gateAttrs: LoadedRequirementAttr[],
  candidate: MatchCandidate,
  flags: { wind_load: boolean; dark_sky: boolean; bend_radius: boolean },
): AttributeVerdict[] {
  const results: AttributeVerdict[] = [];

  for (const attr of gateAttrs) {
    // Conditional gates: skip if the project flag is not set
    if (attr.gate_type === 'conditional') {
      const active =
        (attr.attribute_key.startsWith('epa_') && flags.wind_load) ||
        (attr.attribute_key.startsWith('wind_') && flags.wind_load) ||
        (attr.attribute_key.startsWith('bug_') && flags.dark_sky) ||
        (attr.attribute_key === 'dark_sky' && flags.dark_sky) ||
        (attr.attribute_key === 'bend_radius_mm' && flags.bend_radius) ||
        (attr.attribute_key === 'bend_plane' && flags.bend_radius);
      if (!active) continue;
    }

    const attrRow = candidate.attributes.get(attr.attribute_key);
    const productRaw  = attrRow?.attribute_value ?? null;
    const provenance: ProvenanceState = attrRow?.provenance ?? 'missing';

    let verdict: VerdictType;
    let note: string;

    switch (attr.operator) {
      case 'gte':
        verdict = attr.attribute_key === 'ip_rating'
          ? compareIpGte(productRaw, attr.target_value, true)
          : compareGte(productRaw, attr.target_value, true);
        note = buildNote(attr, productRaw, verdict);
        break;

      case 'lte':
        verdict = compareLte(productRaw, attr.target_value, true);
        note = buildNote(attr, productRaw, verdict);
        break;

      case 'eq':
        verdict = compareEq(productRaw, attr.target_value, true);
        note = buildNote(attr, productRaw, verdict);
        break;

      case 'contains_value':
        verdict = attr.attribute_key === 'dimming_protocol'
          ? compareDimmingContains(productRaw, attr.target_value)
          : compareContainsValue(productRaw, attr.target_value, true);
        note = buildNote(attr, productRaw, verdict);
        break;

      case 'range_covers':
        verdict = compareRangeCovers(productRaw, attr.target_value);
        note = buildNote(attr, productRaw, verdict);
        break;

      case 'contains_required_cert': {
        // Soft gate: certifications. product approvals_held checked via candidate.
        const reqCerts = attr.target_value.split(',').map((c) => c.trim()).filter(Boolean);
        const certVerdict = compareCertifications(candidate.approvals_held, reqCerts);
        verdict = certVerdict === 'comply'
          ? 'gate_pass'
          : certVerdict === 'deviation'
          ? 'gate_fail'
          : 'comment'; // comply-with-comment stays as 'comment' (not a hard failure)
        note = buildNote(attr, productRaw, verdict);
        break;
      }

      case 'colour_family_gate':
        verdict = compareColourFamilyGate(productRaw, attr.target_value);
        note = buildNote(attr, productRaw, verdict);
        break;

      default:
        verdict = 'gate_unverifiable';
        note = `Unknown gate operator: ${attr.operator}`;
    }

    results.push({
      attribute_key:   attr.attribute_key,
      required_value:  attr.target_value,
      required_operator: attr.operator,
      product_value:   productRaw,
      provenance,
      verdict,
      is_gate:         true,
      gate_type:       attr.gate_type,
      weight:          null,
      score:           null,
      weighted_score:  null,
      evidence_note:   note,
    });
  }

  return results;
}

/** Summarise which hard-gate verdicts failed. */
export function hardGateFailed(gateVerdicts: AttributeVerdict[]): boolean {
  return gateVerdicts
    .filter((v) => v.gate_type === 'hard')
    .some((v) => v.verdict === 'gate_fail');
}

/** Collect hard-gate failure details for storage. */
export function collectGateFailures(gateVerdicts: AttributeVerdict[]) {
  return gateVerdicts
    .filter((v) => v.gate_type === 'hard' && v.verdict === 'gate_fail')
    .map((v) => ({
      attr: v.attribute_key,
      reason: v.evidence_note,
      product_value: v.product_value,
      required: v.required_value,
    }));
}

/** Collect soft-gate comments (certifications absent). */
export function collectSoftComments(gateVerdicts: AttributeVerdict[]) {
  return gateVerdicts
    .filter((v) => v.gate_type === 'soft' && v.verdict === 'comment')
    .map((v) => ({ attr: v.attribute_key, reason: v.evidence_note }));
}

// ── Internal ──────────────────────────────────────────────────────────────────

function buildNote(attr: LoadedRequirementAttr, productRaw: string | null, verdict: VerdictType): string {
  const op = operatorLabel(attr.operator);
  const req = attr.target_unit ? `${attr.target_value} ${attr.target_unit}` : attr.target_value;
  const prod = productRaw ?? '(not found)';
  switch (verdict) {
    case 'gate_pass':      return `${attr.attribute_key}: ${prod} ${op} ${req} ✓`;
    case 'gate_fail':      return `${attr.attribute_key}: ${prod} fails ${op} ${req}`;
    case 'gate_unverifiable': return `${attr.attribute_key}: not found in product data (required ${op} ${req})`;
    case 'comment':        return `${attr.attribute_key}: ${prod} — comment (${op} ${req})`;
    default:               return `${attr.attribute_key}: ${prod} vs required ${req}`;
  }
}

function operatorLabel(op: string): string {
  switch (op) {
    case 'gte': return '≥';
    case 'lte': return '≤';
    case 'eq':  return '=';
    case 'contains_value': return 'contains';
    case 'range_covers': return 'covers';
    case 'contains_required_cert': return 'holds cert';
    case 'colour_family_gate': return 'colour-family=';
    default: return op;
  }
}
