import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
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

/** Branding fields extracted from a consultant template for use in PDF rendering. */
export interface ConsultantBranding {
  headerTitle: string;
  logoUrl: string | null;
  brandColor: string | null;
}
