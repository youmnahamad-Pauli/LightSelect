/**
 * Match scoring module — Priority 14.
 *
 * Computes a weighted composite match score for a product against spec requirements.
 * Produces a per-candidate explanation (matched / deviated / missing attributes).
 *
 * Future enhancements:
 *   - per-consultant weight profiles stored in consultant_templates
 *   - configurable tolerance bands per attribute
 *   - machine-learning weight adjustment from user selection history
 */
import { compareProductToSpec } from '../spec/comparator';
import { normalizeValue } from '../spec/normalize';
import type { SpecRequirement } from '../../db/schema/spec';
import type { ProductAttribute } from '../../db/schema/products';
import type { ComparisonResultRow } from '../spec/comparator';

// ─── Attribute importance weights ─────────────────────────────────────────
// Higher = more important for scoring. Mandatory requirements are always weighted
// higher than preferred; these weights are multiplied on top of that.

export const ATTRIBUTE_WEIGHTS: Record<string, number> = {
  // Photometric — directly affects lighting performance
  lumens: 2.0,
  watts: 2.0,
  efficacy: 1.5,
  cct: 2.5,        // exact CCT match critical for uniformity
  cri: 2.0,
  beam_angle: 1.5,
  // Compliance — code-driven, non-negotiable on most projects
  ip_rating: 2.5,
  ik_rating: 1.5,
  certifications: 1.5,
  // Electrical
  voltage: 1.5,
  dimming: 1.5,
  operating_temp: 1.0,
  // Performance
  lifetime_hours: 1.0,
  warranty: 0.5,
  // Physical
  mounting: 1.0,
  dimensions: 0.8,
  material: 0.5,
  weight: 0.5,
  finish: 0.3,
  // Identity — low weight; presence is useful, not critical
  manufacturer: 0.3,
  family_name: 0.2,
  model_number: 0.3,
  description: 0.1,
  application: 0.4,
  accessories: 0.3,
  notes: 0.1,
};

const DEFAULT_WEIGHT = 1.0;
const PREFERRED_MULTIPLIER = 0.5; // preferred requirements count at half weight

// ─── Score bands ─────────────────────────────────────────────────────────

export type MatchBand = 'strong' | 'acceptable' | 'weak' | 'none';

export function scoreToBand(score: number): MatchBand {
  if (score >= 0.80) return 'strong';
  if (score >= 0.55) return 'acceptable';
  if (score >= 0.25) return 'weak';
  return 'none';
}

// ─── Explanation types ────────────────────────────────────────────────────

export interface AttributeMatch {
  key: string;
  label: string;
  value: string;
}

export interface AttributeDeviation {
  key: string;
  label: string;
  product_value: string;
  spec_requirement: string;
}

export interface AttributeMissing {
  key: string;
  label: string;
  spec_requirement: string;
}

export interface MatchResult {
  match_score: number;
  match_band: MatchBand;
  matched_attributes: AttributeMatch[];
  deviated_attributes: AttributeDeviation[];
  missing_attributes: AttributeMissing[];
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
  total_count: number;
}

// ─── Numeric closeness ────────────────────────────────────────────────────

function closenessBonus(productValue: string | null, specValue: string): number {
  if (!productValue) return 0;
  const pv = normalizeValue(productValue);
  const sv = normalizeValue(specValue);
  if (pv.numeric === null || sv.numeric === null || sv.numeric === 0) return 0;
  const maxVal = Math.max(Math.abs(pv.numeric), Math.abs(sv.numeric));
  const diff = Math.abs(pv.numeric - sv.numeric);
  return Math.max(0, 1.0 - diff / maxVal);
}

// ─── Main scorer ──────────────────────────────────────────────────────────

export function scoreProduct(
  requirements: SpecRequirement[],
  attributes: ProductAttribute[],
): MatchResult {
  if (requirements.length === 0) {
    return {
      match_score: 0,
      match_band: 'none',
      matched_attributes: [],
      deviated_attributes: [],
      missing_attributes: [],
      compliant_count: 0,
      deviated_count: 0,
      missing_count: 0,
      review_needed_count: 0,
      total_count: 0,
    };
  }

  const { results, summary } = compareProductToSpec(requirements, attributes);
  const resultByKey = new Map<string, ComparisonResultRow>(
    results.map((r) => [r.attribute_key, r]),
  );
  const reqByKey = new Map<string, SpecRequirement>(
    requirements.map((r) => [r.attribute_key, r]),
  );

  let totalWeight = 0;
  let weightedScore = 0;

  const matched: AttributeMatch[] = [];
  const deviated: AttributeDeviation[] = [];
  const missing: AttributeMissing[] = [];

  for (const req of requirements) {
    const baseWeight = ATTRIBUTE_WEIGHTS[req.attribute_key] ?? DEFAULT_WEIGHT;
    const priorityMultiplier = req.priority === 'mandatory' ? 1.0 : PREFERRED_MULTIPLIER;
    const weight = baseWeight * priorityMultiplier;
    totalWeight += weight;

    const result = resultByKey.get(req.attribute_key);
    if (!result) continue;

    const specReqStr = `${req.operator} ${req.target_value}${req.target_unit ? ' ' + req.target_unit : ''}`;

    switch (result.comparison_status) {
      case 'compliant': {
        // Full score + small closeness bonus for numeric attributes
        const bonus = closenessBonus(result.compared_value, req.target_value);
        weightedScore += weight * (1.0 + bonus * 0.05);
        if (result.compared_value) {
          matched.push({ key: req.attribute_key, label: req.attribute_label, value: result.compared_value });
        }
        break;
      }
      case 'review_needed':
        // Partial credit — uncertain but not confirmed fail
        weightedScore += weight * 0.5;
        if (result.compared_value) {
          matched.push({ key: req.attribute_key, label: req.attribute_label, value: `${result.compared_value} (unconfirmed)` });
        }
        break;
      case 'deviated':
        // No score contribution
        deviated.push({
          key: req.attribute_key,
          label: req.attribute_label,
          product_value: result.compared_value ?? '?',
          spec_requirement: specReqStr,
        });
        break;
      case 'missing':
        // No score contribution
        missing.push({ key: req.attribute_key, label: req.attribute_label, spec_requirement: specReqStr });
        break;
    }
  }

  const raw_score = totalWeight === 0 ? 0 : weightedScore / totalWeight;
  const match_score = parseFloat(Math.min(1.0, raw_score).toFixed(3));

  return {
    match_score,
    match_band: scoreToBand(match_score),
    matched_attributes: matched.slice(0, 6), // top 6 for display
    deviated_attributes: deviated,
    missing_attributes: missing,
    compliant_count: summary.compliant_count,
    deviated_count: summary.deviated_count,
    missing_count: summary.missing_count,
    review_needed_count: summary.review_needed_count,
    total_count: summary.compliant_count + summary.deviated_count + summary.missing_count + summary.review_needed_count,
  };
}
