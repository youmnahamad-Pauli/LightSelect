import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users';
import { organizations } from './organizations';

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parent_category_id: uuid('parent_category_id').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  is_system_defined: boolean('is_system_defined').default(false).notNull(),
  description: text('description'),
  is_active: boolean('is_active').default(true).notNull(),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const document_types = pgTable('document_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  code: text('code').unique(),
  description: text('description'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const category_document_requirements = pgTable('category_document_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  category_id: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  document_type_id: uuid('document_type_id')
    .notNull()
    .references(() => document_types.id, { onDelete: 'cascade' }),
  is_required: boolean('is_required').default(true).notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type DocumentType = typeof document_types.$inferSelect;
export type CategoryDocumentRequirement = typeof category_document_requirements.$inferSelect;
