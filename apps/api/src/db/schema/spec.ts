import { pgTable, uuid, text, integer, real, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { files } from './files';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const requirementPriorities = ['mandatory', 'preferred', 'optional'] as const;
export type RequirementPriority = (typeof requirementPriorities)[number];

export const requirementStatuses = ['extracted', 'reviewed', 'manual'] as const;
export type RequirementStatus = (typeof requirementStatuses)[number];

/**
 * eq = exact match, gte/lte/gt/lt = numeric comparison,
 * contains = substring (useful for certifications, dimming protocols),
 * range = between target_value and tolerance_value,
 * any = any non-null value acceptable
 */
export const requirementOperators = [
  'eq', 'gte', 'lte', 'gt', 'lt', 'contains', 'range', 'any',
] as const;
export type RequirementOperator = (typeof requirementOperators)[number];

export const comparisonTargetTypes = ['product', 'project_file'] as const;
export type ComparisonTargetType = (typeof comparisonTargetTypes)[number];

export const comparisonRunStatuses = ['queued', 'running', 'completed', 'failed'] as const;
export type ComparisonRunStatus = (typeof comparisonRunStatuses)[number];

export const comparisonResultStatuses = [
  'compliant', 'deviated', 'missing', 'review_needed',
] as const;
export type ComparisonResultStatus = (typeof comparisonResultStatuses)[number];

// ─── Tables ────────────────────────────────────────────────────────────────

/**
 * One row per uploaded (or manually created) spec document version.
 * Only one version per project can be is_active at a time.
 */
export const project_spec_documents = pgTable('project_spec_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** Nullable — spec may be entered manually without a source file. */
  file_id: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  version_label: text('version_label').notNull(),
  notes: text('notes'),
  is_active: boolean('is_active').default(false).notNull(),
  uploaded_by: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Structured requirements extracted from (or manually entered into) a spec version.
 * attribute_key maps to STANDARD_ATTRIBUTES keys used in product_attributes.
 */
export const project_spec_requirements = pgTable('project_spec_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  spec_document_id: uuid('spec_document_id')
    .notNull()
    .references(() => project_spec_documents.id, { onDelete: 'cascade' }),
  section_name: text('section_name'),
  requirement_group: text('requirement_group'),
  attribute_key: text('attribute_key').notNull(),
  attribute_label: text('attribute_label').notNull(),
  operator: text('operator').$type<RequirementOperator>().notNull().default('eq'),
  target_value: text('target_value').notNull(),
  target_unit: text('target_unit'),
  tolerance_value: text('tolerance_value'),
  tolerance_unit: text('tolerance_unit'),
  priority: text('priority').$type<RequirementPriority>().notNull().default('mandatory'),
  status: text('status').$type<RequirementStatus>().notNull().default('extracted'),
  source_reference: text('source_reference'),
  notes: text('notes'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Stored diff between two spec versions.
 * diff_summary shape: { added: Req[], removed: Req[], changed: ChangedReq[], counts: {...} }
 */
export const spec_version_diffs = pgTable('spec_version_diffs', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  from_spec_document_id: uuid('from_spec_document_id')
    .notNull()
    .references(() => project_spec_documents.id, { onDelete: 'cascade' }),
  to_spec_document_id: uuid('to_spec_document_id')
    .notNull()
    .references(() => project_spec_documents.id, { onDelete: 'cascade' }),
  diff_summary: jsonb('diff_summary').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One comparison run = one spec version vs one product/file.
 * Summary counts are denormalized for fast display.
 */
export const spec_comparison_runs = pgTable('spec_comparison_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  spec_document_id: uuid('spec_document_id')
    .notNull()
    .references(() => project_spec_documents.id, { onDelete: 'cascade' }),
  target_type: text('target_type').$type<ComparisonTargetType>().notNull(),
  target_id: uuid('target_id').notNull(),
  target_label: text('target_label'),
  run_status: text('run_status').$type<ComparisonRunStatus>().notNull().default('completed'),
  compliant_count: integer('compliant_count').default(0).notNull(),
  deviated_count: integer('deviated_count').default(0).notNull(),
  missing_count: integer('missing_count').default(0).notNull(),
  review_needed_count: integer('review_needed_count').default(0).notNull(),
  created_by: uuid('created_by').notNull().references(() => users.id),
  compared_at: timestamp('compared_at', { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-requirement comparison result within a run.
 * override_* allow manual correction of the machine-computed verdict.
 */
export const spec_comparison_results = pgTable('spec_comparison_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  comparison_run_id: uuid('comparison_run_id')
    .notNull()
    .references(() => spec_comparison_runs.id, { onDelete: 'cascade' }),
  spec_requirement_id: uuid('spec_requirement_id')
    .notNull()
    .references(() => project_spec_requirements.id, { onDelete: 'cascade' }),
  attribute_key: text('attribute_key').notNull(),
  compared_value: text('compared_value'),
  compared_unit: text('compared_unit'),
  comparison_status: text('comparison_status').$type<ComparisonResultStatus>().notNull(),
  deviation_reason: text('deviation_reason'),
  confidence_score: real('confidence_score'),
  source_reference: text('source_reference'),
  /** Manual override — takes precedence over comparison_status in UI. */
  override_status: text('override_status').$type<ComparisonResultStatus>(),
  override_notes: text('override_notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ───────────────────────────────────────────────────────

export type SpecDocument = typeof project_spec_documents.$inferSelect;
export type SpecRequirement = typeof project_spec_requirements.$inferSelect;
export type SpecVersionDiff = typeof spec_version_diffs.$inferSelect;
export type SpecComparisonRun = typeof spec_comparison_runs.$inferSelect;
export type SpecComparisonResult = typeof spec_comparison_results.$inferSelect;
