import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { files } from './files';
import { categories, document_types } from './categories';
import { consultant_template_sections } from './templates';
import { products } from './products';

export const projectFileScopes = ['product', 'category', 'project'] as const;
export type ProjectFileScope = (typeof projectFileScopes)[number];

export const projectFileRequiredStatuses = ['required', 'optional', 'reference'] as const;
export type ProjectFileRequiredStatus = (typeof projectFileRequiredStatuses)[number];

export const project_files = pgTable('project_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  file_id: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  category_id: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  document_type_id: uuid('document_type_id')
    .notNull()
    .references(() => document_types.id),
  consultant_template_section_id: uuid('consultant_template_section_id')
    .notNull()
    .references(() => consultant_template_sections.id),
  product_id: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  scope: text('scope').$type<ProjectFileScope>().notNull().default('project'),
  required_status: text('required_status').$type<ProjectFileRequiredStatus>().notNull().default('required'),
  version_label: text('version_label'),
  notes: text('notes'),
  is_active: boolean('is_active').default(true).notNull(),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ProjectFile = typeof project_files.$inferSelect;
export type NewProjectFile = typeof project_files.$inferInsert;
