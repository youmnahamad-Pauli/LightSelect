import { pgTable, uuid, text, real, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const exportPackageStatuses = ['queued', 'generated', 'failed'] as const;
export type ExportPackageStatus = (typeof exportPackageStatuses)[number];

export const exportArtifactTypes = ['placeholder', 'pdf', 'xlsx', 'zip', 'other'] as const;
export type ExportArtifactType = (typeof exportArtifactTypes)[number];

// ─── Tables ────────────────────────────────────────────────────────────────

/**
 * One row per export attempt. Snapshot fields make old exports immutable
 * even when the live project changes.
 */
export const export_packages = pgTable('export_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  status: text('status').$type<ExportPackageStatus>().notNull().default('queued'),
  artifact_type: text('artifact_type').$type<ExportArtifactType>().notNull().default('placeholder'),
  /** Absolute-path-safe storage key understood by the storage adapter. */
  artifact_path: text('artifact_path'),
  /** Public or API-served URL for the artifact download. */
  artifact_url: text('artifact_url'),
  /** FK to the spec version that was active at export time. */
  snapshot_active_spec_document_id: uuid('snapshot_active_spec_document_id'),
  /** Serialised ChecklistSnapshot — see export-snapshot.ts for shape. */
  snapshot_checklist_summary: jsonb('snapshot_checklist_summary'),
  /** Serialised BoqSnapshot — see export-snapshot.ts for shape. */
  snapshot_boq_summary: jsonb('snapshot_boq_summary'),
  snapshot_notes: text('snapshot_notes'),
  error_message: text('error_message'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Immutable snapshot of section ↔ file composition at export time.
 * project_file_id / file_id are nullable — rows still exist even if the
 * live records are later deleted.
 */
export const export_package_items = pgTable('export_package_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  export_package_id: uuid('export_package_id')
    .notNull()
    .references(() => export_packages.id, { onDelete: 'cascade' }),
  section_id: uuid('section_id'),
  section_name: text('section_name').notNull(),
  section_code: text('section_code'),
  section_order: integer('section_order').notNull().default(0),
  is_section_required: boolean('is_section_required').default(false).notNull(),
  project_file_id: uuid('project_file_id'),
  file_id: uuid('file_id'),
  file_name: text('file_name'),
  category_name: text('category_name'),
  document_type_name: text('document_type_name'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Immutable BOQ schedule snapshot — one row per BOQ item at export time.
 */
export const export_package_boq_items = pgTable('export_package_boq_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  export_package_id: uuid('export_package_id')
    .notNull()
    .references(() => export_packages.id, { onDelete: 'cascade' }),
  boq_item_id: uuid('boq_item_id'),
  description: text('description').notNull(),
  category_name: text('category_name'),
  quantity: real('quantity').notNull().default(1),
  unit: text('unit').notNull().default('pcs'),
  product_name: text('product_name'),
  manufacturer: text('manufacturer'),
  model_code: text('model_code'),
  compliance_score: real('compliance_score'),
  unit_price: real('unit_price'),
  total_price: real('total_price'),
  currency: text('currency'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Multiple downloadable artifacts per export package.
 * Allows XLSX + PDF to coexist for the same export without schema changes to export_packages.
 * Primary artifact (XLSX) is still mirrored on export_packages for backward compat.
 */
export const export_package_artifacts = pgTable('export_package_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  export_package_id: uuid('export_package_id')
    .notNull()
    .references(() => export_packages.id, { onDelete: 'cascade' }),
  artifact_type: text('artifact_type').$type<ExportArtifactType>().notNull(),
  /** Human-readable label for UI display, e.g. "BOQ Workbook" or "Package Summary PDF". */
  label: text('label').notNull(),
  artifact_path: text('artifact_path').notNull(),
  artifact_url: text('artifact_url'),
  sort_order: integer('sort_order').notNull().default(0),
  /** Set if this artifact failed to generate (e.g. PDF renderer error). */
  error_message: text('error_message'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ───────────────────────────────────────────────────────

export type ExportPackage = typeof export_packages.$inferSelect;
export type ExportPackageItem = typeof export_package_items.$inferSelect;
export type ExportPackageBoqItem = typeof export_package_boq_items.$inferSelect;
export type ExportPackageArtifact = typeof export_package_artifacts.$inferSelect;
