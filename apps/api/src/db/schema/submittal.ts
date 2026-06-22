import { pgTable, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';

// ─── Submittal document types (superset of projectDocumentTypes) ──────────────

export const submittalDocumentTypes = [
  'compliance_statement',  // generated: satisfied when item has a resolved proposed product
  'test_certificate',
  'datasheet',
  'trade_licence',
  'submittal_template',
  'spec',
  'boq',
  'drawing_dwg',
  'other',
] as const;
export type SubmittalDocumentType = (typeof submittalDocumentTypes)[number];

// ─── Scope of a template item ─────────────────────────────────────────────────

export const submittalItemScopes = ['project', 'per_item'] as const;
export type SubmittalItemScope = (typeof submittalItemScopes)[number];

// ─── submittal_templates ──────────────────────────────────────────────────────

export const submittal_templates = pgTable('submittal_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  /** e.g. "AECOM Standard Lighting Submittal" */
  name: text('name').notNull(),
  /** Originating consultant, e.g. "AECOM". Null = generic / cross-consultant. */
  consultant: text('consultant'),
  description: text('description'),
  is_active: boolean('is_active').notNull().default(true),
  is_example: boolean('is_example').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── submittal_template_items ─────────────────────────────────────────────────

export const submittal_template_items = pgTable('submittal_template_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  template_id: uuid('template_id')
    .notNull()
    .references(() => submittal_templates.id, { onDelete: 'cascade' }),
  /**
   * Maps to ProjectDocumentType (extended with compliance_statement).
   * compliance_statement = satisfied when the schedule item has a resolved
   * proposed product (the AECOM sheet can be generated). Not an uploaded file.
   */
  document_type: text('document_type').$type<SubmittalDocumentType>().notNull(),
  label: text('label').notNull(),
  required: boolean('required').notNull().default(true),
  /**
   * 'project' = one document for the whole submittal (e.g. trade licence).
   * 'per_item' = one per schedule item / luminaire type (e.g. datasheet).
   */
  scope: text('scope').$type<SubmittalItemScope>().notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── submittal_override_log ───────────────────────────────────────────────────

/**
 * Records when a user explicitly overrides the completeness gate —
 * submitting or marking-ready despite missing items.
 * Keeps the audit trail without blocking the action.
 */
export const submittal_override_log = pgTable('submittal_override_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  template_id: uuid('template_id')
    .references(() => submittal_templates.id, { onDelete: 'set null' }),
  missing_items: text('missing_items').array().notNull(),
  override_reason: text('override_reason'),
  overridden_at: timestamp('overridden_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SubmittalTemplate = typeof submittal_templates.$inferSelect;
export type NewSubmittalTemplate = typeof submittal_templates.$inferInsert;
export type SubmittalTemplateItem = typeof submittal_template_items.$inferSelect;
export type NewSubmittalTemplateItem = typeof submittal_template_items.$inferInsert;
