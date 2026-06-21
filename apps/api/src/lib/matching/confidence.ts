/**
 * Confidence model — Matching Rules Spec §D.
 *
 * Confidence = average provenance score across all applicable scored attributes.
 * Provenance scores are defined in MATCHING_CONFIG.PROVENANCE_SCORES.
 *
 * Band thresholds (configurable):
 *   ≥ CONFIDENCE_HIGH → 'High'
 *   ≥ CONFIDENCE_MED  → 'Med'
 *   else              → 'Low'
 */
import type { AttributeVerdict } from './types';
import type { ProvenanceState } from '../../db/schema/matching';
import { MATCHING_CONFIG as C } from './config';

export function calculateConfidence(scoredVerdicts: AttributeVerdict[]): {
  confidence_score: number;
  confidence_band: string;
} {
  // Only attribute rows that contributed to scoring (not not_applicable)
  const applicable = scoredVerdicts.filter((v) => v.verdict !== 'not_applicable');

  if (applicable.length === 0) {
    return { confidence_score: 0, confidence_band: 'Low' };
  }

  const scores = applicable.map((v) =>
    C.PROVENANCE_SCORES[v.provenance as ProvenanceState] ?? C.PROVENANCE_SCORES.extracted,
  );

  const avg = scores.reduce((s, p) => s + p, 0) / scores.length;

  return {
    confidence_score: Math.round(avg * 1000) / 1000,
    confidence_band:  avg >= C.CONFIDENCE_HIGH ? 'High' : avg >= C.CONFIDENCE_MED ? 'Med' : 'Low',
  };
}
