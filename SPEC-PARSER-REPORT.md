# Spec Parser — Implementation Report

Branch: `feature/spec-parser`
Date: 22 Jun 2026

---

## Summary

Built a consultant-spec parser that reads a lighting schedule (PDF or Markdown) and produces `matching_requirements` + `matching_requirement_attrs` rows, so real project specifications flow through the matching engine instead of hand-seeded requirements. Mirrors the Phase 2 catalogue ingestion pattern (LLM extraction) applied to the spec side.

---

## Architecture

### Flow

```
spec-input/schedule.md (or .pdf)
  ↓
[1] spec-llm.ts     — LLM extraction → ExtractedSpecDocument
  ↓
[2] attr-mapper.ts  — map values through locked ATTR_CONFIG → MappedSpecItem[]
  ↓
[3] writer.ts       — DB write → matching_requirements + matching_requirement_attrs
  ↓
[4] spec-parse.ts   — CLI: orchestrate, print, generate SPEC-PARSER-REVIEW.md
```

### Files created

| File | Role |
|------|------|
| `spec-input/LightSelect-Test-Schedule.md` | Test fixture — 4-item consultant lighting schedule |
| `apps/api/src/lib/spec-parser/attr-config.ts` | **Locked attribute config**: every engine attribute key → operator, gate_type, weight |
| `apps/api/src/lib/spec-parser/luminaire-types.ts` | Taxonomy of 11 canonical types with aliases for LLM classification |
| `apps/api/src/lib/spec-parser/types.ts` | All pipeline types: ExtractedSpecItem, MappedSpecItem, SpecParseResult, etc. |
| `apps/api/src/lib/spec-parser/spec-llm.ts` | LLM extraction — sends spec to Claude, returns per-item attribute values |
| `apps/api/src/lib/spec-parser/attr-mapper.ts` | Maps LLM values through ATTR_CONFIG; separates matchable from informational |
| `apps/api/src/lib/spec-parser/writer.ts` | Writes matching_requirements + attrs to DB; idempotent (item_code keyed) |
| `apps/api/src/lib/spec-parser/pipeline.ts` | Orchestration layer |
| `apps/api/src/db/spec-parse.ts` | CLI script (`pnpm --filter api spec:parse`) |
| `apps/api/src/routes/spec-parser.ts` | Review API: `GET /spec-parser/review` |
| `apps/api/src/db/migrations/0005_spec_parser.sql` | Adds `item_code` and `informational_attrs` to `matching_requirements` |

### Schema changes

**`matching_requirements`** — two new nullable columns:
- `item_code text` — item/line code from the schedule (e.g. `LCL-015`); used as XLSX sheet name in exports.
- `informational_attrs jsonb` — array of `{ key, label, value }` for specified fields that are display-only (body material, finish, etc.). Never read by the matching engine.

---

## Requirement Mapping

### What the LLM extracts (values only)

For each line item: `item_code`, `description`, `luminaire_type` (classified), and per-attribute `{ attribute_key, value, confidence, source_reference }`.

The LLM extracts numeric targets stripped of operator symbols: `"≥ 900 lm"` → `value: "900"`. It does not choose operators, gate types, or weights — those are the locked config's responsibility.

### What the locked config provides (rules)

`apps/api/src/lib/spec-parser/attr-config.ts` maps every `attribute_key` to:

| Key | Operator | Gate / Scored | Weight |
|-----|----------|---------------|--------|
| `ip_rating` | `gte` | hard gate | — |
| `voltage` | `eq` | hard gate | — |
| `colour_family` | `colour_family_gate` | hard gate | — |
| `certifications` | `contains_required_cert` | soft gate | — |
| `cct` | `match_target_cct` | scored | 3 (high) |
| `cri` | `gte` | scored | 3 (high) |
| `lumens` | `match_target_lumen` | scored | 3 (high) |
| `lumens_per_metre` | `match_target_lumen` | scored | 3 (high) |
| `watts` / `watts_per_metre` | `lte` | scored | 2 (med) |
| `beam_angle` | `match_target` | scored | 2 (med) |
| `efficacy` | `gte` | scored | 2 (med) |
| `ik_rating` | `gte` | scored | 3 (high) |
| `surge_protection` | `gte` | scored | 3 (high) |
| `led_per_metre` | `gte` | scored | 2 (med) |
| `max_run` | `gte` | scored | 1.5 (med-low) |
| `body_material`, `finish`, `corrosion_class`, `control_type`, `notes`, … | — | **informational** | — |

Informational fields go into `matching_requirements.informational_attrs` JSONB and are never seen by the matching engine.

### Lumen basis

All lumen targets (`lumens`, `lumens_per_metre`) are written with `notes: "extracted from spec. lumen basis: delivered"`. The spec fixture explicitly marks all outputs as delivered. A human must confirm this before treating match decisions as final.

---

## Luminaire Type Classification

The LLM is given an 11-type taxonomy with aliases and asked to classify each line item:

```
downlight, flexible_tape, linear, profile, wall_washer,
floodlight, streetlight, pendant, surface, track, underwater
```

Classification is the gating decision: the type-scope filter in the engine means wrong-type candidates are excluded entirely. Items with classification confidence < 0.8 are flagged for human review.

---

## Review / Inspection

### CLI (`spec:parse`)

```
pnpm --filter api spec:parse \
  --spec spec-input/LightSelect-Test-Schedule.md \
  --org-id <uuid> \
  [--filter LCL-015,LCL-001]  # restrict to specific items
  [--run-matching]             # also run matching and show results
```

Produces `SPEC-PARSER-REVIEW.md` in the spec-input directory.

### API endpoint

```
GET /spec-parser/review?org_id=<uuid>
GET /spec-parser/review?org_id=<uuid>&item_code=LCL-015
GET /spec-parser/review/:requirementId
```

Returns requirements with attrs, informational fields, and match decision counts.

---

## Test Extraction — 3 Items

Parsed from `spec-input/LightSelect-Test-Schedule.md` (4 items, 35 in=2962 out≈1920 tokens):

### LCL-001 — Recessed Downlight

| LLM Output | Value |
|------------|-------|
| `luminaire_type` | `downlight` (conf=1.00) |
| `ip_rating` | `IP44` (hard gate) |
| `voltage` | `230V AC` (hard gate) |
| `lumens` | `900` → `match_target_lumen`, w=3 |
| `cct` | `3000` → `match_target_cct`, w=3 |
| `cri` | `90` → `gte`, w=3 |
| `beam_angle` | `38` → `match_target`, w=2 |
| `watts` | `12` → `lte`, w=2 |
| Informational: `body_material` | `White powder-coat aluminium` |
| Informational: `finish` | `White, RAL 9016` |
| Informational: `control_type` | `DALI` |

**Note**: DALI dimming was correctly extracted as **informational** (`control_type`), not a gate. This is correct behaviour per the locked config — dimming as a hard gate must be added manually if required.

### LCL-015 — Flexible LED Tape (Cove)

| LLM Output | Value |
|------------|-------|
| `luminaire_type` | `flexible_tape` (conf=1.00) |
| `ip_rating` | `IP20` (hard gate) |
| `voltage` | `24V DC` (hard gate) |
| `lumens_per_metre` | `2000` → `match_target_lumen`, w=3 |
| `cct` | `3000` → `match_target_cct`, w=3 |
| `cri` | `90` → `gte`, w=3 |
| `watts_per_metre` | `18` → `lte`, w=2 |
| `led_per_metre` | `168` → `gte`, w=2 |
| `max_run` | `8` → `gte`, w=1.5 |
| Informational | none |

All 8 attributes mapped correctly. This requirement is structurally equivalent to the hand-seeded flexible-tape requirement from matching-seed.ts, confirming the parser produces the same attribute structure.

### LCL-020 — Linear Surface / Pendant (Meeting Rooms)

| LLM Output | Value |
|------------|-------|
| `luminaire_type` | `linear` (conf=0.90) |
| `ip_rating` | `IP20` (hard gate) |
| `voltage` | `230V AC` (hard gate) |
| `lumens` | `3500` → `match_target_lumen`, w=3 |
| `cct` | `4000` → `match_target_cct`, w=3 |
| `cri` | `80` → `gte`, w=3 |
| `watts` | `40` → `lte`, w=2 |
| Informational: `body_material` | `Anodized aluminium` |
| Informational: `finish` | `Silver anodized` |
| Informational: `control_type` | `DALI` |
| Informational: `dimensions` | `1200 mm length (approximately)` |

Confidence 0.90 (slightly below 1.0) because "surface / pendant" spans two canonical subtypes. A human reviewer should confirm `linear` is the correct classification.

---

## End-to-End Matching Results

All 4 requirements written to DB and matched against the ILTI / Signify product pool:

| Item | Assessed | Pending | Disqualified | Excluded | Notes |
|------|----------|---------|-------------|----------|-------|
| LCL-001 (downlight) | 1 | 0 | 0 | 28 | Only Signify BRP 331 in pool |
| LCL-015 (flexible_tape) | 21 | 0 | 0 | 8 | All ILTI WKL strips assessed |
| LCL-020 (linear) | 0 | 0 | 0 | 29 | No linear products in pool yet |
| LCL-030 (floodlight) | 0 | 0 | 0 | 29 | No floodlight products in pool yet |

### LCL-015 Top-5 ranked candidates

| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |
|------|---------|------|------|------|-----------|
| 1 | ILTI LUCE — 1-WKL-6023-0-00 | 69.7% | 0.50 | Med | 0/1/1 |
| 2 | ILTI LUCE — 1-WKL-3021-1-00 | 69.7% | 0.50 | Med | 0/1/1 |
| 3 | ILTI LUCE — 1-WKL-4501-0-00 | 69.0% | 0.50 | Med | 1/0/1 |
| 4 | ILTI LUCE — 1-WKL-4502-0-00 | 62.8% | 0.50 | Med | 1/0/1 |
| 5 | EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00 | 55.2% | 0.50 | Med | 1/1/1 |

The LCL-015 requirement specifies `led_per_metre ≥ 168` which is stricter than the hand-seeded `≥ 120`, causing more deviations on LED density. The `max_run ≥ 8 m` attribute is a new constraint not in the hand-seeded requirement; this is where medium-weight deviations arise for short-run strips.

**Note on ranking**: on this branch (main), bare component_build strips are assessed normally on lumen output (the `delivered_pending` / `pending_characterisation` enhancement is on `feature/diffuser-configured-products`, not yet merged). The ranking here treats all strips as having source-lumen outputs comparable to the delivered target.

### Tests

35/35 tests pass. No existing test coverage was modified.

---

## Needs Human Decision

1. **Dimming as gate vs informational**: The parser puts DALI/0-10V/dimming into `control_type` (informational) because the locked config has no `dimming` key as a hard gate. If dimming protocol must gate candidates, add `dimming` to `ATTR_CONFIG` as a hard gate, then add a note here about which operator to use (`contains_value`).

2. **Luminaire type confirmation for low-confidence classifications**: LCL-020 was classified as `linear` with confidence 0.90. Before relying on its matching results, confirm the type. An incorrect type means the wrong candidate pool is evaluated entirely.

3. **Lumen basis confirmation**: All lumen targets are written with `notes: "lumen basis: delivered"`. The spec fixture uses the word "delivered" explicitly. For other real specs that do not, a human must confirm whether the stated lumen target is source or delivered before the matching result is trustworthy.

4. **Missing luminaire types in pool**: LCL-020 (linear) and LCL-030 (floodlight) return 0 assessed candidates because no linear or floodlight products have been ingested yet. Running catalogue ingestion for additional brands will populate these pools.

5. **`colour_family` extraction**: The parser requests `colour_family` from the LLM but this is rarely stated explicitly in a consultant spec. The LLM is instructed to infer it from the description only when explicit. For most spec items `colour_family` will be absent, meaning the colour family gate is not added to the requirement (not a default). If a gate is needed, add it manually.

6. **`informational_attrs` in AECOM exports**: The `informational_attrs` JSONB column on `matching_requirements` is written by the parser but not yet consumed by the AECOM export template. Wiring it into the "Specified" column of the export is a separate task.

7. **PDF support**: The parser supports PDF via the Anthropic `document` block (same as catalogue ingestion). `.md`, `.txt`, and other text formats use a `text` block. DOCX is not yet supported — convert to PDF before ingesting.

---

## Deferred

Per guardrails — not implemented:
- `colour_family` default inference (spec-side)
- AECOM export template wiring for `informational_attrs`
- DOCX parser support

---

## Fix 1 — `pending_characterisation` for bare strips

### Root cause

`feature/spec-parser` was branched off `main`. The `delivered_pending` / `pending_characterisation`
machinery (which prevents bare component_build strips from ranking against a lumen requirement) was
implemented on `feature/diffuser-configured-products` and never merged to `main`. That feature was
therefore absent from both main and this branch — the behaviour was not a parser bug. Parsed and
seeded lumen requirements are structurally identical; neither triggered `pending_characterisation`
because the engine logic simply did not exist on this branch.

### Fix

Ported the full machinery from `feature/diffuser-configured-products`:

| File | Change |
|------|--------|
| `db/schema/matching.ts` | Added `'pending_characterisation'` to `matchDecisionStatuses`; `'delivered_pending'` to `verdictTypes` |
| `lib/matching/types.ts` | Added `is_configured_product: boolean` to `MatchCandidate`; `pending_characterisation: boolean` + `pending_characterisation_reason: string \| null` to `MatchEvaluation` |
| `lib/matching/scorer.ts` | `match_target_lumen` case: detect `archetype='component_build' && !is_configured_product` → emit `delivered_pending`; `verdictScore()` returns null for `delivered_pending`; `calculateFit()` excludes `delivered_pending` from applicable |
| `lib/matching/confidence.ts` | `delivered_pending` verdicts score 0.0 in confidence calculation (lowers confidence band without excluding from denominator) |
| `lib/matching/engine.ts` | `loadCandidates`: detect `is_configured_product` from product attributes; `runEvaluation`: compute `requirementSpecifiesLumen` before candidate loop; after scored verdicts emit `pending_characterisation` evaluation and `continue` when `candidateHasPendingLumen`; ranking filter excludes `pending_characterisation`; `persistResults` maps `pending_characterisation` status |
| `db/spec-parse.ts` | Removed `AnyEval` cast — `MatchEvaluation.pending_characterisation` now typed correctly |
| `routes/spec-parser.ts` | Removed `(d.status as string)` cast — `'pending_characterisation'` is now a valid `MatchDecisionStatus` |

### LCL-015 re-run result (after fix)

| Group | Count | Notes |
|-------|-------|-------|
| Assessed | 3 | EXAMPLE Opal Profile combos only |
| Pending characterisation | 18 | All bare ILTI WKL strips |
| Disqualified | 0 | |
| Excluded | 8 | Wrong luminaire_type |

Bare strips (`1-WKL-6023-0-00`, etc.) no longer rank. The EXAMPLE Opal Profile + strip combos
are the only assessed candidates. The bare strips surface below in the `pending_characterisation`
group with `pending_characterisation_reason: 'delivered pending — pair with a characterised
profile to assess'`.

---

## Fix 2 — DALI as hard gate

### Analysis

The `contains_value` comparator with `isGate=true`:
- When the product **has** the `dimming` attribute and its value contains the required protocol → `gate_pass`
- When the product **has** the attribute but the value does not match → `gate_fail` (disqualified)
- When the product **lacks** the `dimming` attribute → `gate_unverifiable` (not disqualified, flagged)

This is the correct behaviour: products that cannot do DALI are disqualified; products with no
dimming data are flagged but not eliminated.

### Fix

| File | Change |
|------|--------|
| `lib/spec-parser/attr-config.ts` | Added `dimming` entry: `operator: 'contains_value'`, `gate_type: 'hard'`, `weight: null`, `informational: false` |
| `lib/spec-parser/spec-llm.ts` | Added `dimming` to `MATCHING_ATTR_LIST` with gate semantics; updated `control_type` description to redirect mandatory protocols to `dimming`; fixed the ambiguous "For dimming:" extraction rule |

### LCL-001 re-run result (after fix)

LCL-001 specifies `DALI`. The parser now extracts `dimming: "DALI"` instead of `control_type: "DALI"`.

| Product | Dimming attribute | Gate result |
|---------|-------------------|-------------|
| Signify BRP 331 | Not present | `gate_unverifiable` — flagged, not disqualified |

The BRP 331 is not disqualified (no `dimming` attribute → `gate_unverifiable`). The gate failure
is visible in evidence and soft_gate_comments. A human reviewer must verify DALI compatibility
before approving the product.

### Tests

35/35 pass. No regressions.
