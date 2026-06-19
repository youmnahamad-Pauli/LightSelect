import { pgTable, uuid, text, real, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { categories } from './categories';
import { products } from './products';
import { project_spec_documents } from './spec';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const boqItemStatuses = ['draft', 'reviewed', 'locked'] as const;
export type BoqItemStatus = (typeof boqItemStatuses)[number];

export const boqPricingSources = ['none', 'price_list', 'manual'] as const;
export type BoqPricingSource = (typeof boqPricingSources)[number];

export const boqSourceTypes = [
  'spec_document', 'drawing', 'dialux', 'pdf', 'manual',
] as const;
export type BoqSourceType = (typeof boqSourceTypes)[number];

// ─── Tables ────────────────────────────────────────────────────────────────

/**
 * Price list metadata. One project can have multiple price lists.
 */
export const price_lists = pgTable('price_lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  vendor_name: text('vendor_name'),
  currency: text('currency').notNull().default('USD'),
  uploaded_by: uuid('uploaded_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Individual line items within a price list.
 * model_code is matched against products.model_number for auto-pricing.
 */
export const price_list_items = pgTable('price_list_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  price_list_id: uuid('price_list_id')
    .notNull()
    .references(() => price_lists.id, { onDelete: 'cascade' }),
  model_code: text('model_code').notNull(),
  description: text('description'),
  unit_price: real('unit_price').notNull(),
  currency: text('currency').notNull().default('USD'),
  extra_data: jsonb('extra_data'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One BOQ item = one luminaire type in the Bill of Quantities.
 *
 * required_spec_profile: SpecProfileItem[] snapshot — key requirements for this row.
 * candidate_product_ids: CandidateEntry[] — ranked suggestions from candidate service.
 */
export const boq_items = pgTable('boq_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  quantity: real('quantity').notNull().default(1),
  unit: text('unit').notNull().default('pcs'),
  /** Optional link to the spec document this item's requirements come from. */
  spec_document_id: uuid('spec_document_id').references(() => project_spec_documents.id, {
    onDelete: 'set null',
  }),
  /**
   * Denormalized snapshot of key requirements for this BOQ row.
   * Shape: SpecProfileItem[] = { attribute_key, attribute_label, operator, target_value, target_unit, priority }[]
   */
  required_spec_profile: jsonb('required_spec_profile'),
  /** Currently selected product for this BOQ row. */
  product_id: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  /**
   * Ranked candidate suggestions.
   * Shape: CandidateEntry[] = { product_id, product_label, manufacturer, model_number, compliance_score,
   *                              compliant_count, deviated_count, missing_count, review_needed_count, total_count }[]
   */
  candidate_product_ids: jsonb('candidate_product_ids'),
  /** Fraction: compliant_count / total_mandatory_requirements (0.0–1.0). Null until candidates run. */
  compliance_score: real('compliance_score'),
  /** Pricing */
  pricing_source: text('pricing_source').$type<BoqPricingSource>().notNull().default('none'),
  price_list_id: uuid('price_list_id').references(() => price_lists.id, { onDelete: 'set null' }),
  unit_price: real('unit_price'),
  total_price: real('total_price'),
  currency: text('currency').notNull().default('USD'),
  /** Status */
  status: text('status').$type<BoqItemStatus>().notNull().default('draft'),
  sort_order: integer('sort_order').notNull().default(0),
  notes: text('notes'),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Traceability: where did this BOQ item come from?
 */
export const boq_item_sources = pgTable('boq_item_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  boq_item_id: uuid('boq_item_id')
    .notNull()
    .references(() => boq_items.id, { onDelete: 'cascade' }),
  source_type: text('source_type').$type<BoqSourceType>().notNull(),
  project_file_id: uuid('project_file_id'),
  file_id: uuid('file_id'),
  source_reference: text('source_reference'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ───────────────────────────────────────────────────────

export type BoqItem = typeof boq_items.$inferSelect;
export type NewBoqItem = typeof boq_items.$inferInsert;
export type PriceList = typeof price_lists.$inferSelect;
export type PriceListItem = typeof price_list_items.$inferSelect;

/** Shape stored in required_spec_profile jsonb. */
export interface SpecProfileItem {
  attribute_key: string;
  attribute_label: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  priority: 'mandatory' | 'preferred' | 'optional';
}

/** Shape stored in candidate_product_ids jsonb. New fields are optional for backward compat. */
export interface CandidateEntry {
  product_id: string;
  product_label: string;
  manufacturer: string | null;
  model_number: string | null;
  /** Legacy simple ratio: compliant_count / mandatory_total. */
  compliance_score: number;
  /** Weighted composite score (0.0–1.0). Priority 14+. */
  match_score?: number;
  match_band?: 'strong' | 'acceptable' | 'weak' | 'none';
  is_from_current_project?: boolean;
  is_preferred?: boolean;
  is_do_not_use?: boolean;
  matched_attributes?: { key: string; label: string; value: string }[];
  deviated_attributes?: { key: string; label: string; product_value: string; spec_requirement: string }[];
  missing_attributes?: { key: string; label: string; spec_requirement: string }[];
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
  total_count: number;
}
