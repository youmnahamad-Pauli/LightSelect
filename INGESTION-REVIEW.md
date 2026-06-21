# ILTI LUCE Catalogue Ingestion Review

**Source:** `ingestion-input/ILTI_LUCE_2024_Profiles-and-LED-strips-brochure.pdf`  
**Ingested:** 2026-06-21  
**Org:** LightSelect (`e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e`)  
**Model:** `claude-sonnet-4-6` · in=67,736 tokens · out=6,868 tokens · ~80 s  
**Products detected:** 15 (8 LED strips + 7 aluminum profiles)  
**Attribute values stored:** 200  

> All values have `value_state = 'extracted'` and require human review.  
> To confirm a value: `UPDATE product_attribute_values SET value_state = 'confirmed' WHERE id = '...'`  
> To confirm a product: `UPDATE canonical_products SET review_status = 'confirmed' WHERE id = '...'`

---

## Review via API

```
GET /ingestion/review?org_id=e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e&source=ILTI
```

Returns all 15 products with their attributes and confidence scores.

---

## LED Strip Products (N-series family, WKL order codes)

The ILTI N-series identifiers appear as `family_name`; the actual order codes (1-WKL-xxx)
are the `model_code` used for dedup. All strips: IP20, 24V DC, dimmable, 3M VHB tape included,
>50,000 h lifetime, 3-year warranty.

---

### N25 — `1-WKL-7100-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N25 | 100% |
| description | LED strip 640 LED 48W IP20 | 100% |
| cct | 2200K, 2700K, 3000K, 4000K | 100% |
| cri | >80 | 100% |
| watts_per_metre | 9.6 W/m | 100% |
| lumens_per_metre | 1200–1550 lm/m | 100% |
| led_per_metre | 128 LED/m | 100% |
| cut_interval | 6.25 cm | 100% |
| ip_rating | IP20 | 100% |
| voltage | 24V DC | 100% |
| beam_angle | 120° | 100% |
| dimensions | 500 × 1 × 0.2 cm (reel) | 100% |
| notes | 2200K on demand; profiles: P23, P24, P04, P05, P22, P13; max 5 m run | 100% |

**Source pages:** 24–26

---

### N19 — `1-WKL-6022-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N19 | 100% |
| description | LED strip 960 LED 86W IP20 | 100% |
| cct | 2700K, 3000K, 4000K | 100% |
| cri | 90 | 100% |
| watts_per_metre | 14.4 W/m | 100% |
| lumens_per_metre | 1850–2000 lm/m | 100% |
| led_per_metre | 160 LED/m | 100% |
| cut_interval | 5 cm | 100% |
| ip_rating | IP20 | 100% |
| notes | Compatible profile: **P25 only**; max 5 m run | 100% |

**Source pages:** 25–27

---

### N24 — `1-WKL-3020-1-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N24 | 100% |
| description | LED strip 1600 LED 145W IP20, CRI90 | 100% |
| cct | 2200K, 2700K, 3000K, 3500K (on demand), 4000K, 5000K (on demand) | 100% |
| cri | 90 | 100% |
| watts_per_metre | 14.5 W/m | 100% |
| lumens_per_metre | 2064–2368 lm/m | 100% |
| led_per_metre | 160 LED/m | 100% |
| cut_interval | 0.5 cm | 100% |
| notes | R9 index >65 (CRI90); 3500K & 5000K on demand; max 5 m run | 100% |

**Source pages:** 24–28

---

### N24/HF (High Flux) — `1-WKL-3025-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N24HF | 100% |
| description | LED strip 1600 LED 230W IP20, high flux | 100% |
| cct | 2200K, 2700K, 3000K, 3500K (on demand), 4000K, 5000K (on demand) | 100% |
| cri | >80 | 100% |
| watts_per_metre | 23 W/m | 100% |
| lumens_per_metre | 3400–4300 lm/m | 100% |
| led_per_metre | 160 LED/m | 100% |
| cut_interval | 0.5 cm | 100% |
| notes | High flux variant; 3500K & 5000K on demand; max 5 m run | 100% |

**Source pages:** 24–28

---

### N17 — `1-WKL-4500-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N17 | 100% |
| description | LED strip 1440 LED 90W IP20, CRI>95 | 100% |
| cct | 2700K, 3000K, 4000K | 100% |
| cri | >95 | 100% |
| watts_per_metre | 15 W/m | 100% |
| lumens_per_metre | 1590–1905 lm/m | 100% |
| led_per_metre | 240 LED/m | 100% |
| cut_interval | 3.3 cm | 100% |
| notes | R9 index >83; max 5 m run | 100% |

**Source pages:** 25–29

---

### N21 (RGB) — `1-WKL-4510-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N21 | 100% |
| description | RGB LED strip IP20 | 100% |
| colour_mode | RGB | 100% |
| watts_per_metre | 14.4 W/m | 100% |
| lumens_per_metre | 570 lm/m | 100% |
| led_per_metre | 120 LED/m | 100% |
| cut_interval | 5 cm | 100% |
| notes | RGB colour; max 5 m run | 100% |

**Source pages:** 25–31  
⚠️ `cct` not applicable for RGB — correctly omitted.

---

### N22 (RGB+White) — `1-WKL-4511-0-00` ✓ auto_merged

| Attribute | Value | Conf |
|-----------|-------|------|
| family_name | N22 | 100% |
| description | RGB-white LED strip IP20 | 100% |
| cct | 2400K + RGB | 100% |
| colour_mode | RGB + White (2400K) | 100% |
| cri | 90 | 100% |
| watts_per_metre | 15 W/m | 100% |
| lumens_per_metre | 700 lm/m | 100% |
| led_per_metre | 192 LED/m | 100% |
| cut_interval | 6.25 cm | 100% |
| notes | RGB + white 2400K; max 5 m run | 100% |

**Source pages:** 25–32

---

## Aluminum Profile Products (P-series)

All profiles: ILTI LUCE manufacturer, aluminum material, opal screen included, grey finish (black on demand).

| Model Code | Family | Mounting | Cross-section | Source pages |
|------------|--------|----------|---------------|------|
| BP23AAOP1M | P23 | Ceiling/wall | 1.6 × 1.6 cm | 8–9 |
| BP24AAOP1M | P24 | Ceiling/wall | 1.9 × 1.1 cm | 10–11 |
| BP04AAOP1M | P04 | Ceiling/wall/recessed/suspended | 2.1 × 1.2 cm | 12–15 |
| BP25AAOP1M | P25 | Ceiling/wall (recessed in wood) | 1.0 × 1.5 cm | 16–17 |
| BP22AAOP1M | P22 | Ceiling/wall (recessed in wood) | 1.7 × 0.7 cm | 18–19 |
| BP13AAOP1M | P13 | Recessed | 2.5 × 0.8 cm | 20–21 |
| BP05AAOP1M | P05 | Recessed | 3.3 × 2.0 cm (outer) | 22–23 |

---

## Accuracy & Uncertainty Summary

### What worked well
- All 7 N-series LED strip products extracted with correct per-metre data
- Per-metre attributes (`watts_per_metre`, `lumens_per_metre`, `led_per_metre`, `cut_interval`) populated for every strip
- CCT ranges and CRI values correctly captured
- Profile compatibility notes extracted
- Dimensions at 90% confidence (parsed from visual tables — expected)
- RGB products correctly omitted `cct` (not applicable)

### Confidence distribution
- **100%** confidence: 191/200 attribute values (95.5%)
- **90%** confidence: 9/200 attribute values — all are `dimensions`, parsed from tables with multiple length options

### Known limitations / items for human review

1. **CCT is a range, not a single value** (e.g. `"2200K, 2700K, 3000K, 4000K"`). The pipeline stores this as a string. If exact-match comparison is needed, these need to be parsed into structured variants.

2. **N-series family name vs. order code**: The model codes stored are ILTI's full order codes (e.g. `1-WKL-7100-0-00`). The N-series designators (N25, N19, etc.) are captured as `family_name`. The `--filter` flag uses model_code substring — for N-series filtering, filter by family_name in the review API instead.

3. **Profile dimensions at 90%**: Dimensions for profiles include "available in 1m, 2m, 3m lengths" which the model captured as an approximate. Verify against the datasheet table.

4. **Max run length**: All strips list `max 5m run` in `notes`. This could be a dedicated attribute (`max_run`) — the model chose to include it in notes rather than `max_run` for most strips. Check if `max_run` should be extracted separately.

5. **No `efficacy` extracted**: Efficacy (lm/W) could be computed from `watts_per_metre` + `lumens_per_metre` but was not stated in the PDF directly. Correctly omitted.

---

## SQL to confirm a value

```sql
-- Confirm a specific attribute value after human review
UPDATE product_attribute_values
SET value_state = 'confirmed', updated_at = now()
WHERE canonical_product_id = '<uuid>'
  AND attribute_key = 'watts_per_metre';

-- Confirm a canonical product
UPDATE canonical_products
SET review_status = 'confirmed', updated_at = now()
WHERE id = '<uuid>';

-- See low-confidence attributes
SELECT cp.display_name, pav.attribute_key, pav.attribute_value, pav.confidence_score
FROM canonical_products cp
JOIN product_attribute_values pav ON pav.canonical_product_id = cp.id
WHERE pav.confidence_score < 0.95
  AND cp.review_notes LIKE 'Ingested from: ILTI%'
ORDER BY pav.confidence_score;
```

---

## Needs Human Decision

1. **CCT multi-value**: Store CCT as comma-separated string (current) or create one record per CCT option? Recommend structured variants in a future schema addition.

2. **`merge_type = 'manual'`** is used for catalogue-sourced records (no `products` table row). A new `merge_type` value (e.g. `catalogue_ingestion`) would distinguish this cleanly but requires a schema migration. Flag for Phase 3.

3. **`max_run` attribute**: Currently in `notes`. Should it be promoted to its own `max_run` attribute? Re-run extraction with an updated prompt if yes.

4. **org_id binding**: Catalogue ingestion requires an org. For manufacturer catalogues shared across orgs, consider a "system library" org concept. Flag for architecture discussion.

5. **Profile products**: Are the 7 BP-series aluminum profile products within scope for the registry, or should ingestion be filtered to LED strips only? Currently both are stored.
