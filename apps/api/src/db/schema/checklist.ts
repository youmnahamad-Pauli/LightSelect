import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { categories, document_types } from './categories';
import { consultant_template_sections } from './templates';
import { project_files } from './project-files';

export const checklistItemSourceRules = [
  'consultant_requirement',
  'category_requirement',
  'manual',
] as const;
export type ChecklistItemSourceRule = (typeof checklistItemSourceRules)[number];

export const checklistItemStatuses = ['missing', 'complete', 'waived'] as const;
export type ChecklistItemStatus = (typeof checklistItemStatuses)[number];

export const checklist_items = pgTable(
  'checklist_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** For consultant_requirement items: the section this item covers. */
    consultant_template_section_id: uuid('consultant_template_section_id').references(
      () => consultant_template_sections.id,
      { onDelete: 'cascade' },
    ),
    /** For category_requirement items: the category this item covers. */
    category_id: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    /** For category_requirement items: the required document type. */
    document_type_id: uuid('document_type_id').references(() => document_types.id, {
      onDelete: 'cascade',
    }),
    /**
     * Stable deterministic key for upsert.
     * section:{section_id}  OR  cat:{category_id}:dt:{document_type_id}
     */
    item_key: text('item_key').notNull(),
    item_label: text('item_label').notNull(),
    source_rule: text('source_rule').$type<ChecklistItemSourceRule>().notNull(),
    is_required: boolean('is_required').default(true).notNull(),
    status: text('status').$type<ChecklistItemStatus>().notNull().default('missing'),
    resolved_by_project_file_id: uuid('resolved_by_project_file_id').references(
      () => project_files.id,
      { onDelete: 'set null' },
    ),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueKey: uniqueIndex('checklist_items_project_key_idx').on(
      table.project_id,
      table.item_key,
    ),
  }),
);

export type ChecklistItem = typeof checklist_items.$inferSelect;
