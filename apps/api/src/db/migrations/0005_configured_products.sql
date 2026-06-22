-- Migration: delivery_combos table + matching_requirements.item_code
-- Adds the core tables/columns needed for the diffuser/configured-product pass.
--
-- NOTE: "delivery_combos" — named to avoid collision with the pre-existing
-- catalogue.configured_products table (project-scoped assembled deliverables).
--
-- delivery_combos: tracks strip + profile/diffuser combos for the matching engine.
-- Each row has a canonical_product_id pointing to a canonical_products row that
-- holds the delivered lm/m and all inherited gate attributes.
--
-- transmission_provenance: 'combo_tested' | 'published' | 'estimated'
-- manufacturer_delivered_lm_per_m: overrides source × transmission when set
--   (only meaningful when transmission_provenance = 'combo_tested').

CREATE TABLE IF NOT EXISTS "delivery_combos" (
  "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id"                        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "canonical_product_id"          uuid REFERENCES "canonical_products"("id") ON DELETE CASCADE,
  "strip_canonical_product_id"    uuid NOT NULL REFERENCES "canonical_products"("id"),
  "display_name"                  text NOT NULL,
  "luminaire_type"                text,
  "profile_name"                  text,
  "profile_manufacturer"          text,
  "profile_model_code"            text,
  "diffuser_type"                 text,
  "diffuser_transmission"         real NOT NULL,
  "transmission_provenance"       text NOT NULL,
  "manufacturer_delivered_lm_per_m" real,
  "notes"                         text,
  "created_at"                    timestamptz DEFAULT now() NOT NULL,
  "updated_at"                    timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── matching_requirements.item_code ───────────────────────────────────────────
-- Nullable sheet/item code used as the XLSX sheet name in consultant exports.

ALTER TABLE "matching_requirements" ADD COLUMN IF NOT EXISTS "item_code" text;
--> statement-breakpoint
