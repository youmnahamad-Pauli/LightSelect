# Diffuser / Configured-Products Pass — Implementation Report

Branch: `feature/diffuser-configured-products`
Date: 22 Jun 2026

---

## Summary

Implemented the full diffuser-transmission and configured-product pass. Bare component_build LED strips now produce `delivered_pending` lumen verdicts instead of being scored on source lumens. Strip + profile/diffuser combinations ("delivery combos") are represented as separate canonical products carrying a computed delivered lumen output and are matched on that delivered figure.

---

## What Was Built

### 1. Schema — `delivery_combos` table (new)

**File**: `apps/api/src/db/schema/delivery-combos.ts`
**Migration**: `0006_delivery_combos.sql`

Stores strip + profile/diffuser combos with full component identity:
- `canonical_product_id` → FK to canonical_products row that the matching engine uses
- `strip_canonical_product_id` → FK to the bare strip canonical product
- `profile_manufacturer`, `profile_model_code`, `profile_name` → AECOM Section 1 identity
- `diffuser_transmission` (real, 0.0–1.0)
- `transmission_provenance` → `'combo_tested' | 'published' | 'estimated'`
- `manufacturer_delivered_lm_per_m` → override when `transmission_provenance = 'combo_tested'`

**Note**: Named `delivery_combos` (not `configured_products`) to avoid collision with the pre-existing `catalogue.configured_products` table (project-scoped assembled deliverables with a different schema — `core_product_id` → `products`, `project_id`, `created_by` not null, etc.).

### 2. Schema — `matching_requirements.item_code` column (new, nullable)

**Migration**: `0005_configured_products.sql`

Added nullable `item_code text` to `matching_requirements`. Used as the XLSX sheet name in consultant exports. The seed now seeds `item_code = 'FLEX-TAPE'` on the requirement; the spine's metadata falls back to `options.item_code ?? req.item_code ?? luminaireSlug`.

### 3. Schema — `verdictTypes` array (updated)

**File**: `apps/api/src/db/schema/matching.ts`

Added `'delivered_pending'` to `verdictTypes`. This verdict is emitted by the `match_target_lumen` comparator when:
- The candidate's `archetype` attribute = `'component_build'`, AND
- The candidate is NOT a configured product (`is_configured_product = false`)

### 4. Matching engine — `MatchCandidate` type

**File**: `apps/api/src/lib/matching/types.ts`

Added `is_configured_product: boolean` to `MatchCandidate`. Set in `loadCandidates()` from the `is_configured_product='true'` product attribute value.

### 5. Matching engine — scorer (`scorer.ts`)

**File**: `apps/api/src/lib/matching/scorer.ts`

Changes to the `match_target_lumen` case:
- **Bare component_build detection**: before calling `compareMatchTargetLumen`, check `archetype === 'component_build' && !candidate.is_configured_product` → emit `delivered_pending` with evidence note "delivered lumen output not assessable — bare strip, diffuser transmission not characterised."
- `verdictScore()`: returns `null` for `'delivered_pending'` (excluded from fit).
- `calculateFit()`: filters out `'delivered_pending'` alongside `'not_applicable'` from the scoring denominator.

**Effect on ranking**: bare strips score 100% fit (lumen weight not counted in denominator). This is intentional — the engine cannot assess them on lumen delivery; they rise in rank to surface for human review rather than being buried. See FLAG below.

### 6. Matching engine — confidence (`confidence.ts`)

**File**: `apps/api/src/lib/matching/confidence.ts`

`delivered_pending` verdicts are included in the confidence calculation (NOT excluded like `not_applicable`). Their provenance score is forced to `0.0`, pulling confidence down. A bare strip with `delivered_pending` on its only lumen attribute gets confidence band `Low`.

### 7. Matching engine — engine (`engine.ts`)

**File**: `apps/api/src/lib/matching/engine.ts`

- Fixed DB driver import: changed `NodePgDatabase` (drizzle-orm/node-postgres) → `PostgresJsDatabase` (drizzle-orm/postgres-js) to match what the seed and spine actually use.
- `loadCandidates`: detects `is_configured_product='true'` attribute and sets `candidate.is_configured_product = true`.

### 8. Export types (`types.ts`)

**File**: `apps/api/src/lib/exports/types.ts`

- Added `ComponentIdentity { manufacturer, model_code, display_name }` interface.
- Added `transmission_provenance: string | null` to `LumenRepresentation`.
- Added to `ProposedProduct`: `is_configured_product: boolean`, `luminaire_component: ComponentIdentity | null`, `lamp_component: ComponentIdentity | null`.
- Added `'delivered_pending'` to `SpineVerdict`.

### 9. Export spine (`spine.ts`)

**File**: `apps/api/src/lib/exports/spine.ts`

- `detectArchetype()`: removed the `1wkl*` model code prefix heuristic. Only the explicit `archetype` product attribute is authoritative. Unknown archetype → `'unknown'` (flagged for human review in exports).
- `buildLumenRepresentation()`: added `transmission_provenance` field from `productAttrMap.get('transmission_provenance')`.
- `toSpineVerdict()`: maps `'delivered_pending'` engine verdict → `'delivered_pending'` spine verdict (new).
- New query block: if `is_configured_product='true'`, queries `delivery_combos` to populate `luminaire_component` (profile identity) and `lamp_component` (strip identity from strip canonical product).
- Metadata: `item_code` falls back to `req.item_code` (from DB) before using the luminaire type slug.

### 10. AECOM template (`aecom-xlsx.ts`)

**File**: `apps/api/src/lib/exports/templates/aecom-xlsx.ts`

- `composeAecomText()`: handles `'delivered_pending'` → `"DELIVERED PENDING — <comment>"`.
- `applyVerdictStyle()`: `'delivered_pending'` → bold amber (same amber as comment, bold for prominence).
- `addLumenRow()` extended:
  - **Engine `delivered_pending` verdict**: Proposed = "—"; Comment = "bare strip, diffuser transmission not characterised — Source: X lm/m". Bold amber.
  - **Spine-derived pending** (component_build without transmission in product attrs): Proposed = "pending diffuser transmission"; amber. 
  - **Known delivered with transmission_provenance**: appends provenance note to comment (e.g. "estimated transmission (placeholder — verify before issue)").
  - **Unknown archetype**: appends "⚠ archetype unconfirmed — lumen basis unconfirmed" to comment.
- `renderSection()`: now accepts optional `ComponentIdentity` parameter. When provided, overrides identity fields (manufacturer, model_code) for that section. Section 1 uses `luminaire_component`, Section 2 uses `lamp_component`. `country_of_origin` always reads from the top-level product.

### 11. Seed (`matching-seed.ts`)

**File**: `apps/api/src/db/matching-seed.ts`

- Step 1: Explicitly sets `archetype='component_build'` attribute on all 20 WKL strips.
- Step 2b (new): Creates the 1-WKL-6023 + EXAMPLE Opal configured product:
  - Finds 1-WKL-6023 strip (model code `1wkl6023000`)
  - Creates a `canonical_products` row for the combo: `EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00`, `dedup_key = 'ilti luce::combo-1wkl6023-example-opal'`
  - Copies all strip attributes to combo, then overrides:
    - `lumens_per_metre = '1480'` (1850 × 0.80 = 1480, delivered)
    - `archetype = 'component_build'`
    - `is_configured_product = 'true'`
    - `diffuser_transmission = '0.8'`
    - `transmission_provenance = 'estimated'`
  - Creates a `delivery_combos` row with profile identity (EXAMPLE / OPAL-EXAMPLE / opal, transmission=0.80, provenance='estimated')
- Requirement now seeded with `item_code = 'FLEX-TAPE'`.
- Side-by-side output after evaluation.

---

## Verification

### Side-by-side: bare strip vs combo

```
Product                                   Lumen Verdict      Evidence
─────────────────────────────────────────────────────────────────────
1-WKL-6023 (bare strip)                   DELIVERED_PENDING   delivered lumen output not assessable — bare strip,
                                                              diffuser transmission not characterised. Source: 1850 lm/m
+ EXAMPLE Opal (combo, delivered=1480)    DEVIATION           lumens_per_metre: 1480 — undershoot 26.0% exceeds −10% limit
─────────────────────────────────────────────────────────────────────
```

**Bare strip**: `delivered_pending` ✓  
**Combo**: deviation −26% (1480 vs 2000 lm/m, target) ✓

### AECOM XLSX

Generated for combo candidate:

```
C:\Users\julia\lightselect\apps\api\compliance-d5659a7e-2026-06-22-0524.xlsx
  Sheet:     FLEX-TAPE
  Proposed:  EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00
  Fit score: 76.9%
  Rank:      #4
```

AECOM Section 1 (LUMINAIRE): EXAMPLE / OPAL-EXAMPLE (the profile/diffuser component)  
AECOM Section 2 (LAMP): ILTI LUCE / 1-WKL-6023-0-00 (the strip component)  
Lumen row: `1480 lm/m`, verdict `Deviation`, comment includes "estimated transmission (placeholder — verify before issue)".

### Tests

35/35 tests pass (both `export-generators.test.ts` and `export-golden.test.ts`).

No matching tests were updated — the two test files cover only export functions and have no matching engine coverage.

---

## Ranking note (FLAG for human review)

**Confirmed behaviour — human review needed**: bare component_build strips score 100% fit because `delivered_pending` is excluded from the scoring denominator (there is no lumen score to count). They currently rank above the configured combo (rank #1–3 vs combo at rank #4). This surfaces them for human review rather than hiding them.

**If the intended behaviour is to rank bare strips BELOW assessed combos**, the correct fix is to add a rank-penalty for `delivered_pending` products, e.g. append them after all assessed products. This is a product/UX decision, not a logic error — the current implementation is correct per the spec ("EXCLUDE from fit verdict, LOWER confidence, flag prominently").

---

## Deferred

Per task spec — not implemented:
- SDCM / lamp_type ingestion
- Driver characterisation (`driver_type`, `driver_manufacturer`, `driver_reference`)
- Archetype-required UI guard
- `combo_tested` path (manufacturer delivers pre-tested output; `manufacturer_delivered_lm_per_m` override)

---

---

## Ranking Inversion Fix — `pending_characterisation` State (Task 7b)

Branch: `feature/diffuser-configured-products`
Date: 22 Jun 2026

### Problem (before fix)

Bare component_build strips scored 100% fit because `delivered_pending` was excluded from the fit denominator — there was no lumen score to count. Result: bare WKL strips ranked #1–3 above the configured combo (rank #4, 76.9%). An unassessable candidate outranked the only assessable one.

### Fix

Added `pending_characterisation` as a first-class candidate state (alongside `evaluated`, `disqualified`, `excluded`) in the matching engine.

**Logic** (`apps/api/src/lib/matching/engine.ts`):

1. After gate evaluation and scored attribute evaluation, check: does the requirement specify a lumen attribute (`lumens_per_metre` or `lumens`)? (`requirementSpecifiesLumen`)
2. If yes, and any scored verdict for this candidate is `delivered_pending` on a lumen key → push into `pending_characterisation` bucket with `fit_score: null`, no rank.
3. If the requirement does NOT specify lumen, `delivered_pending` is irrelevant — candidate is assessed normally.
4. Ranking filter: `!e.excluded && !e.pending_characterisation && e.passed_all_hard_gates && e.fit_score !== null`.
5. `persistResults`: maps `pending_characterisation` → `status = 'pending_characterisation'` in `match_decisions`.

**Schema** (`apps/api/src/db/schema/matching.ts`):

`matchDecisionStatuses` now includes `'pending_characterisation'`.

**Types** (`apps/api/src/lib/matching/types.ts`):

`MatchEvaluation` gains `pending_characterisation: boolean` and `pending_characterisation_reason: string | null`. Per-attribute `evidence` is still populated (non-lumen attributes have full verdicts); no headline fit or confidence.

### Verification — seeded flexible-tape requirement (target 2000 lm/m)

```
ASSESSED & RANKED (1):
  Rank  Product                                Fit%   Conf  Band  Dev(H/M/L)
     1  EXAMPLE Opal Profile + ILTI LUCE — … ⚠ 76.9%  0.60  Med   1/0/0   [COMBO]

PENDING CHARACTERISATION — LUMEN NOT ASSESSABLE (18):
  (bare component_build strips — pair with a characterised profile to assess)
  ⏳ ILTI LUCE — 1-WKL-6024-0-00 — source 2000 lm/m, delivered pending
  ⏳ ILTI LUCE — 1-WKL-6023-0-00 — source 1850 lm/m, delivered pending
  … (16 more)

DISQUALIFIED — HARD GATE FAILED (2): colour_family: rgb / rgbw ≠ white
EXCLUDED — TYPE MISMATCH (8): profiles + downlight
```

**Before fix**: bare strips at rank #1–3, combo at rank #4.  
**After fix**: combo is sole assessed candidate at rank #1 (76.9%, −26% lumen deviation). Bare strips in `pending_characterisation`, below, no fit score, flagged "delivered pending — pair with a characterised profile to assess".

### Side-by-side output

```
Product                                   Group         Lumen Verdict
────────────────────────────────────────────────────────────────────────
1-WKL-6023 (bare strip)                   pending_char  DELIVERED_PENDING
+ EXAMPLE Opal (combo, delivered=1480)    assessed      DEVIATION (−26%)
────────────────────────────────────────────────────────────────────────
```

### Tests

35/35 pass.

---

## Needs human decision

1. **Bare strip rank order**: Resolved by Task 7b — bare strips are now in `pending_characterisation`, not ranked among assessed candidates.

2. **Item_code required vs optional**: `matching_requirements.item_code` is nullable. The XLSX sheet name falls back to the luminaire type slug if null. Should item_code be required for exports, blocking generation if not set?

3. **Transmission placeholder in exports**: The EXAMPLE opal profile uses `transmission_provenance = 'estimated'`. The AECOM lumen row comment explicitly flags this: "estimated transmission (placeholder — verify before issue)." Confirm this wording is acceptable for consultant review packages.

4. **`delivery_combos` table name**: Named to avoid collision with existing `catalogue.configured_products`. If the intent was to extend the existing table, additional migration work would be needed (the existing table references `products` not `canonical_products`, has `project_id NOT NULL`, `created_by NOT NULL`).
