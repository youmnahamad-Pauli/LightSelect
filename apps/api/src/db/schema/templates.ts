import { pgTable, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { consultant_templates } from './projects';
import { categories, document_types } from './categories';

export const consultant_template_sections = pgTable('consultant_template_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  consultant_template_id: uuid('consultant_template_id')
    .notNull()
    .references(() => consultant_templates.id, { onDelete: 'cascade' }),
  section_name: text('section_name').notNull(),
  section_code: text('section_code'),
  section_order: integer('section_order').notNull().default(0),
  is_required: boolean('is_required').default(false).notNull(),
  accepts_multiple_files: boolean('accepts_multiple_files').default(true).notNull(),
  description: text('description'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const consultant_section_rules = pgTable('consultant_section_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  consultant_template_section_id: uuid('consultant_template_section_id')
    .notNull()
    .references(() => consultant_template_sections.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  document_type_id: uuid('document_type_id').references(() => document_types.id, { onDelete: 'cascade' }),
  is_allowed: boolean('is_allowed').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ConsultantTemplateSection = typeof consultant_template_sections.$inferSelect;
export type NewConsultantTemplateSection = typeof consultant_template_sections.$inferInsert;
export type ConsultantSectionRule = typeof consultant_section_rules.$inferSelect;
