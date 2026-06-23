# Extractor Hardening Report

**Branch:** `feature/extractor-hardening`  
**Date:** 2026-06-23  
**Scope:** `apps/api/src/lib/ingestion/catalogue-llm.ts` and supporting files  
**spec-llm.ts verdict:** Not changed — no legend-decoding risk found (already has `source_reference` per attribute)

---

## Problem

The catalogue extraction prompt in `catalogue-llm.ts` contained a silent hallucination path in the CCT resolution rule:

```
2. The catalogue publishes an order-code legend or key (e.g. "3020 = 3000K, 20W") → decode the
   CCT from THIS SKU's model code using that legend. Trust the catalogue's own key exactly.
3. A combined type/CCT/wattage name (e.g. "WKL 3020" where "30" means 3000K per the legend) →
   decode as above.
```

Neither step 2 nor step 3 required the legend to be **physically present** in the document. The model could — and did — decode CCT from training knowledge of common order-code conventions (e.g. "30 = 3000K") even when the catalogue contained a real specification table with a different value. This produced `extracted` values stored with `value_state = 'extracted'` and no indication they were inferred rather than read.

**Confirmed bug:** ILTI WKL-3020 was previously stored with CCT = 3000K (decoded from model-code convention). The actual spec table on page 28 of the ILTI brochure lists CCT = 2700K. The hallucination was silent — no flag, no review status change.

---

## Changes

### 1. `apps/api/src/lib/ingestion/catalogue-llm.ts`

**Prompt — attribute schema** (lines 86–114): Changed the per-attribute schema from `{ value, confidence }` to:

```json
{
  "value":             "string",
  "source_locator":    "string|null",
  "resolution_method": "table_read|legend_decoded|inferred_flagged",
  "needs_review":      "boolean",
  "confidence":        "number"
}
```

Added grounding rules requiring every attribute to specify where it was read from.

**Prompt — CCT rule** (lines 116–130): Revised steps 2 and 3:
- Step 2 now requires the legend to be **printed in this document** and the relevant entry to be quotable
- Step 3 removed — replaced by: "If neither applies — DO NOT emit a cct value at all. Do not use training knowledge of naming conventions."

**`coerceProduct()`** (lines 148–175): Updated to parse `source_locator`, `resolution_method`, `needs_review`. Falls back to `resolution_method = 'table_read'` if the field is absent (backwards-compatible for partial responses).

### 2. `apps/api/src/lib/ingestion/types.ts`

- `DetectedProduct.attributes` values now include `source_locator: string | null`, `resolution_method: 'table_read' | 'legend_decoded' | 'inferred_flagged'`, `needs_review: boolean`
- `IngestionProductResult` gains `attributes_needing_review: number`

### 3. `apps/api/src/db/schema/registry.ts`

Added to `product_attribute_values`:
- `source_locator text` — pointer to exact document location
- `resolution_method text` — how the value was resolved

### 4. `apps/api/src/db/migrations/0013_extractor_grounding.sql`

```sql
ALTER TABLE product_attribute_values
  ADD COLUMN IF NOT EXISTS source_locator text,
  ADD COLUMN IF NOT EXISTS resolution_method text;
```

Applied to the database.

### 5. `apps/api/src/lib/ingestion/registry-writer.ts`

- Writes `source_locator` and `resolution_method` to both INSERT and UPDATE paths
- Tracks `attributesNeedingReview` count during the attribute loop
- After attribute loop: if any attribute has `needs_review: true`, upgrades the canonical product's `review_status` to `'needs_review'` (protected by `ne(..., 'confirmed')` in the WHERE clause)
- Returns `attributes_needing_review` in `IngestionProductResult`

### 6. `apps/api/src/routes/ingestion.ts`

Both GET endpoints (`/review` and `/review/:id`) now return `source_locator` and `resolution_method` per attribute.

### 7. `apps/api/src/db/catalogue-ingest.ts`

Review markdown updated to show `attributes_needing_review` per product, `inferred_flagged` count in summary, and the new columns in the SQL review query.

---

## Files NOT changed

- `apps/api/src/lib/spec-parser/spec-llm.ts` — already has `source_reference` per attribute; no legend-decoding step; no changes needed
- All matching / scoring / gates code — untouched
- All other registry read/write paths — untouched

---

## Regression Test — ILTI WKL Products

Re-ran ingestion against `ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf` with `--filter WKL-302`.

**Result: 6 products, 0 `attributes_needing_review` across all products.**

| Product | CCT value | cct_kelvin | resolution_method | source_locator | confidence |
|---------|-----------|-----------|-------------------|----------------|-----------|
| 1-WKL-3020-1-00 | 2700 | 2700 | `table_read` | page 28, specification table, row 1-WKL-3020-1-00, column CCT | 1.0 |
| 1-WKL-3021-1-00 | 3000 | 3000 | `table_read` | page 28, specification table, row 1-WKL-3021-1-00, column CCT | 1.0 |
| 1-WKL-3022-1-00 | 4000 | 4000 | `table_read` | page 28, specification table, row 1-WKL-3022-1-00, column CCT | 1.0 |

**Bug fixed:** WKL-3020 was previously stored as 3000K (hallucinated from order-code convention "30=3000K"). After hardening, the extractor reads from the spec table and correctly stores 2700K — the value actually printed on page 28.

All 6 products: `review_status = auto_merged`, `attributes_needing_review = 0`, 18 attributes each.

---

## TypeScript

`npx tsc --noEmit` passes with zero errors for `apps/api`.

---

## What `inferred_flagged` looks like in practice

When the model encounters an attribute it cannot locate explicitly in the document but has a plausible value, it now emits:

```json
{
  "value": "some_value",
  "source_locator": null,
  "resolution_method": "inferred_flagged",
  "needs_review": true,
  "confidence": 0.4
}
```

This causes `registry-writer.ts` to:
1. Write the value to the DB with `resolution_method = 'inferred_flagged'`
2. Increment `attributes_needing_review`
3. Set `canonical_products.review_status = 'needs_review'` for the product

The ingestion review endpoint then surfaces `resolution_method` alongside each attribute value so a reviewer can distinguish clean reads from flagged inferences.
