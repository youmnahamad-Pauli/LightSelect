/**
 * Matching engine — orchestrates the full evaluation flow for one requirement
 * against a pool of candidate canonical products.
 *
 * Flow per candidate:
 *   1. Type-scope: skip products whose luminaire_type ≠ requirement.luminaire_type
 *      (when both are set)
 *   2. Gate evaluation (hard + soft + conditional)
 *      → disqualify if any hard gate fails
 *   3. Scored attribute evaluation
 *   4. Fit calculation (Σ weighted scores / Σ weights × 100, capped if high-weight deviation)
 *   5. Confidence calculation (avg provenance score of applicable attrs)
 *   6. Rank surviving candidates by fit_score desc
 *
 * Results can be persisted to match_decisions + match_evidence via persistResults().
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matching_requirements, matching_requirement_attrs,
  match_decisions, match_evidence,
} from '../../db/schema/matching';
import { canonical_products, product_attribute_values } from '../../db/schema/registry';
import type {
  LoadedRequirement, MatchCandidate, MatchEvaluation, ResolvedAttributeValue,
} from './types';
import type { AttributeValueState } from '../../db/schema/registry';
import type { ProvenanceState } from '../../db/schema/matching';
import { evaluateGates, hardGateFailed, collectGateFailures, collectSoftComments } from './gates';
import { evaluateScoredAttributes, calculateFit } from './scorer';
import { calculateConfidence } from './confidence';

// ── Public API ────────────────────────────────────────────────────────────────

/** Load a requirement (with attrs) from the DB. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRequirement(db: NodePgDatabase<any>, requirementId: string): Promise<LoadedRequirement | null> {
  const [req] = await db
    .select()
    .from(matching_requirements)
    .where(eq(matching_requirements.id, requirementId))
    .limit(1);
  if (!req) return null;

  const attrs = await db
    .select()
    .from(matching_requirement_attrs)
    .where(eq(matching_requirement_attrs.requirement_id, requirementId));

  return { ...req, attrs };
}

/** Load all candidate products for an org (with their attribute values). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCandidates(db: NodePgDatabase<any>, orgId: string): Promise<MatchCandidate[]> {
  const products = await db
    .select()
    .from(canonical_products)
    .where(eq(canonical_products.org_id, orgId));

  const candidates: MatchCandidate[] = [];

  for (const p of products) {
    const attrRows = await db
      .select()
      .from(product_attribute_values)
      .where(eq(product_attribute_values.canonical_product_id, p.id));

    const attrMap = new Map<string, ResolvedAttributeValue>();
    for (const row of attrRows) {
      attrMap.set(row.attribute_key, {
        attribute_key:   row.attribute_key,
        attribute_value: row.attribute_value,
        provenance:      resolveProvenance(row.provenance_state, row.value_state),
        is_explicit_na:  row.value_state === 'not_applicable',
      });
    }

    candidates.push({
      canonical_product_id: p.id,
      display_name: p.display_name,
      luminaire_type: p.luminaire_type,
      approvals_held: p.approvals_held ?? null,
      attributes: attrMap,
    });
  }

  return candidates;
}

/** Run the full evaluation for one requirement against a candidate pool. */
export function runEvaluation(
  requirement: LoadedRequirement,
  candidates: MatchCandidate[],
): MatchEvaluation[] {
  const gateAttrs   = requirement.attrs.filter((a) => a.gate_type !== null);
  const scoredAttrs = requirement.attrs.filter((a) => a.gate_type === null);
  const flags = {
    wind_load:    requirement.flag_wind_load,
    dark_sky:     requirement.flag_dark_sky,
    bend_radius:  requirement.flag_bend_radius,
  };

  const evaluations: MatchEvaluation[] = [];

  for (const candidate of candidates) {
    // ── 1. Type-scope ─────────────────────────────────────────────────────────
    if (
      candidate.luminaire_type &&
      requirement.luminaire_type &&
      candidate.luminaire_type !== requirement.luminaire_type
    ) {
      evaluations.push({
        candidate,
        requirement_id: requirement.id,
        excluded: true,
        exclude_reason: `Luminaire type mismatch: product=${candidate.luminaire_type}, required=${requirement.luminaire_type}`,
        passed_all_hard_gates: false,
        gate_failures: [],
        soft_gate_comments: [],
        fit_score: null,
        is_fit_capped: false,
        fit_cap_reason: null,
        confidence_score: null,
        confidence_band: null,
        deviations_high_weight: 0,
        deviations_medium_weight: 0,
        deviations_low_weight: 0,
        comments_count: 0,
        evidence: [],
      });
      continue;
    }

    // ── 2. Gate evaluation ────────────────────────────────────────────────────
    const gateVerdicts = evaluateGates(gateAttrs, candidate, flags);
    const failedHard   = hardGateFailed(gateVerdicts);

    if (failedHard) {
      evaluations.push({
        candidate,
        requirement_id: requirement.id,
        excluded: false,
        exclude_reason: null,
        passed_all_hard_gates: false,
        gate_failures:     collectGateFailures(gateVerdicts),
        soft_gate_comments: collectSoftComments(gateVerdicts),
        fit_score: null,
        is_fit_capped: false,
        fit_cap_reason: null,
        confidence_score: null,
        confidence_band: null,
        deviations_high_weight: 0,
        deviations_medium_weight: 0,
        deviations_low_weight: 0,
        comments_count: 0,
        evidence: gateVerdicts,
      });
      continue;
    }

    // ── 3. Scored attributes ──────────────────────────────────────────────────
    const scoredVerdicts = evaluateScoredAttributes(scoredAttrs, candidate);
    const allEvidence    = [...gateVerdicts, ...scoredVerdicts];

    // ── 4. Fit ────────────────────────────────────────────────────────────────
    const fitResult = calculateFit(scoredVerdicts);

    // ── 5. Confidence ─────────────────────────────────────────────────────────
    const confResult = calculateConfidence(scoredVerdicts);

    evaluations.push({
      candidate,
      requirement_id: requirement.id,
      excluded: false,
      exclude_reason: null,
      passed_all_hard_gates: true,
      gate_failures:     collectGateFailures(gateVerdicts),
      soft_gate_comments: collectSoftComments(gateVerdicts),
      fit_score: fitResult.fit_score,
      is_fit_capped: fitResult.is_fit_capped,
      fit_cap_reason: fitResult.fit_cap_reason,
      confidence_score: confResult.confidence_score,
      confidence_band:  confResult.confidence_band,
      deviations_high_weight:   fitResult.deviations_high_weight,
      deviations_medium_weight: fitResult.deviations_medium_weight,
      deviations_low_weight:    fitResult.deviations_low_weight,
      comments_count:           fitResult.comments_count,
      evidence: allEvidence,
    });
  }

  // ── 6. Rank by fit_score desc (excluded/disqualified get no rank) ──────────
  const ranked = evaluations
    .filter((e) => !e.excluded && e.passed_all_hard_gates && e.fit_score !== null)
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));

  ranked.forEach((e, i) => {
    (e as MatchEvaluation & { _rank: number })._rank = i + 1;
  });

  // Attach rank back to the original evaluation objects
  const rankMap = new Map(ranked.map((e, i) => [e.candidate.canonical_product_id, i + 1]));

  return evaluations.map((e) => ({
    ...e,
    rank: rankMap.get(e.candidate.canonical_product_id) ?? null,
  } as MatchEvaluation & { rank?: number | null })) as MatchEvaluation[];
}

/** Persist evaluated results to match_decisions + match_evidence tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function persistResults(
  db: NodePgDatabase<any>,
  evaluations: (MatchEvaluation & { rank?: number | null })[],
): Promise<void> {
  for (const ev of evaluations) {
    const status = ev.excluded ? 'excluded' : ev.passed_all_hard_gates ? 'evaluated' : 'disqualified';

    const [decision] = await db
      .insert(match_decisions)
      .values({
        requirement_id:        ev.requirement_id,
        canonical_product_id:  ev.candidate.canonical_product_id,
        passed_all_hard_gates: ev.passed_all_hard_gates,
        gate_failures:         ev.gate_failures.length ? ev.gate_failures : null,
        soft_gate_comments:    ev.soft_gate_comments.length ? ev.soft_gate_comments : null,
        fit_score:             ev.fit_score,
        is_fit_capped:         ev.is_fit_capped,
        fit_cap_reason:        ev.fit_cap_reason,
        confidence_score:      ev.confidence_score,
        confidence_band:       ev.confidence_band,
        deviations_high_weight:   ev.deviations_high_weight,
        deviations_medium_weight: ev.deviations_medium_weight,
        deviations_low_weight:    ev.deviations_low_weight,
        comments_count:           ev.comments_count,
        rank:   (ev as MatchEvaluation & { rank?: number | null }).rank ?? null,
        status,
      })
      .onConflictDoUpdate({
        target: [match_decisions.requirement_id, match_decisions.canonical_product_id],
        set: {
          passed_all_hard_gates: ev.passed_all_hard_gates,
          gate_failures:         ev.gate_failures.length ? ev.gate_failures : null,
          soft_gate_comments:    ev.soft_gate_comments.length ? ev.soft_gate_comments : null,
          fit_score:             ev.fit_score,
          is_fit_capped:         ev.is_fit_capped,
          fit_cap_reason:        ev.fit_cap_reason,
          confidence_score:      ev.confidence_score,
          confidence_band:       ev.confidence_band,
          deviations_high_weight:   ev.deviations_high_weight,
          deviations_medium_weight: ev.deviations_medium_weight,
          deviations_low_weight:    ev.deviations_low_weight,
          comments_count:           ev.comments_count,
          rank:   (ev as MatchEvaluation & { rank?: number | null }).rank ?? null,
          status,
          updated_at: new Date(),
        },
      })
      .returning({ id: match_decisions.id });

    if (ev.evidence.length > 0) {
      // Delete old evidence rows for idempotency
      await db.delete(match_evidence).where(eq(match_evidence.match_decision_id, decision.id));

      await db.insert(match_evidence).values(
        ev.evidence.map((e) => ({
          match_decision_id: decision.id,
          attribute_key:     e.attribute_key,
          required_value:    e.required_value,
          required_operator: e.required_operator,
          product_value:     e.product_value,
          provenance:        e.provenance,
          verdict:           e.verdict,
          is_gate:           e.is_gate,
          gate_type:         e.gate_type,
          weight:            e.weight,
          score:             e.score,
          weighted_score:    e.weighted_score,
          evidence_note:     e.evidence_note,
        })),
      );
    }
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function resolveProvenance(
  provenanceState: string | null,
  valueState: AttributeValueState,
): ProvenanceState {
  if (provenanceState) return provenanceState as ProvenanceState;
  // Backwards-compat: map Phase 1 value_state to Phase 3 provenance
  switch (valueState) {
    case 'confirmed':     return 'human_confirmed';
    case 'not_applicable': return 'missing';
    default:              return 'extracted';
  }
}
