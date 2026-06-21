# Phase 3 Tuning Report — Matching Engine

**Branch:** `feature/matching-tuning`
**Date:** 2026-06-21
**Seed run against:** org `e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e` (ILTI LUCE catalogue)

---

## 1. Changes Implemented

### Change 1 — COLOUR FAMILY → Hard Gate

**Files changed:** `schema/matching.ts`, `comparators.ts`, `gates.ts`, `matching-seed.ts`

Added a new `colour_family_gate` operator. The gate evaluates whether the product's colour family is compatible with the requirement:

| Requirement | Eligible | Ineligible |
|-------------|----------|------------|
| `white` | `white`, `tunable_white`, `dim_to_warm` | `rgb`, `rgbw`, `rgbww`, `rgbic` |
| `rgb` | `rgb`, `rgbw`, `rgbww`, `rgbic` (RGBIC over-capable) | `white`, `tunable_white`, `dim_to_warm` |
| `rgbic` | `rgbic` only | all others |

The "can produce white" argument is explicitly rejected — a colour-channel product that can emit white is still DISQUALIFIED for a white requirement.

Colour family attribute values set on ILTI strips:

| Product | Family code | colour_family |
|---------|-------------|---------------|
| 1-WKL-6022-0-00 | N19 | `white` |
| 1-WKL-3020-1-00 | N24 | `white` |
| 1-WKL-3025-0-00 | N24HF | `white` |
| 1-WKL-4500-0-00 | N17 | `white` |
| 1-WKL-3010-1-00 | N10 | `white` |
| 1-WKL-7100-0-00 | N25 | `white` |
| 1-WKL-4510-0-00 | N21 | `rgb` |
| 1-WKL-4511-0-00 | N22 | `rgbw` |

### Change 2 — CCT Operator: `match_target_cct` (±100K absolute)

**Files changed:** `schema/matching.ts`, `config.ts`, `comparators.ts`, `scorer.ts`, `matching-seed.ts`

Added `match_target_cct` operator and `CCT_OUTER_ABS_K: 100` config constant.

The new comparator:
- Parses the product CCT as a comma-separated list or range.
- Finds the closest CCT value to the requirement target.
- Applies absolute-K bands: `delta = 0 K → comply`; `0 < delta ≤ 100K → comment`; `delta > 100K → deviation`.
- For tunable-white ranges (e.g. `2700K–6500K`): if the target falls within the range → comply.

Requirement seed updated from `contains_value` / `'3000'` → `match_target_cct` / `'3000'` (K).

**Impact on test set:** All white products with 3000K in their CCT list still receive COMPLY (delta = 0). The comment band (±100K) would activate for products whose nearest CCT option is within 100K of 3000K — none of the current ILTI products fall in this band.

Confirmed: CCT is **not** used as a gate anywhere.

### Change 3 — Missing-value → DEVIATION (included in denominator)

**Files changed:** `types.ts`, `engine.ts`, `scorer.ts`

Added `is_explicit_na: boolean` to `ResolvedAttributeValue`. The engine now populates this from `value_state === 'not_applicable'` when loading candidates.

Scorer logic change:

| Condition | Before | After |
|-----------|--------|-------|
| `value_state = 'not_applicable'` (explicit) | `not_applicable` (excluded from denominator) | `not_applicable` (unchanged) |
| Attribute row missing entirely | `not_applicable` (excluded from denominator) | `deviation` (score 0, **included** in denominator) |
| Row exists but value is null/unparseable | `not_applicable` | `deviation` |

This prevents products with absent data from floating upward on high fit scores calculated from too few attributes.

**Impact on test set:** All scored ILTI attributes are present for all candidate strips, so no scores changed in the current run. The change will affect future products with incomplete extraction.

### Change 4 — Data Hygiene

**Files changed:** `matching-seed.ts`, `docs/canonical-attribute-keys.md` (new)

- **Signify BRP 331** classified as `luminaire_type = 'downlight'`. Previously `null` (unclassified), it was not excluded by type-scoping. Now EXCLUDED correctly from flexible-tape matches.
- **Canonical attribute key list** written to `docs/canonical-attribute-keys.md`. Locked keys: `voltage` (not `input_voltage`), `led_per_metre` (not `leds_per_metre`), `colour_family` (not `colour_mode`).

### Change 5 — Lumen Basis Flag (light touch)

**Files changed:** `scorer.ts`

For `lumens` and `lumens_per_metre` attributes: if a comparator returns `comply` but provenance is not `test_report_backed` or `manufacturer_confirmed`, the verdict is downgraded to `comment` with note: "delivered output basis unconfirmed (verify from test report)".

**Impact on test set:** All ILTI products have `lumens_per_metre` at `extracted` provenance. However, N19's lm/m verdict was already `comment` (delta 3.75%, exceeds ±2% tight band), so no score change occurs. The flag would activate when a product's lm/m exactly hits the target but is only LLM-extracted, not test-report-backed.

---

## 2. Test Run Results

**Requirement:** LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC

**Gates (hard):** IP≥20, voltage=24V DC, colour_family=white

**Scored:** CCT @ 3000K (w=3), CRI≥90 (w=3), lm/m ~2000 (w=3), W/m ≤20 (w=2), LED/m ≥120 (w=2)

### 2a. Scored (passed all gates)

| Rank | Product | Fit% | Cap | Conf | Dev (H/M/L) | Comments |
|------|---------|------|-----|------|-------------|----------|
| 1 | ILTI LUCE — 1-WKL-6022-0-00 (N19) | **93.1%** | — | 0.60 Med | 0/0/0 | 1 |
| 2 | ILTI LUCE — 1-WKL-3020-1-00 (N24) | **76.9%** | ⚠ | 0.60 Med | 1/0/0 | 0 |
| 3 | ILTI LUCE — 1-WKL-4500-0-00 (N17) | **76.9%** | ⚠ | 0.60 Med | 1/0/0 | 0 |
| 4 | ILTI LUCE — 1-WKL-7100-0-00 (N25) | **53.8%** | ⚠ | 0.60 Med | 2/0/0 | 0 |
| 5 | ILTI LUCE — 1-WKL-3025-0-00 (N24HF) | **38.5%** | ⚠ | 0.60 Med | 2/1/0 | 0 |
| 6 | ILTI LUCE — 1-WKL-3010-1-00 (N10) | **38.5%** | ⚠ | 0.60 Med | 2/1/0 | 0 |

⚠ = high-weight deviation present (fit capped if > 80%, does not fire for these scores)

### 2b. Disqualified (colour_family gate)

| Product | Gate failure |
|---------|-------------|
| ILTI LUCE — 1-WKL-4510-0-00 (N21) | `colour_family: rgb ≠ white` |
| ILTI LUCE — 1-WKL-4511-0-00 (N22) | `colour_family: rgbw ≠ white` |

### 2c. Excluded (type mismatch)

| Product | Reason |
|---------|--------|
| Signify — BRP 331 | product=downlight, required=flexible_tape |
| ILTI LUCE — BP04/05/13/22/23/24/25AAOP1M (7 profiles) | product=profile, required=flexible_tape |

---

## 3. Evidence Detail — Top 3

### Rank 1: N19 (fit=93.1%, conf=0.60 Med)

| Attribute | Verdict | Note |
|-----------|---------|------|
| ip_rating [HARD] | GATE_PASS | IP20 ≥ IP20 |
| voltage [HARD] | GATE_PASS | 24V DC = 24V DC |
| colour_family [HARD] | GATE_PASS | white passes white gate |
| cct [w=3] | COMPLY | 3000K in list — delta 0K |
| cri [w=3] | COMPLY | 90 ≥ 90 |
| lumens_per_metre [w=3] | **COMMENT** | 1850–2000 lm/m; midpoint 1925, delta 3.75% (outside ±2% tight, inside ±10% outer) |
| watts_per_metre [w=2] | COMPLY | 14.4 W/m ≤ 20 W/m |
| led_per_metre [w=2] | COMPLY | 160 LED/m ≥ 120 |

**Score:** (3 + 3 + 0.7×3 + 2 + 2) / 13 × 100 = 12.1 / 13 × 100 = **93.1%**

### Rank 2: N24 (fit=76.9%, conf=0.60 Med)

Passes all gates. lm/m midpoint = 2216 lm/m (range 2064–2368), delta = +10.8% from 2000 lm/m target → DEVIATION (high-weight, w=3). All other attributes comply.

**Score:** (3 + 3 + 0 + 2 + 2) / 13 × 100 = **76.9%**

### Rank 3: N17 (fit=76.9%, conf=0.60 Med)

Passes all gates. CRI >95 (comply). lm/m midpoint = 1748 lm/m (range 1590–1905), delta = −12.6% from 2000 → DEVIATION (high-weight, w=3). LED/m = 240 (exceed). W/m = 15 (comply).

**Score:** (3 + 3 + 0 + 2 + 2) / 13 × 100 = **76.9%**

---

## 4. Comparison with Phase 3 Baseline

| Change | Phase 3 result | After tuning |
|--------|---------------|--------------|
| N21 (RGB) | Scored (ranked near bottom, multiple deviations) | **DISQUALIFIED** by colour gate |
| N22 (RGBW) | Scored (very low, no CCT/CRI matches) | **DISQUALIFIED** by colour gate |
| Signify BRP 331 | Excluded (type was null — type-scoping did not fire) | **EXCLUDED** (type=downlight) |
| White strip scores | unchanged | unchanged — all held 3000K in CCT list |
| CCT operator | `contains_value` (binary comply/deviation) | `match_target_cct` (±100K comment band enabled) |
| Missing values | not_applicable (excluded from denominator) | deviation (included in denominator) |

---

## 5. Needs Human Decision

- **N24 vs N17 rank tie at 76.9%**: Both have one high-weight deviation (lm/m). N24 overshoots at 2216 lm/m (+10.8%); N17 undershoots at 1748 lm/m (−12.6%). For a cove lighting application, undershoot is usually preferred (can be masked by reflector, overdrive risk with overshoot). Suggest adding `preference_undershoot: true` flag or a comment note — but this is a project-level policy decision.

- **N10 and N24HF at 38.5% tie**: Both are clearly unsuitable for this spec (N10: CRI 80, way over lm/m; N24HF: CRI 80, way over lm/m, exceeds W/m). Keeping them in results provides a correct picture of the available catalogue.

- **Confidence band is 'Med' for all ILTI products (0.60)**: All attribute values are `extracted` provenance (LLM-extracted from catalogue PDF, score 0.6). Upgrading any to `human_confirmed` or `test_report_backed` would raise the band to 'High' (≥0.8). This is a data quality task, not a matching engine task.

- **CCT comment band not activated in test set**: No ILTI white strip has a CCT nearest-match within 1–100K of 3000K without exactly hitting 3000K. The comment band will activate for future products (e.g. a strip offering only 2900K) — first real test will come with additional suppliers.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `apps/api/src/db/schema/matching.ts` | Added `colour_family_gate`, `match_target_cct` to `matchingOperators` |
| `apps/api/src/lib/matching/config.ts` | Added `CCT_OUTER_ABS_K: 100` |
| `apps/api/src/lib/matching/types.ts` | Added `is_explicit_na: boolean` to `ResolvedAttributeValue` |
| `apps/api/src/lib/matching/comparators.ts` | Added `compareColourFamilyGate`, `compareMatchTargetCct` |
| `apps/api/src/lib/matching/gates.ts` | Imported `compareColourFamilyGate`; added `colour_family_gate` case |
| `apps/api/src/lib/matching/scorer.ts` | Missing → deviation; `match_target_cct` case; lumen basis flag |
| `apps/api/src/lib/matching/engine.ts` | `is_explicit_na` populated in `attrMap` |
| `apps/api/src/db/matching-seed.ts` | Colour family classification; BRP 331 → downlight; recreate requirement with new gates |
| `docs/canonical-attribute-keys.md` | New — canonical attribute key reference |
