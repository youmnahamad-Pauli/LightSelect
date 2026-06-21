# CCT & Lumens-per-Metre Fix Report

**Branch:** `feature/cct-lumens-per-sku`
**Date:** 2026-06-21

---

## Problem statement

Two data-correctness bugs found via the Phase 4 evidence UI:

1. **CCT stored as family-level list, not SKU-level single value.**
   `product_attribute_values.attribute_value` for `cct` contained the full available-CCT menu
   for the product family (e.g. `"2200K, 2700K, 3000K, 3500K (on demand), 4000K, 5000K (on demand)"`),
   not this specific SKU's colour temperature. The matching engine was finding the closest value in
   the list; because the list spanned many CCTs, virtually every WKL product appeared to `comply`
   on CCT regardless of its true colour temperature.

2. **Lumens-per-metre stored as cross-variant span, not SKU-level value.**
   `lumens_per_metre` contained a range spanning multiple variants
   (e.g. `"2064-2368 lm/m"`) rather than the single figure for this SKU.
   The midpoint of a multi-SKU span is not a meaningful value for a specific product.

---

## Changes made

### STEP 1 — Schema (migration 0004)

Added `cct_kelvin INTEGER` to `product_attribute_values`.

- Populated by the ingestion writer whenever `attribute_key = 'cct'` and the extracted value
  resolves to a single integer in Kelvin.
- The matching engine reads this column first for `match_target_cct` comparisons; falls back to
  parsing `attribute_value` for legacy rows.
- `series_cct_options` added as a valid (informational-only) attribute name in the extractor —
  stores the family's full available-CCT menu for browsing. Never referenced in matching rules.

**File:** `apps/api/src/db/schema/registry.ts`
**Migration:** `src/db/migrations/0004_motionless_mother_askani.sql`
```sql
ALTER TABLE "product_attribute_values" ADD COLUMN "cct_kelvin" integer;
```

### STEP 2 — Ingestion extractor (generic)

Revised the LLM system prompt in `catalogue-llm.ts` to enforce per-SKU resolution:

**CCT rule:** A single SKU has exactly one colour temperature. Resolution order:
1. Specification table row for this exact SKU → use that number.
2. Catalogue's own order-code legend → decode from the SKU's model code.
3. Combined type/CCT/wattage name decoded per the catalogue's published key.
Never assign the family's full available-CCT list to an individual SKU's `cct` attribute.
Output format: plain integer string (e.g. `"3000"`, not `"3000K"`, not `"2700K, 3000K"`).

**series_cct_options:** Family's full CCT menu → informational attribute only.

**lumens_per_metre rule:** Extract this SKU's own figure from its specific row.
Single figure if stated; tight binning range if that's what the SKU's own row gives.
Do not collapse multiple variants' figures into one span.

Also: when `--filter` codes are provided to the ingestion CLI, they are now also passed as an
instruction to the LLM (`max_tokens` raised to 16 000), preventing output truncation on large
catalogues.

**Files:**
- `apps/api/src/lib/ingestion/catalogue-llm.ts` — prompt + filter-hint + max_tokens
- `apps/api/src/lib/ingestion/registry-writer.ts` — `parseSingleCctKelvin()`, populates `cct_kelvin`

### STEP 3 — Matching engine

**`cct_kelvin` read path (`apps/api/src/lib/matching/`):**
- `types.ts`: Added `cct_kelvin: number | null` to `ResolvedAttributeValue`
- `engine.ts`: Populates `cct_kelvin` from the DB row when building `attrMap`
- `scorer.ts` (`match_target_cct` case):
  - If `cct_kelvin` is set → compare directly as a single number (no string parsing)
  - If `cct_kelvin` is null and `attribute_value` parses as a list (> 1 item) → `deviation` with
    evidence note `"Multi-value CCT: per-SKU value not yet resolved — re-ingest to fix"`
  - Otherwise → existing `compareMatchTargetCct` on the string value (handles tunable-white ranges)

**Lumens comparator:** No change needed. `compareMatchTarget` already uses `midpoint()` which
handles single values and tight binning ranges correctly. The fix is in the data, not the logic.

---

## Before / after — WKL SKU data (8 original SKUs)

Requirement: 3000 K ±100 K, ~2000 lm/m, white family.

| SKU | Before CCT | Before CCT verdict | Before lm/m | Before lm/m verdict |
|-----|-----------|-------------------|------------|---------------------|
| 1-WKL-6022-0-00 | `2700K, 3000K, 4000K` *(family list)* | comply ✗ | `1850-2000 lm/m` *(span)* | comment |
| 1-WKL-3020-1-00 | `2200K, 2700K, 3000K, 3500K (on demand), 4000K, 5000K (on demand)` *(family list)* | comply ✗ | `2064-2368 lm/m` *(span)* | deviation |
| 1-WKL-4500-0-00 | `2700K, 3000K, 4000K` *(family list)* | comply ✗ | `1590-1905 lm/m` *(span)* | deviation |
| 1-WKL-7100-0-00 | `2200K, 2700K, 4000K` *(family list)* | comply ✗ | `1200-1550 lm/m` *(span)* | deviation |
| 1-WKL-3025-0-00 | `2200K, 2700K, 3000K…` *(family list)* | comply ✗ | `3400-4300 lm/m` *(span)* | deviation |
| 1-WKL-3010-1-00 | `3000K, 4000K` *(family list)* | comply ✗ | `3091-3264 lm/m` *(span)* | deviation |
| 1-WKL-4510-0-00 | disqualified (RGB gate) | — | — | — |
| 1-WKL-4511-0-00 | disqualified (RGBW gate) | — | — | — |

| SKU | After CCT | CCT verdict | After lm/m | lm/m verdict |
|-----|----------|------------|-----------|-------------|
| 1-WKL-6022-0-00 | `2700` *(single, from legend)* | deviation ✓ | `1800` *(single)* | comment |
| 1-WKL-3020-1-00 | `2700` *(single, from legend)* | deviation ✓ | `2064` *(single)* | comment |
| 1-WKL-4500-0-00 | `2700` *(single, from legend)* | deviation ✓ | `1590` *(single)* | deviation |
| 1-WKL-7100-0-00 | `2200` *(single, from legend)* | deviation ✓ | `1200` *(single)* | deviation |
| 1-WKL-3025-0-00 | `2700` *(single, from legend)* | deviation ✓ | `3400` *(single)* | deviation |
| 1-WKL-3010-1-00 | `3000` *(single, from legend)* | comply ✓ | `3091` *(single)* | deviation |
| 1-WKL-4510-0-00 | disqualified (RGB gate) | — | — | — |
| 1-WKL-4511-0-00 | disqualified (RGBW gate) | — | — | — |

**Key insight:** The ILTI catalogue's order-code legend does NOT encode CCT as the first two digits of the numeric suffix as naively assumed. The LLM decoded each SKU's CCT from the catalogue's own published key. Result: five of the six previously-evaluated SKUs now show `deviation` on CCT (they are 2700 K or 2200 K products, not 3000 K), which is the correct finding.

---

## Updated ranking (flexible-tape requirement, 3000 K / ~2000 lm/m)

Live run: 2026-06-21. 20 WKL products, 18 scored, 2 disqualified (RGB/RGBW colour gate), 8 type-excluded (profiles + Signify downlight).

| Rank | Product | Fit% | Conf | CCT | lm/m | CCT verdict | lm/m verdict |
|------|---------|------|------|-----|------|-------------|--------------|
| 1 | 1-WKL-6023-0-00 | 93.1% | Med | 3000 K | 1850 | comply | comment |
| 2 | 1-WKL-4501-0-00 | 76.9% | Med | 3000 K | 1770 | comply | deviation |
| 3 | 1-WKL-3021-1-00 | 76.9% | Med | 3000 K | 2224 | comply | deviation |
| 4 | 1-WKL-6022-0-00 | 70.0% | High | 2700 K | 1800 | deviation | comment |
| 5 | 1-WKL-3020-1-00 | 70.0% | High | 2700 K | 2064 | deviation | comment |
| 6 | 1-WKL-6024-0-00 | 70.0% | Med | 4000 K | 2000 | deviation | comment |
| 7 | 1-WKL-4502-0-00 | 70.0% | Med | 4000 K | 1905 | deviation | comment |
| 8 | 1-WKL-4500-0-00 | 53.8% | High | 2700 K | 1590 | deviation | deviation |
| 9 | 1-WKL-7102-0-00 | 53.8% | Med | 3000 K | 1400 | comply | deviation |
| 10 | 1-WKL-3022-1-00 | 53.8% | Med | 4000 K | 2368 | deviation | deviation |
| 11 | 1-WKL-3010-1-00 | 38.5% | High | 3000 K | 3091 | comply | deviation |
| 12 | 1-WKL-3026-0-00 | 38.5% | Med | 3000 K | 3650 | comply | deviation |
| 13 | 1-WKL-7101-0-00 | 30.8% | Med | 2700 K | 1300 | deviation | deviation |
| 14 | 1-WKL-7103-0-00 | 30.8% | Med | 4000 K | 1550 | deviation | deviation |
| 15 | 1-WKL-7100-0-00 | 30.8% | Med | 2200 K | 1200 | deviation | deviation |
| 16 | 1-WKL-3025-0-00 | 15.4% | Med | 2700 K | 3400 | deviation | deviation |
| 17 | 1-WKL-3027-0-00 | 15.4% | Med | 4000 K | 4300 | deviation | deviation |
| 18 | 1-WKL-3011-1-00 | 15.4% | Med | 4000 K | 3264 | deviation | deviation |

Disqualified: 1-WKL-4510-0-00 (RGB), 1-WKL-4511-0-00 (RGBW) — colour_family gate.

**Before:** all 6 originally-evaluated SKUs showed `comply` on CCT (false) — the family list always contained 3000 K.
**After:** only SKUs whose true CCT is 3000 K comply; 2700 K, 2200 K, and 4000 K products correctly deviate.

The sole no-deviation candidate is **1-WKL-6023-0-00** (3000 K, 1850 lm/m). Its lm/m comment (within outer ±10% tolerance) means a specifier note is required but it is not a deviation.

---

## Needs human decision

1. **CCT match for 2700 K products:** 1-WKL-6022 and 1-WKL-3020 are 2700 K — 300 K below the 3000 K
   requirement, which exceeds the ±100 K outer tolerance. They now correctly score `deviation` on CCT.
   If the project allows 2700 K, the requirement's CCT target or tolerance must be updated.

2. **New sibling SKUs (3021, 4501, 4502, 6023, 6024, 7101–7103, 3026, 3027, 3011):** These were
   discovered in re-ingestion. They need human review (`review_status = 'auto_merged'`).
   Confirm luminaire_type = 'flexible_tape' for all WKL siblings (currently unset — they were excluded
   in the count but the matching engine scores them because type-scoping only excludes when *both*
   product and requirement have a type set).

3. **colour_family for new SKUs:** The matching seed set `colour_family` for the original 8 SKUs.
   The 12 new sibling SKUs do not yet have a `colour_family` attribute in the registry, so they pass
   the colour-family gate (unverifiable → gate_pass). Run `pnpm tsx src/db/matching-seed.ts` or
   a human-confirm flow to set their colour_family = 'white'.

4. **Lumen basis:** All lm/m values remain `extracted` provenance. The lumen-basis comment is
   correctly triggered on lm/m comply/comment rows (unconfirmed basis). Confirm via test report
   to upgrade provenance and remove the comment flag.
