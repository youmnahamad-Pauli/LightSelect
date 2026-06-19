import { pgTable, uuid, text, real, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { categories } from './categories';

export const productSourceTypes = ['pdf_extract', 'manual', 'import'] as const;
export type ProductSourceType = (typeof productSourceTypes)[number];

export const productStatuses = ['draft', 'reviewed', 'approved'] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const attributeValueSources = ['extracted', 'manual', 'na'] as const;
export type AttributeValueSource = (typeof attributeValueSources)[number];

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  manufacturer: text('manufacturer'),
  family_name: text('family_name'),
  model_number: text('model_number'),
  source_type: text('source_type').$type<ProductSourceType>().notNull().default('manual'),
  status: text('status').$type<ProductStatus>().notNull().default('draft'),
  /**
   * Workspace memory flags — apply org-wide across all projects.
   * is_preferred: boosts this product in candidate suggestions.
   * is_do_not_use: excludes this product from all candidate suggestions.
   */
  is_preferred: boolean('is_preferred').default(false).notNull(),
  is_do_not_use: boolean('is_do_not_use').default(false).notNull(),
  workspace_note: text('workspace_note'),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const product_attributes = pgTable(
  'product_attributes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    attribute_name: text('attribute_name').notNull(),
    attribute_value: text('attribute_value'),
    value_source: text('value_source').$type<AttributeValueSource>().notNull().default('manual'),
    /**
     * Populated by Priority 8 extraction pipeline.
     * 0.0 = low confidence, 1.0 = high. Null for manual entries.
     */
    confidence_score: real('confidence_score'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productAttributeUnique: uniqueIndex('product_attributes_product_id_name_idx').on(
      table.product_id,
      table.attribute_name,
    ),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductAttribute = typeof product_attributes.$inferSelect;
