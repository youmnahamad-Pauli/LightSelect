import { pgTable, uuid, text, boolean, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';
import { organizations } from './organizations';

export const projectStatuses = ['draft', 'active', 'archived'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

/**
 * Stub for Priority 3. Full section + rule tables are added there.
 * The columns here match the final schema doc exactly.
 */
export const consultant_templates = pgTable('consultant_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  consultant_name: text('consultant_name').notNull(),
  template_name: text('template_name').notNull(),
  version: text('version'),
  description: text('description'),
  is_active: boolean('is_active').default(true).notNull(),
  /**
   * Optional consultant branding for PDF exports.
   * logo_url: publicly accessible image URL (PNG/JPEG).
   * brand_color: hex colour string, e.g. '#1A3C6E'. Falls back to LightSelect default when null.
   */
  logo_url: text('logo_url'),
  brand_color: text('brand_color'),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  project_name: text('project_name').notNull(),
  client_name: text('client_name'),
  consultant_name: text('consultant_name'),
  project_code: text('project_code'),
  location: text('location'),
  revision_label: text('revision_label'),
  notes: text('notes'),
  status: text('status').$type<ProjectStatus>().notNull().default('draft'),
  consultant_template_id: uuid('consultant_template_id').references(() => consultant_templates.id, {
    onDelete: 'set null',
  }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ConsultantTemplate = typeof consultant_templates.$inferSelect;

export const projectDocumentTypes = [
  'spec', 'boq', 'drawing_dwg', 'submittal_template',
  'test_certificate', 'datasheet', 'trade_licence', 'other',
] as const;
export type ProjectDocumentType = (typeof projectDocumentTypes)[number];

export const project_documents = pgTable('project_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organization_id: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  uploaded_by: uuid('uploaded_by').notNull().references(() => users.id),
  original_filename: text('original_filename').notNull(),
  stored_path: text('stored_path').notNull(),
  mime_type: text('mime_type'),
  file_size_bytes: integer('file_size_bytes'),
  document_type: text('document_type').$type<ProjectDocumentType>().notNull().default('other'),
  item_id: uuid('item_id'),
  product_id: uuid('product_id'),
  metadata: jsonb('metadata'),
  uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ProjectDocument = typeof project_documents.$inferSelect;
export type NewProjectDocument = typeof project_documents.$inferInsert;

/** Branding fields extracted from a consultant template for use in PDF rendering. */
export interface ConsultantBranding {
  headerTitle: string;
  logoUrl: string | null;
  brandColor: string | null;
}
