/**
 * Canonical Product Registry — Phase 1 of the decision-engine refactor.
 *
 * Three additive tables; existing product/product_attributes tables are
 * UNCHANGED and all existing read/write paths continue to work.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  canonical_products         — deduplicated product identity (org-wide)
 * │  canonical_product_sources  — which product rows contributed
 * │  product_attribute_values   — per-attribute values with provenance
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Dedup key rule
 * ──────────────
 * With model_number  → key = normalize(manufacturer) + '::' + normalize(model_number)
 *                      Same key in same org → single canonical_product (auto_merged)
 * Without model_number → one canonical_product per source product, status=needs_review.
 *                         Soft-match info stored in soft_match_hint for human review.
 *
 * Attribute merge policy
 * ──────────────────────
 * confirmed > extracted when choosing a winner.
 * On conflict: keep winning value, set conflict_notes; flag canonical for review.
 * confirmed values are NEVER overwritten by extracted ones.
 * Variants (different CCT / finish / optic reflected in model code) → separate records.
 */
import { pgTable, uuid, text, real, uniqueIndex, timestamp } from 'drizzle-orm/pg-core';
import type { ProvenanceState } from './matching';
import { organizations } from './organizations';
import { categories } from './categories';
import { products } from './products';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const canonicalReviewStatuses = ['auto_merged', 'needs_review', 'confirmed'] as const;
export type CanonicalReviewStatus = (typeof canonicalReviewStatuses)[number];

export const attributeValueStates = ['extracted', 'confirmed', 'not_applicable'] as const;
export type AttributeValueState = (typeof attributeValueStates)[number];

export const mergeTypes = ['exact_key', 'backfill_no_model', 'manual'] as const;
export type MergeType = (typeof mergeTypes)[number];

// ─── canonical_products ────────────────────────────────────────────────────

/**
 * One row per deduplicated product identity within an org.
 *
 * dedup_key: normalised(manufacturer) + '::' + normalised(model_number)
 *   → unique per org for products that have a model number.
 *   → null for products without a model number (one record per source product,
 *     all flagged needs_review).
 *
 * soft_match_hint: stores the soft-match fingerprint string for no-model-code
 *   products so a human can compare potential duplicates.
 */
export const canonical_products = pgTable(
  'canonical_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Normalised manufacturer name (lowercase, stripped punctuation). */
    canonical_manufacturer: text('canonical_manufacturer').notNull(),
    /** Normalised model / order code. Null if the source product had no model number. */
    canonical_model_code: text('canonical_model_code'),
    /**
     * Dedup key = normalize(manufacturer) + '::' + normalize(model_number).
     * Null when canonical_model_code is null (no auto-merge path for these).
     * Unique per org — enforced by partial unique index below.
     */
    dedup_key: text('dedup_key'),
    /** Human-readable display label (e.g. "Signify — BRP381 LED140/NW"). */
    display_name: text('display_name').notNull(),
    category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /**
     * auto_merged — created by exact dedup_key match; safe to use.
     * needs_review — soft-matched or no model number; needs human confirmation.
     * confirmed    — a human has reviewed and approved this record.
     */
    review_status: text('review_status').$type<CanonicalReviewStatus>().notNull().default('auto_merged'),
    /** Why this record was flagged or how it was created. */
    review_notes: text('review_notes'),
    /**
     * Fingerprint for no-model-number products: hash of
     * manufacturer + family_name + key attribute values (cct, watts, lumens, ip_rating).
     * Used by the review UI to surface potential duplicates for human judgement.
     */
    soft_match_hint: text('soft_match_hint'),
    /**
     * Phase 3 — luminaire classification used for type-scoping in the matching engine.
     * e.g. 'flexible_tape' | 'downlight' | 'linear' | 'profile' | 'wall_washer'
     * Null = unclassified (engine skips type-scoping check).
     */
    luminaire_type: text('luminaire_type'),
    /**
     * Phase 3 — certifications / approval scheme approvals this product holds.
     * e.g. ['DEWA', 'Civil Defence', 'ADQCC']
     * Populated by human review or import; used in Phase 3 soft-gate evaluation.
     */
    approvals_held: text('approvals_held').array(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique dedup key within org — only applies when dedup_key is NOT NULL
    // (partial index on dedup_key IS NOT NULL is expressed as a unique index;
    //  Postgres will enforce uniqueness only for non-null values).
    dedupKeyOrgIdx: uniqueIndex('canonical_products_org_dedup_key_idx')
      .on(table.org_id, table.dedup_key),
  }),
);

// ─── canonical_product_sources ─────────────────────────────────────────────

/**
 * Which existing product rows contributed to this canonical product.
 * Read-only after backfill; existing product rows are never modified.
 */
export const canonical_product_sources = pgTable('canonical_product_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  canonical_product_id: uuid('canonical_product_id')
    .notNull()
    .references(() => canonical_products.id, { onDelete: 'cascade' }),
  /** The contributing product row. SET NULL on deletion so the canonical record survives. */
  source_product_id: uuid('source_product_id').references(() => products.id, { onDelete: 'set null' }),
  /**
   * exact_key         — dedup key matched; auto-merged.
   * backfill_no_model — source had no model number; flagged for review.
   * manual            — added by a human through the admin UI.
   */
  merge_type: text('merge_type').$type<MergeType>().notNull().default('exact_key'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── product_attribute_values ─────────────────────────────────────────────

/**
 * Per-attribute values on a canonical product, with full provenance.
 *
 * One row per (canonical_product_id, attribute_key) — the winning value
 * after applying merge policy (confirmed > extracted).
 *
 * conflict_notes is populated when two source products disagreed on a value.
 * The canonical_product.review_status is set to needs_review in that case.
 *
 * attribute_key maps to STANDARD_ATTRIBUTES in the frontend and to the
 * attribute_key column in category_attribute_relevance (on feature/editable-categories).
 */
export const product_attribute_values = pgTable(
  'product_attribute_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    canonical_product_id: uuid('canonical_product_id')
      .notNull()
      .references(() => canonical_products.id, { onDelete: 'cascade' }),
    /** Must match a key in STANDARD_ATTRIBUTES or the v3 extended attribute list. */
    attribute_key: text('attribute_key').notNull(),
    /** The winning attribute value after merge. Null for not_applicable. */
    attribute_value: text('attribute_value'),
    /**
     * extracted     — came from PDF extraction; not manually verified.
     * confirmed     — manually entered or explicitly confirmed by a user.
     * not_applicable — attribute explicitly marked N/A for this product.
     */
    value_state: text('value_state').$type<AttributeValueState>().notNull().default('extracted'),
    /**
     * Phase 3 extended provenance (superset of value_state).
     * When set, the matching engine uses this; otherwise falls back from value_state.
     * test_report_backed | manufacturer_confirmed → confidence 1.0
     * human_confirmed → 0.9 | extracted → 0.6 | missing → 0.0
     */
    provenance_state: text('provenance_state').$type<ProvenanceState>(),
    /** The product row this value was drawn from. Null if manually set or source deleted. */
    source_product_id: uuid('source_product_id').references(() => products.id, { onDelete: 'set null' }),
    /** 0.0–1.0; null for manually entered values. */
    confidence_score: real('confidence_score'),
    /**
     * Populated when two merged source products provided conflicting values.
     * Format: "Conflict: [losing value] from product [id] (state: [state]).
     *          Kept: [winning value] (higher priority state)."
     */
    conflict_notes: text('conflict_notes'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    attrKeyIdx: uniqueIndex('product_attribute_values_cp_key_idx')
      .on(table.canonical_product_id, table.attribute_key),
  }),
);

// ─── TypeScript types ───────────────────────────────────────────────────────

export type CanonicalProduct = typeof canonical_products.$inferSelect;
export type NewCanonicalProduct = typeof canonical_products.$inferInsert;
export type CanonicalProductSource = typeof canonical_product_sources.$inferSelect;
export type ProductAttributeValue = typeof product_attribute_values.$inferSelect;
