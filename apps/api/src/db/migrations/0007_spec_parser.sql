-- Migration: spec parser columns on matching_requirements
-- Adds informational_attrs for the spec parser feature.
-- NOTE: item_code was already added in 0005_configured_products.

ALTER TABLE "matching_requirements"
  ADD COLUMN IF NOT EXISTS "informational_attrs" jsonb;
