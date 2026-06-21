import {
  pgTable, uuid, text, real, integer, boolean, jsonb, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { canonical_products } from './registry';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const matchingOperators = [
  'gte',                    // ≥ target_value  (IP rating, CRI, depth, min-cut-interval)
  'lte',                    // ≤ target_value  (W/m, max run length)
  'eq',                     // = target_value  (voltage for DC, dimming protocol)
  'range_covers',           // product range must span [target_min..target_max]  (operating temp)
  'match_target',           // within tolerance_tight_pct → comply; outer → comment; beyond → deviation
  'contains_value',         // CCT list contains the required value
  'contains_required_cert', // certifications list contains all required certs (soft gate)
  'member_of',              // distribution_type in the controlled vocabulary list
] as const;
export type MatchingOperator = (typeof matchingOperators)[number];

export const gateTypes = ['hard', 'soft', 'conditional'] as const;
export type GateType = (typeof gateTypes)[number];

export const matchDecisionStatuses = ['evaluated', 'disqualified', 'excluded'] as const;
export type MatchDecisionStatus = (typeof matchDecisionStatuses)[number];

export const verdictTypes = [
  'comply',
  'comment',
  'deviation',
  'not_applicable',
  'gate_pass',
  'gate_fail',
  'gate_unverifiable',
] as const;
export type VerdictType = (typeof verdictTypes)[number];

// Phase 3 extended provenance states (superset of Phase 1 value_state).
// Engine reads provenance_state on product_attribute_values when set,
// otherwise falls back from value_state.
export const provenanceStates = [
  'test_report_backed',   // score 1.0 — backed by a third-party test report
  'manufacturer_confirmed', // score 1.0 — confirmed directly by the manufacturer
  'human_confirmed',      // score 0.9 — a user has manually verified the value
  'extracted',            // score 0.6 — LLM-extracted from a catalogue PDF
  'missing',              // score 0.0 — attribute not found for this product
] as const;
export type ProvenanceState = (typeof provenanceStates)[number];

// ─── matching_requirements ───────────────────────────────────────────────────

export const matching_requirements = pgTable('matching_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  /** Friendly label for this requirement set, e.g. "LED Strip — Soft Cove 3000K". */
  name: text('name').notNull(),
  /** Candidate products must have this luminaire_type to be considered. */
  luminaire_type: text('luminaire_type').notNull(),
  description: text('description'),
  /** Certifications or scheme approvals that candidate products must hold or obtain. */
  approvals_required: text('approvals_required').array(),
  // Conditional gate activation flags (only evaluate those gates when true)
  flag_wind_load: boolean('flag_wind_load').notNull().default(false),
  flag_dark_sky: boolean('flag_dark_sky').notNull().default(false),
  flag_bend_radius: boolean('flag_bend_radius').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── matching_requirement_attrs ──────────────────────────────────────────────

export const matching_requirement_attrs = pgTable('matching_requirement_attrs', {
  id: uuid('id').defaultRandom().primaryKey(),
  requirement_id: uuid('requirement_id')
    .notNull()
    .references(() => matching_requirements.id, { onDelete: 'cascade' }),
  attribute_key: text('attribute_key').notNull(),
  operator: text('operator').$type<MatchingOperator>().notNull(),
  target_value: text('target_value').notNull(),
  target_unit: text('target_unit'),
  /** Tight tolerance % for match_target operator (within → comply). Default 2%. */
  tolerance_tight_pct: real('tolerance_tight_pct'),
  /** Outer tolerance % for match_target operator (within → comment, beyond → deviation). Default 10%. */
  tolerance_outer_pct: real('tolerance_outer_pct'),
  /** 'hard' | 'soft' | 'conditional'; null = scored attribute (not a gate). */
  gate_type: text('gate_type').$type<GateType>(),
  /** Scoring weight: 1 | 1.5 | 2 | 2.5 | 3. Only populated when gate_type is null. */
  weight: real('weight'),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── match_decisions ─────────────────────────────────────────────────────────

export const match_decisions = pgTable(
  'match_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requirement_id: uuid('requirement_id')
      .notNull()
      .references(() => matching_requirements.id, { onDelete: 'cascade' }),
    canonical_product_id: uuid('canonical_product_id')
      .notNull()
      .references(() => canonical_products.id, { onDelete: 'cascade' }),
    // Gate results
    passed_all_hard_gates: boolean('passed_all_hard_gates'),
    gate_failures: jsonb('gate_failures')
      .$type<{ attr: string; reason: string; product_value: string | null; required: string }[]>(),
    soft_gate_comments: jsonb('soft_gate_comments')
      .$type<{ attr: string; reason: string }[]>(),
    // Scored fit
    fit_score: real('fit_score'),
    is_fit_capped: boolean('is_fit_capped').notNull().default(false),
    fit_cap_reason: text('fit_cap_reason'),
    // Confidence
    confidence_score: real('confidence_score'),
    confidence_band: text('confidence_band'), // 'High' | 'Med' | 'Low'
    // Deviation profile
    deviations_high_weight: integer('deviations_high_weight').notNull().default(0),
    deviations_medium_weight: integer('deviations_medium_weight').notNull().default(0),
    deviations_low_weight: integer('deviations_low_weight').notNull().default(0),
    comments_count: integer('comments_count').notNull().default(0),
    // Result
    rank: integer('rank'),
    status: text('status').$type<MatchDecisionStatus>().notNull().default('evaluated'),
    evaluated_at: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueReqProduct: uniqueIndex('match_decisions_req_product_idx')
      .on(table.requirement_id, table.canonical_product_id),
  }),
);

// ─── match_evidence ──────────────────────────────────────────────────────────

export const match_evidence = pgTable('match_evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  match_decision_id: uuid('match_decision_id')
    .notNull()
    .references(() => match_decisions.id, { onDelete: 'cascade' }),
  attribute_key: text('attribute_key').notNull(),
  // Required side
  required_value: text('required_value'),
  required_operator: text('required_operator'),
  // Product side
  product_value: text('product_value'),
  provenance: text('provenance').$type<ProvenanceState>(),
  // Result
  verdict: text('verdict').$type<VerdictType>().notNull(),
  is_gate: boolean('is_gate').notNull().default(false),
  gate_type: text('gate_type').$type<GateType>(),
  weight: real('weight'),
  score: real('score'),
  weighted_score: real('weighted_score'),
  evidence_note: text('evidence_note'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type MatchingRequirement = typeof matching_requirements.$inferSelect;
export type NewMatchingRequirement = typeof matching_requirements.$inferInsert;
export type MatchingRequirementAttr = typeof matching_requirement_attrs.$inferSelect;
export type NewMatchingRequirementAttr = typeof matching_requirement_attrs.$inferInsert;
export type MatchDecision = typeof match_decisions.$inferSelect;
export type NewMatchDecision = typeof match_decisions.$inferInsert;
export type MatchEvidence = typeof match_evidence.$inferSelect;
export type NewMatchEvidence = typeof match_evidence.$inferInsert;
