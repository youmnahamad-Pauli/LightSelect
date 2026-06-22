/**
 * Delivery combos — strip + profile/diffuser combinations used in matching.
 *
 * A delivery combo represents a bare component_build strip (e.g. an ILTI WKL
 * tape) mounted inside a specific profile-diffuser option. It is the unit that
 * competes in matching: it carries a DELIVERED lumen output derived from
 * the strip's source lumens × the diffuser's transmission fraction.
 *
 * Named "delivery_combos" to avoid collision with the existing
 * catalogue.configured_products table (project-scoped assembled deliverables).
 *
 * Relationship to canonical_products:
 *   Each delivery combo has a matching canonical_products row
 *   (canonical_product_id) that holds the combined attribute values (including
 *   delivered lm/m). This row is what match_decisions references. The
 *   delivery_combos table stores the component breakdown so the export spine
 *   can populate per-section identity (Section 1 = profile, Section 2 = strip).
 *
 * Transmission provenance:
 *   combo_tested  — manufacturer has published a combined delivered output for
 *                   this exact strip+diffuser pair. Use manufacturer_delivered_lm_per_m
 *                   directly, overriding the multiplication.
 *   published     — diffuser manufacturer publishes a transmission fraction for
 *                   this diffuser (not combo-specific). Moderate confidence.
 *   estimated     — transmission estimated from material category (e.g. "opal ~80%").
 *                   Lowest confidence. Clearly labelled in exports.
 */
import { pgTable, uuid, text, real, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { canonical_products } from './registry';

export const transmissionProvenances = ['combo_tested', 'published', 'estimated'] as const;
export type TransmissionProvenance = (typeof transmissionProvenances)[number];

export const delivery_combos = pgTable('delivery_combos', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  /**
   * The canonical_products row that represents this combination as a
   * matching candidate. Its product_attribute_values hold the delivered lm/m
   * and all inherited gate attributes (IP, voltage, colour_family, etc.).
   */
  canonical_product_id: uuid('canonical_product_id')
    .references(() => canonical_products.id, { onDelete: 'cascade' }),

  /** The bare LED strip/tape component. */
  strip_canonical_product_id: uuid('strip_canonical_product_id')
    .notNull()
    .references(() => canonical_products.id),

  display_name: text('display_name').notNull(),
  luminaire_type: text('luminaire_type'),

  // ── Profile / diffuser component ─────────────────────────────────────────
  /** Human-readable name for the profile+diffuser option (e.g. "EXAMPLE Opal Profile"). */
  profile_name: text('profile_name'),
  /** Manufacturer of the profile/diffuser (populates AECOM Section 1 Manufacturer). */
  profile_manufacturer: text('profile_manufacturer'),
  /** Profile model/order code (populates AECOM Section 1 Product Reference). */
  profile_model_code: text('profile_model_code'),
  /**
   * Diffuser category ('opal' | 'micro_prism' | 'clear' | 'sandblasted' | etc.).
   * Informational only; does not affect computation.
   */
  diffuser_type: text('diffuser_type'),

  // ── Transmission characterisation ────────────────────────────────────────
  /**
   * Fraction of light transmitted through the diffuser (0.0–1.0).
   * Required — is the core datum that makes delivery computation possible.
   */
  diffuser_transmission: real('diffuser_transmission').notNull(),

  /**
   * How the transmission value was obtained.
   * Drives the provenance_state of the delivered lm/m attribute and is
   * shown in export comments so reviewers can assess reliability.
   */
  transmission_provenance: text('transmission_provenance')
    .$type<TransmissionProvenance>()
    .notNull(),

  /**
   * Only relevant when transmission_provenance = 'combo_tested'.
   * If set, this value overrides source × transmission in the
   * delivered lm/m calculation — the manufacturer has measured
   * the actual combined output.
   */
  manufacturer_delivered_lm_per_m: real('manufacturer_delivered_lm_per_m'),

  /** Free-text notes (e.g. "PLACEHOLDER — real value from user characterisation"). */
  notes: text('notes'),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DeliveryCombo = typeof delivery_combos.$inferSelect;
export type NewDeliveryCombo = typeof delivery_combos.$inferInsert;
