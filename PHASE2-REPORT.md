# Phase 2 Report — Catalogue Ingestion + Structured Extraction

**Branch:** `feature/catalog-ingestion`  
**Date:** 2026-06-21  
**Status:** Complete — pipeline works end-to-end, ILTI strips ingested, PR open  

---

## 1. What Was Built

### Ingestion module: `apps/api/src/lib/ingestion/`

| File | Role |
|------|------|
| `types.ts` | Shared TypeScript types (`DetectedProduct`, `IngestionOptions`, `CatalogueIngestionResult`) |
| `normalise.ts` | Dedup key helpers — same normalisation logic as Phase 1 backfill |
| `catalogue-llm.ts` | Anthropic API call: sends the full PDF once, returns all products + attributes in a single structured JSON response |
| `registry-writer.ts` | Upserts into `canonical_products`, `canonical_product_sources`, `product_attribute_values` with provenance |
| `pipeline.ts` | Orchestrates detect → write; manages DB connection lifecycle |
| `index.ts` | Barrel export |

### CLI script: `apps/api/src/db/catalogue-ingest.ts`

```bash
pnpm --filter @lightselect/api catalogue:ingest \
  --pdf /path/to/catalogue.pdf \
  --org-id <uuid> \
  [--filter N25,N19,N24] \
  [--model claude-sonnet-4-6]
```

Writes result JSON to stdout and generates `INGESTION-REVIEW.md` in the working directory.

### Review endpoint: `GET /ingestion/review?org_id=<uuid>`

Returns all ingested canonical products with their extracted attribute values and confidence scores.
Also: `GET /ingestion/review/:canonicalProductId` for a single product.

---

## 2. Pipeline Design

**Single-pass LLM strategy**: The full catalogue PDF is sent once to Claude (as a base64 document block — same API path as the per-datasheet extraction in Phase 1). Claude identifies all distinct products and extracts all standard attributes in a single structured JSON response.

**Prompt**: Brand-agnostic. No ILTI-specific layout assumptions. The prompt specifies valid attribute names from the canonical schema and asks for `{ products: [{ manufacturer, model_code, product_name, pages, attributes }] }`.

**Dedup**: Applies the same Phase 1 logic:
- Has model_code → `dedup_key = normalize(manufacturer) + '::' + normalize(model_code)` → unique per org
- No model_code → one record per product, `review_status = 'needs_review'`

**Provenance** (without schema changes):
- `canonical_products.review_notes` → `"Ingested from: filename.pdf:p{first}-{last}"`
- `product_attribute_values.conflict_notes` → `"Source: filename.pdf:p{page}"`

**Idempotency**: Safe to re-run. Exact-key products update in-place (confirmed values are never overwritten).

---

## 3. First Test Run — ILTI LUCE 2024 (LED Strips)

**PDF:** `ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf` (1 MB, 32 pages)  
**Tokens:** 67,736 in / 6,868 out  
**Time:** ~80 s

### Results

| Category | Count | Attribute values |
|----------|-------|-----------------|
| LED strips (WKL codes, N-series) | 8 | ~144 |
| Aluminum profiles (BP codes, P-series) | 7 | ~56 |
| **Total** | **15** | **200** |

### N-series LED strips extracted

| Family | Order Code | W/m | lm/m | LED/m | Cut | CCT | CRI |
|--------|------------|-----|------|-------|-----|-----|-----|
| N25 | 1-WKL-7100-0-00 | 9.6 | 1200–1550 | 128 | 6.25 cm | 2200–4000K | >80 |
| N19 | 1-WKL-6022-0-00 | 14.4 | 1850–2000 | 160 | 5 cm | 2700–4000K | 90 |
| N24 | 1-WKL-3020-1-00 | 14.5 | 2064–2368 | 160 | 0.5 cm | 2200–5000K | 90 |
| N24/HF | 1-WKL-3025-0-00 | 23 | 3400–4300 | 160 | 0.5 cm | 2200–5000K | >80 |
| N17 | 1-WKL-4500-0-00 | 15 | 1590–1905 | 240 | 3.3 cm | 2700–4000K | >95 |
| N21 | 1-WKL-4510-0-00 | 14.4 | 570 | 120 | 5 cm | RGB | — |
| N22 | 1-WKL-4511-0-00 | 15 | 700 | 192 | 6.25 cm | 2400K+RGB | 90 |

> The 8th WKL product is a second N24 CRI90 variant. The N-series names appear in `family_name`; the full ILTI order codes are the canonical `model_code`.

---

## 4. Accuracy & Uncertainty

### Confidence distribution
- **100% confidence:** 191/200 values (95.5%)
- **90% confidence:** 9/200 values — all `dimensions` fields (parsed from visual tables with multiple length variants)
- **0% confidence:** 0 values

### What was not extracted
- `efficacy` — computable but not stated verbatim in the PDF → correctly omitted
- `max_run` — in `notes` as "max 5m run" rather than the `max_run` attribute key (the model chose the conservative route; prompt can be tuned)
- `mounting` — not applicable to LED strips → correctly omitted for WKL products

### Known imprecisions
- **CCT stored as range string** (e.g. `"2200K, 2700K, 3000K, 4000K"`) — not yet parsed into structured variants
- **Dimensions** include multiple reel lengths — stored as prose, not structured
- **Profile dimensions** at 90%: cross-section values extracted from spec tables

---

## 5. How to Review and Correct

### Via API
```
GET /ingestion/review?org_id=e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e&source=ILTI
```

Returns JSON with all 15 products, their attributes, confidence scores, and source page references.

### Via SQL
```sql
-- All ingested products
SELECT cp.display_name, cp.review_status, pav.attribute_key,
       pav.attribute_value, pav.confidence_score
FROM canonical_products cp
JOIN product_attribute_values pav ON pav.canonical_product_id = cp.id
WHERE cp.review_notes LIKE 'Ingested from: ILTI%'
ORDER BY cp.display_name, pav.attribute_key;

-- Confirm a value
UPDATE product_attribute_values
SET value_state = 'confirmed', updated_at = now()
WHERE canonical_product_id = '<uuid>' AND attribute_key = 'watts_per_metre';
```

### Full per-product detail
See `INGESTION-REVIEW.md` at the repo root.

---

## 6. Re-running the Pipeline

```bash
# From the repo root
pnpm --filter @lightselect/api catalogue:ingest \
  --pdf ingestion-input/ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf \
  --org-id e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e
```

The pipeline is idempotent — re-running updates extracted values and skips confirmed ones.  
To filter only LED strips: `--filter 1-WKL` (matches all WKL order codes).  
To filter by family name, use the review API with `family_name` filtering.

---

## 7. Verification

- `tsc --noEmit`: clean
- All 35 existing tests pass
- `drizzle-kit generate`: no pending schema diff (ingestion is additive — no new tables)
- Existing tables, exports, compliance, and matching logic: untouched

---

## 8. Needs Human Decision

1. **CCT multi-value format**: Currently stored as comma-separated string. Structured variants (one record per CCT) would require either a schema extension or a post-processing step. Flag for Phase 3.

2. **`max_run` extraction**: Currently lands in `notes`. Update the extraction prompt to explicitly request `max_run` as a separate attribute if this is needed for matching.

3. **`merge_type = 'manual'`** is used for catalogue-sourced `canonical_product_sources` rows (no `products` table row exists). A future schema migration could add `catalogue_ingestion` as a distinct value. Currently just documented in `review_notes`.

4. **Org binding**: Catalogue ingestion is always associated with a specific org. If manufacturer catalogues are shared across orgs, a "system library" org concept is needed.

5. **Profile products in scope?**: The 7 aluminum profile products (BP codes) were ingested alongside the LED strips. Decide whether profiles should be included in the registry or filtered out.

6. **Filter by family_name**: The `--filter` CLI flag currently matches against `model_code`. For ILTI N-series, filtering by `family_name` (N25, N19, etc.) would be more intuitive. A future enhancement could accept `--filter-field family_name`.
