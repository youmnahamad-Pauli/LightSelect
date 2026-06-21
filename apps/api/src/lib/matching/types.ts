import type { VerdictType, GateType, ProvenanceState } from '../../db/schema/matching';

/** Fully loaded requirement with its attribute constraints. */
export interface LoadedRequirement {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  luminaire_type: string;
  description: string | null;
  approvals_required: string[] | null;
  flag_wind_load: boolean;
  flag_dark_sky: boolean;
  flag_bend_radius: boolean;
  attrs: LoadedRequirementAttr[];
}

export interface LoadedRequirementAttr {
  id: string;
  attribute_key: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  tolerance_tight_pct: number | null;
  tolerance_outer_pct: number | null;
  gate_type: GateType | null;
  weight: number | null;
  notes: string | null;
}

/** Attribute value row from the DB with provenance resolved to Phase 3 states. */
export interface ResolvedAttributeValue {
  attribute_key: string;
  attribute_value: string | null;
  provenance: ProvenanceState;
}

/** Fully loaded candidate product for matching. */
export interface MatchCandidate {
  canonical_product_id: string;
  display_name: string;
  luminaire_type: string | null;
  approvals_held: string[] | null;
  attributes: Map<string, ResolvedAttributeValue>;
}

/** Result of evaluating one requirement constraint against one candidate. */
export interface AttributeVerdict {
  attribute_key: string;
  required_value: string;
  required_operator: string;
  product_value: string | null;
  provenance: ProvenanceState;
  verdict: VerdictType;
  is_gate: boolean;
  gate_type: GateType | null;
  weight: number | null;
  score: number | null;
  weighted_score: number | null;
  evidence_note: string;
}

/** Complete evaluation output for one requirement × candidate pair. */
export interface MatchEvaluation {
  candidate: MatchCandidate;
  requirement_id: string;
  excluded: boolean;
  exclude_reason: string | null;
  passed_all_hard_gates: boolean;
  gate_failures: { attr: string; reason: string; product_value: string | null; required: string }[];
  soft_gate_comments: { attr: string; reason: string }[];
  fit_score: number | null;
  is_fit_capped: boolean;
  fit_cap_reason: string | null;
  confidence_score: number | null;
  confidence_band: string | null;
  deviations_high_weight: number;
  deviations_medium_weight: number;
  deviations_low_weight: number;
  comments_count: number;
  evidence: AttributeVerdict[];
}
