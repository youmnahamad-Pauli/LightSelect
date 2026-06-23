-- Extractor hardening: add source_locator and resolution_method to product_attribute_values.
-- source_locator: pointer to the exact location in the source document where the value was read.
-- resolution_method: how the value was resolved (table_read | legend_decoded | inferred_flagged).
-- Both columns are nullable so existing rows without these fields are unaffected.

ALTER TABLE product_attribute_values
  ADD COLUMN IF NOT EXISTS source_locator text,
  ADD COLUMN IF NOT EXISTS resolution_method text;
