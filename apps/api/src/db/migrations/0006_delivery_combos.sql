-- Migration: delivery_combos table
-- Adds the delivery_combos table needed for the diffuser/configured-product pass.
--
-- "delivery_combos" — named to avoid collision with the pre-existing
-- catalogue.configured_products table (project-scoped assembled deliverables).
--
-- Each delivery combo links a bare LED strip canonical_product to a
-- profile/diffuser option and stores the characterised diffuser transmission.
-- The matching engine uses the combo's canonical_product row (which carries
-- delivered lm/m) when evaluating lumen output.

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
