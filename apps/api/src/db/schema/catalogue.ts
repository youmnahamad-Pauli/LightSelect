/**
 * Catalogue record types (v3 product-database model).
 *
 * These are LIBRARY / COMPONENT records, NOT luminaire-type categories:
 *
 *   catalogue_profiles       — extrusion housing for flexible LED tapes;
 *                              optional accessory for flex neon.
 *   catalogue_accessories    — end caps, clips, connectors, drivers, etc.
 *   configured_products      — one assembled deliverable:
 *                              core product (tape/neon from products table)
 *                              + optional profile
 *                              + accessory BOM lines.
 *   category_attribute_relevance — per-type attribute hints (which keys
 *                              matter for a given luminaire category).
 *                              Read by UI only; never by matching/compliance.
 */
import {
  pgTable, uuid, text, integer, real, boolean, timestamp,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';
import { projects } from './projects';
import { products } from './products';
import { categories } from './categories';

// ─── Shared status ─────────────────────────────────────────────────────────

export const catalogueStatuses = ['active', 'discontinued', 'draft'] as const;
export type CatalogueStatus = (typeof catalogueStatuses)[number];

// ─── Profiles ──────────────────────────────────────────────────────────────

/**
 * Extrusion profile / channel housing.
 * Central for Flexible LED Tapes (sets mounting, trim, dot-free outcome).
 * Optional for Flex Neon (may act as a mounting channel only).
 */
export const catalogue_profiles = pgTable('catalogue_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** Manufacturer code (e.g. "P04", "P24"). */
  code: text('code').notNull(),
  name: text('name').notNull(),
  /** Width × height in mm (e.g. "19×11"). Stored separately for queries. */
  section_width_mm: real('section_width_mm'),
  section_height_mm: real('section_height_mm'),
  /** Human-readable summary of the section e.g. "1.9×1.1 surface". */
  section_label: text('section_label'),
  /** Array of mounting roles: surface, recessed, suspended, wall, corner, etc. */
  mounting_capabilities: text('mounting_capabilities').array(),
  /** Finish/colour (aluminium, grey, black, white, custom). */
  finish: text('finish'),
  /** Diffuser/screen type (opal, clear, frosted, micro-prismatic, none). */
  diffuser_type: text('diffuser_type'),
  /** Whether this profile produces a dot-free result with compatible strips. */
  is_dot_free: boolean('is_dot_free').default(false).notNull(),
  /** Comma-separated strip codes or families this profile is compatible with. */
  compatible_strip_codes: text('compatible_strip_codes'),
  notes: text('notes'),
  status: text('status').$type<CatalogueStatus>().notNull().default('active'),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Accessories ───────────────────────────────────────────────────────────

export const accessoryTypes = [
  'end_cap', 'clip', 'bracket', 'joint_connector',
  'suspension_kit', 'feed_cable', 'driver', 'other',
] as const;
export type AccessoryType = (typeof accessoryTypes)[number];

/**
 * Accessory / BOM component.
 * Feeds configured_product BOM lines and proposal/BOQ generation.
 * Not a luminaire; not in the matching taxonomy.
 */
export const catalogue_accessories = pgTable('catalogue_accessories', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  accessory_type: text('accessory_type').$type<AccessoryType>().notNull().default('other'),
  /** Profile or strip codes this accessory is compatible with. */
  compatible_with: text('compatible_with').array(),
  notes: text('notes'),
  status: text('status').$type<CatalogueStatus>().notNull().default('active'),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Configured products ───────────────────────────────────────────────────

/**
 * One assembled deliverable:
 *   core_product_id → a products row (the tape or neon strip)
 *   profile_id      → optional catalogue_profiles row
 *   + zero or more accessory BOM lines
 *
 * This is the record that gets submitted, matched, approved and revised.
 * Matching and compliance read core product attributes; the profile
 * contributes mounting/trim/diffuser metadata to the output record only.
 */
export const configured_products = pgTable('configured_products', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** The photometric core: a flexible LED tape or flex neon product. */
  core_product_id: uuid('core_product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  /** Optional housing profile. Null = bare tape / self-housed neon. */
  profile_id: uuid('profile_id').references(() => catalogue_profiles.id, { onDelete: 'set null' }),
  /** Free-form description / project-specific label. */
  name: text('name'),
  notes: text('notes'),
  status: text('status').$type<'draft' | 'active' | 'superseded'>().notNull().default('draft'),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * BOM lines for a configured product.
 */
export const configured_product_accessories = pgTable('configured_product_accessories', {
  id: uuid('id').defaultRandom().primaryKey(),
  configured_product_id: uuid('configured_product_id')
    .notNull()
    .references(() => configured_products.id, { onDelete: 'cascade' }),
  accessory_id: uuid('accessory_id')
    .notNull()
    .references(() => catalogue_accessories.id, { onDelete: 'restrict' }),
  qty: integer('qty').notNull().default(1),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Category attribute relevance ──────────────────────────────────────────

export const attributeRelevanceLevels = ['primary', 'secondary', 'not_applicable'] as const;
export type AttributeRelevanceLevel = (typeof attributeRelevanceLevels)[number];

/**
 * Per-type attribute relevance hints.
 * Tells the UI which attributes matter most for a given luminaire category.
 * Read by the frontend only — never by matching or compliance engines.
 *
 * Example: watts_per_metre is primary for Flexible LED Tapes,
 *          not_applicable for a Downlight.
 */
export const category_attribute_relevance = pgTable('category_attribute_relevance', {
  id: uuid('id').defaultRandom().primaryKey(),
  category_id: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  /** Must match a key in STANDARD_ATTRIBUTES or the v3 extended attribute list. */
  attribute_key: text('attribute_key').notNull(),
  relevance: text('relevance').$type<AttributeRelevanceLevel>().notNull().default('primary'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── TypeScript types ───────────────────────────────────────────────────────

export type CatalogueProfile = typeof catalogue_profiles.$inferSelect;
export type NewCatalogueProfile = typeof catalogue_profiles.$inferInsert;
export type CatalogueAccessory = typeof catalogue_accessories.$inferSelect;
export type NewCatalogueAccessory = typeof catalogue_accessories.$inferInsert;
export type ConfiguredProduct = typeof configured_products.$inferSelect;
export type NewConfiguredProduct = typeof configured_products.$inferInsert;
export type ConfiguredProductAccessory = typeof configured_product_accessories.$inferSelect;
export type CategoryAttributeRelevance = typeof category_attribute_relevance.$inferSelect;
