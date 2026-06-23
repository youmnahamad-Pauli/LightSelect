# Ingestion Review — ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf

**Ingested at:** 2026-06-23 12:05
**Source file:** `C:\Users\julia\lightselect\ingestion-input\ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf`
**Org ID:** `e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e`
**Products detected:** 6
**Products written:** 6
**Total attribute values stored:** 108
**LLM:** claude-sonnet-4-6 · in=68709 out=9441 (114978ms)

> All values have `value_state = 'extracted'` and require human review.
> To confirm a value, update the row in `product_attribute_values` and set `value_state = 'confirmed'`.
> To confirm a canonical product, set `review_status = 'confirmed'` in `canonical_products`.

---

## ILTI LUCE — 1-WKL-3020-1-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `cee2f8eb-99cb-427d-a8a1-5af28390aae5` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3020-1-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


## ILTI LUCE — 1-WKL-3021-1-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `6833f3d0-38c3-4fc0-9c8f-227dbdf4d944` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3021-1-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


## ILTI LUCE — 1-WKL-3022-1-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `7628d62b-8795-4817-828a-3d0288b87bd4` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3022-1-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


## ILTI LUCE — 1-WKL-3025-0-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `473f0f41-682f-412e-a050-96dca43726d8` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3025-0-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


## ILTI LUCE — 1-WKL-3026-0-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `28bce2f1-4a7b-499d-9f1c-8a56a7a4a414` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3026-0-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


## ILTI LUCE — 1-WKL-3027-0-00 ✓ auto_merged _(merged into existing)_

| Field | Value |
|-------|-------|
| Canonical ID | `a26f0c91-8a93-452d-ac3a-e59afe38908c` |
| Manufacturer | ILTI LUCE |
| Model code | 1-WKL-3027-0-00 |
| Source pages | p.28 |
| Attributes written | 18 |
| Attributes skipped | 0 |
| Attributes needing review | 0 |


---

## Accuracy & Uncertainty Summary

- **6** product(s) extracted
- **0** product(s) have no model code → flagged `needs_review`
- **6** product(s) merged into an existing canonical record
- **0** attribute values flagged `inferred_flagged` (needs_review)
- Average **18** attribute values per product

All values are **extracted** (not confirmed). Confidence scores are stored in
`product_attribute_values.confidence_score`. Low-confidence values (< 0.7) should
be prioritised for human review.

### How to review

```sql
-- See all extracted products from this ingestion run
SELECT cp.display_name, cp.review_status, cp.review_notes,
       pav.attribute_key, pav.attribute_value, pav.confidence_score,
       pav.resolution_method, pav.source_locator, pav.conflict_notes
FROM canonical_products cp
JOIN product_attribute_values pav ON pav.canonical_product_id = cp.id
WHERE cp.review_notes LIKE 'Ingested from: ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf%'
ORDER BY cp.display_name, pav.attribute_key;
```

### Needs human decision

- 6 product(s) were merged into existing canonical records. Verify the merge is correct.
- `merge_type = 'manual'` is used for catalogue-ingested sources (no `products` table row exists). A new merge_type (e.g. `catalogue_ingestion`) could be added in a future schema migration to distinguish this provenance more precisely.
- Variant handling: if a product has multiple CCT or wattage options with the same model code, only the "primary" value was extracted. The notes attribute contains variant information. A future enhancement could create separate canonical records per variant.
- `org_id` is required by the schema. The catalogue ingestion must always be associated with a specific org. Consider whether a system/library org concept is needed for manufacturer-level catalogues shared across orgs.
