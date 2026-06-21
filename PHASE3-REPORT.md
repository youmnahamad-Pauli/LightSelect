# Phase 3 — Matching Core: Report

**Branch:** `feature/matching-core`  
**Date:** 2026-06-21  
**Status:** COMPLETE — test run passed; PR opened; NOT merged to main.

---

## What was built

### Schema additions (migration `0003_nosy_bastion.sql`)

**New tables:**

| Table | Purpose |
|---|---|
| `matching_requirements` | A named set of attribute constraints for a luminaire type |
| `matching_requirement_attrs` | Per-attribute constraints (gate or scored, with operator + target) |
| `match_decisions` | One row per (requirement × candidate) with fit score, confidence, rank |
| `match_evidence` | Per-attribute verdict for each decision; full audit trail |

**Additive columns on existing tables:**

| Table | Column | Purpose |
|---|---|---|
| `canonical_products` | `luminaire_type` | Type-scoping (flexible_tape / profile / downlight …) |
| `canonical_products` | `approvals_held` | Certifications held (used by soft gate) |
| `product_attribute_values` | `provenance_state` | Phase 3 extended provenance (5 states, see below) |

### Provenance states (Spec §E)

| State | Score | Notes |
|---|---|---|
| `test_report_backed` | 1.0 | Third-party test report evidence |
| `manufacturer_confirmed` | 1.0 | Confirmed directly by manufacturer |
| `human_confirmed` | 0.9 | Manually verified by a user |
| `extracted` | 0.6 | LLM-extracted from a catalogue PDF |
| `missing` | 0.0 | Attribute not found for this product |

Existing `value_state` values map to Phase 3 provenance at query time (`confirmed` → `human_confirmed`, `extracted` → `extracted`, `not_applicable` → excluded from scoring).

### Matching engine (`apps/api/src/lib/matching/`)

| File | Role |
|---|---|
| `config.ts` | All configurable constants (scores, cap, tolerances, provenance scores, band thresholds) |
| `types.ts` | TypeScript interfaces for all engine data structures |
| `parse-value.ts` | Numeric value extractor — handles ranges (`1850-2000 lm/m`), inequality prefixes (`>95`), unit-stripping (`14.4W/m → 14.4`), comma lists |
| `comparators.ts` | Comparison operators: `gte`, `lte`, `eq`, `range_covers`, `match_target`, `contains_value`, `contains_required_cert` |
| `gates.ts` | Gate evaluation (hard / soft / conditional), pass/fail/unverifiable classification |
| `scorer.ts` | Scored attribute evaluation, fit = Σ(w×s)/Σ(w), 80% cap when high-weight deviation present |
| `confidence.ts` | Confidence = avg provenance score of applicable attrs; band = High/Med/Low |
| `engine.ts` | Orchestrates: load → type-scope → gate → score → fit → confidence → rank → persist |

### Routes

`GET/POST /matching/requirements` — list / create requirements  
`GET /matching/requirements/:id/run` — preview evaluation (no persist)  
`POST /matching/requirements/:id/run` — run + persist to DB  
`GET /matching/decisions?requirement_id=<uuid>` — ranked decision list  
`GET /matching/decisions/:id` — decision + per-attribute evidence  

### Scripts

`pnpm --filter api matching:seed` — classify ILTI products, seed test requirement, run evaluation, persist, print ranked table.

---

## STEP 3 — Test Run Results

**Requirement:** LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC  
**Org:** e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e (ILTI test org)  
**Candidates evaluated:** 16 total  
**Excluded (type mismatch):** 7 ILTI BP profile products  
**Disqualified (hard gate fail):** 0  
**Scored:** 9  

### Hard gates

| Attribute | Operator | Requirement |
|---|---|---|
| `ip_rating` | ≥ | IP20 |
| `voltage` | = | 24V DC |

All 8 ILTI WKL strips passed both hard gates. No products disqualified.

### Scored attributes and weights

| Attribute | Operator | Target | Weight |
|---|---|---|---|
| `cct` | contains_value | 3000 | 3 (high) |
| `cri` | ≥ | 90 | 3 (high) |
| `lumens_per_metre` | match_target ±2%/±10% | 2000 lm/m | 3 (high) |
| `watts_per_metre` | ≤ | 20 W/m | 2 (medium) |
| `led_per_metre` | ≥ | 120 LED/m | 2 (medium) |

### Ranked results

| Rank | Product | Fit% | Conf | Band | Dev H/M/L | Comments | Key verdict |
|---|---|---|---|---|---|---|---|
| 1 | N19 — 1-WKL-6022-0-00 | **93.1%** | 0.60 | Med | 0/0/0 | 1 | All comply; lm/m within ±10% (comment) |
| 2 | N24 — 1-WKL-3020-1-00 | 76.9% ⚠ | 0.60 | Med | 1/0/0 | 0 | lm/m 2064-2368 > target (deviation, capped) |
| 3 | N17 — 1-WKL-4500-0-00 | 76.9% ⚠ | 0.60 | Med | 1/0/0 | 0 | lm/m 1590-1905 below target (deviation) |
| 4 | N21 — 1-WKL-4510-0-00 | 57.1% ⚠ | 0.60 | Med | 1/0/0 | 0 | RGB strip; lm/m deviation |
| 5 | N25 — 1-WKL-7100-0-00 | 53.8% ⚠ | 0.60 | Med | 2/0/0 | 0 | CRI >80 < 90; lm/m low |
| 6 | N22 — 1-WKL-4511-0-00 | 53.8% ⚠ | 0.60 | Med | 2/0/0 | 0 | RGB+White; 2 deviations |
| 7 | N24HF — 1-WKL-3025-0-00 | 38.5% ⚠ | 0.60 | Med | 2/1/0 | 0 | High lm/m + W/m deviation |
| 8 | N10 — 1-WKL-3010-1-00 | 38.5% ⚠ | 0.60 | Med | 2/1/0 | 0 | CRI/lm/m deviation + W/m deviation |
| 9 | Signify — BRP 331 | 0.0% | 0.00 | Low | 0/0/0 | 0 | No attribute data; ranks last correctly |

⚠ = product has ≥1 high-weight deviation (weight ≥ 2.5)

**Confidence band:** All ILTI products score Med (avg provenance 0.60 = all-extracted data). No test-report-backed or manufacturer-confirmed values in the ingested ILTI data.

---

## Accuracy assessment

### What worked well

- **Type-scoping**: 7 BP profiles correctly excluded; all 8 WKL strips entered the scoring pool.
- **Gate logic**: IP20 and 24V DC gates evaluated correctly on all candidates.
- **lm/m comparison**: Range midpoint method correctly placed N19 (1925 lm/m mean, 3.75% delta → comment) ahead of N24 (2216 lm/m mean, 10.8% delta → deviation) and N17 (1747.5 lm/m mean, 12.6% → deviation).
- **CRI comparison**: `>95` correctly parsed as lower-bound 95 ≥ 90 → comply.
- **CCT list matching**: Comma-separated CCT lists correctly searched for "3000".
- **W/m parsing**: `14.4W/m` correctly parsed (unit "/" not misidentified as list separator after fix).
- **LED/m comparison**: `160 LED/m` and `240 LED/m` both correctly ≥ 120.
- **N19 ranked first**: Correct — it is the closest lm/m match with good CRI and CCT.

### Known limitations / data gaps

| Issue | Impact | Decision required |
|---|---|---|
| No `test_report_backed` or `manufacturer_confirmed` data in ILTI ingestion | All confidence scores = 0.60 (extracted), band = Med. Cannot distinguish high- from low-confidence products yet. | Human review or test-report import needed to upgrade provenance states. |
| Signify BRP 331 is a Phase 1 product with no luminaire_type | It ranked last (0% fit) correctly, but appears in the results as noise. | Set luminaire_type on all Phase 1 registry products to enable clean type-scoping. |
| Attribute key mismatch discovered: `voltage` not `input_voltage` | Required manual correction of the requirement seed. | Seed and requirement-creation docs should list canonical attribute keys. |
| `watts_per_metre` and `led_per_metre` missing from most products | Only N19 and N17 had these attributes. | Re-check ingestion LLM attribute schema — these are likely present in the catalogue but not consistently extracted. |
| lm/m comparison uses midpoint of extracted range | For match-target requirements, using the mean of a range is an approximation. The actual product may ship at either end. | Acceptable for now; note in requirements for human review. |
| CCT "on demand" suffixes in CCT list | N24's CCT: "3500K (on demand)" → strip extracts "3500" which is fine, but the "(on demand)" note is lost. | Non-critical; visible in evidence_note. |

---

## Bugs found and fixed

| Bug | Root cause | Fix |
|---|---|---|
| `watts_per_metre` and `led_per_metre` always NOT_APPLICABLE | `parseAttributeValue` treated "/" in "W/m" as a list separator | Strip units before list-separator detection |
| Fit = 100% for products with no applicable attributes | `totalWeight = 0` → `0/0 = 100` fallback | Return `fit_score = 0` when `applicable.length === 0` |
| Rank display in wrong order | Double-sort in seed script (second sort reversed first) | Single rank-asc sort |
| Attribute key `input_voltage` not in ILTI data | ILTI data uses `voltage`; requirement used wrong key | Fixed in seed; noted for future requirement creation |
| Attribute key `leds_per_metre` not in ILTI data | ILTI data uses `led_per_metre` | Fixed in seed |

---

## Open questions (Spec §E — carried forward)

| Item | Status |
|---|---|
| Confidence band thresholds (High/Med) | Set to ≥0.80 = High, ≥0.50 = Med in config.ts. Needs validation against real-world requirements. |
| Controlled distribution-type tag vocabulary | Not implemented (marked as `member_of` operator, table not populated). |
| Approvals-held / approvals-required lists | `approvals_held` column added; soft-gate `contains_required_cert` operator implemented. Needs population from supplier data. |
| L70 lumen-maintenance grade | Can be stored as `lifetime_grade` attribute key; no schema change needed. Not yet in ILTI data. |

---

## Files created / modified

### New
- `apps/api/src/db/schema/matching.ts` — 4 new tables + enums
- `apps/api/src/db/migrations/0003_nosy_bastion.sql` — migration
- `apps/api/src/lib/matching/config.ts`
- `apps/api/src/lib/matching/types.ts`
- `apps/api/src/lib/matching/parse-value.ts`
- `apps/api/src/lib/matching/comparators.ts`
- `apps/api/src/lib/matching/gates.ts`
- `apps/api/src/lib/matching/scorer.ts`
- `apps/api/src/lib/matching/confidence.ts`
- `apps/api/src/lib/matching/engine.ts`
- `apps/api/src/lib/matching/index.ts`
- `apps/api/src/db/matching-seed.ts`
- `apps/api/src/routes/matching.ts`
- `PHASE3-REPORT.md` (this file)

### Modified (additive only)
- `apps/api/src/db/schema/registry.ts` — added `luminaire_type`, `approvals_held`, `provenance_state` columns
- `apps/api/src/db/schema/index.ts` — export `./matching`
- `apps/api/src/index.ts` — register `/matching` router
- `apps/api/package.json` — add `matching:seed` script
- `apps/api/src/db/migrations/meta/_journal.json` — updated by drizzle-kit

### NOT touched
- Export / compliance rendering (routes/exports.ts, services/export-*.ts) — additive constraint honoured.
- Existing spec/checklist/boq routes — unchanged.
- All Phase 1 + 2 tables — no destructive changes.
