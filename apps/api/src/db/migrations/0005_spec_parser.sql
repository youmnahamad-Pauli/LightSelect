-- Migration: add item_code and informational_attrs to matching_requirements
-- Enables the spec parser to store line item codes and informational specified fields.

ALTER TABLE "matching_requirements"
  ADD COLUMN IF NOT EXISTS "item_code" text,
  ADD COLUMN IF NOT EXISTS "informational_attrs" jsonb;
