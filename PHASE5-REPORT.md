# Phase 5 — Compliance Exports: Implementation Report

## Overview

Phase 5 implements match-decision-driven compliance exports. The output is a structured XLSX that can be submitted to a lighting consultant alongside a product proposal. The architecture is two-layered:

1. **Data spine** — consultant-agnostic, built from DB match decisions
2. **Template layer** — consultant-specific renderers registered by key

---

## STEP 1 — Spine model (`apps/api/src/lib/exports/`)

### `types.ts` — shared data contracts

| Type | Purpose |
|---|---|
| `SpineVerdict` | `'comply' \| 'comply_with_comment' \| 'deviation'` |
| `StatementMetadata` | project_name, consultant, date, revision, ref, item_code, item_type |
| `ProposedProduct` | display_name, manufacturer, model_code, country_of_origin, fit_score, rank |
| `AttributeEntry` | attribute_key, label, specified_value, proposed_value, **verdict** (separate), **comment** (separate), provenance, is_gate, weight |
| `GateResult` | attribute_key, label, verdict (pass/fail/unverifiable), product_value, required_value |
| `ComplianceStatement` | Aggregate: metadata + general_description + proposed_product + attributes[] + gate_results[] |

Verdict and comment are **separate fields** throughout the spine — templates compose them in their own style.

### `spine.ts` — `MatchDecisionExportSource.resolve()`

Query sequence:
1. Load `matching_requirements` + `matching_requirement_attrs` for the requirement
2. Find decision: if `candidateId` given → find that candidate; else sort all `status='evaluated' && rank != null` decisions by rank, take first
3. Load `match_evidence` for decision (ordered by `created_at`)
4. Load `canonical_products` + `product_attribute_values` for the chosen product
5. Map each evidence row → `AttributeEntry` with:
   - `label`: from `ATTR_LABELS` map (or title-cased key)
   - `specified_value`: formatted by operator (`gte` → `≥ x`, `lte` → `≤ x`, `match_target_lumen` → `~x`, etc.)
   - `verdict`: engine `VerdictType` → `SpineVerdict | null` (gate_pass/comply → comply; comment → comply_with_comment; gate_fail/deviation → deviation; gate_unverifiable → comply_with_comment; not_applicable → null)
   - `comment`: `cleanComment()` strips the engine's `${key}: ${value} — ` prefix from evidence notes; comply entries get `null`
6. Build `gate_results[]` from evidence rows where `is_gate = true`

---

## STEP 2 — Template interface (`apps/api/src/lib/exports/templates/`)

### `base.ts`

```typescript
interface ExportTemplate {
  key: string;        // registry key, lowercase (e.g. "aecom")
  label: string;      // human label for listings
  render(statement: ComplianceStatement, options?: RenderOptions): Promise<Buffer>;
}
```

Templates are pure functions of their inputs — no DB access inside `render()`.

### `registry.ts`

- `_registry: Map<string, ExportTemplate>` keyed by lowercase consultant key
- `registerTemplate()` — called once per template at module load time
- `getTemplate(key)` — retrieve by key
- `listTemplates()` — array of `{ key, label }` for CLI help
- `renderStatement(statement, consultantKey, options?)` — validates key, calls `template.render()`

To add a new consultant: implement `ExportTemplate`, import in `registry.ts`, call `registerTemplate(new YourTemplate())`.

---

## STEP 3 — AECOM XLSX template (`aecom-xlsx.ts`)

Uses the repo's existing **ExcelJS** (`^4.4.0`). Sheet name = `metadata.item_code.slice(0, 31)`.

### Layout

| Rows | Content | Style |
|---|---|---|
| 1–4 | Header band: title / item type / project+date / consultant+ref | `#2D2D2D` bg, white text |
| 5 | Blank spacer | — |
| 6 | "GENERAL DESCRIPTION" | `#F2F2F2` section band |
| 7 | Description text (merged cols B–D) | `#FAFAFA` |
| 8 | Blank spacer | — |
| 9 | "TECHNICAL DESCRIPTION" | `#F2F2F2` section band |
| 10 | Column headers: Parameter / Specified / Proposed / Comments/Compliance | `#D9D9D9` |
| 11–13 | Identity rows: Manufacturer / Reference / Country of Origin | `#FAFAFA` |
| 14+ | One row per adjudicated attribute (skips `verdict === null`) | verdict-coloured col D |
| Last | "Other" trailing catch-all | grey |

Top 4 rows frozen (`ws.views` `ySplit: 4`).

### "Comments / Compliance" cell composition

| `SpineVerdict` | Cell text |
|---|---|
| `comply` | `"Comply"` — green (`#E8F5E9` / `#2E7D32`) |
| `comply_with_comment` | `"Comply with <comment>"` — amber (`#FFF8E1` / `#E65100`) |
| `deviation` | `"Deviation – <comment>"` — red (`#FDE8E8` / `#C62828`, bold) |
| `null` | Skipped (row omitted) |

En-dash (U+2013) used in "Deviation –" per AECOM convention.

---

## STEP 4 — CLI script

**Script**: `apps/api/src/db/export-compliance.ts`  
**pnpm alias**: `pnpm export:compliance` (added to `apps/api/package.json`)

```
pnpm export:compliance [--requirement <uuid>] [--candidate <uuid>] [--consultant aecom] [--org-id <uuid>]
```

If `--requirement` is omitted, auto-selects the first requirement for the org. Writes `compliance-<req-short>-<YYYY-MM-DD>.xlsx` to the working directory.

### Sample run output

```
[export-compliance] Auto-selected requirement: "LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC [tuned]"
[export-compliance]   ID: c088d9d3-eb4b-4697-b75f-b10ab05e47c6

[export-compliance] Building compliance statement…
  Proposed:  ILTI LUCE — 1-WKL-6023-0-00
  Fit score: 93.1%
  Rank:      #1
  Attrs:     8 adjudicated

[export-compliance] Rendering AECOM template…

[export-compliance] ✓ Compliance statement written to:
  C:\Users\julia\lightselect\apps\api\compliance-c088d9d3-2026-06-21.xlsx

  Sheet:     FLEX-TAPE
  Project:   LightSelect Demo Project
  Date:      21 Jun 2026
  Consultant: AECOM
```

**Output path**: `apps/api/compliance-c088d9d3-2026-06-21.xlsx`  
**Proposed product**: ILTI LUCE — 1-WKL-6023-0-00 (Rank #1, 93.1% fit)

---

## STEP 5 — Verification

### Legacy golden tests

```
✓ src/__tests__/export-generators.test.ts  22 tests
✓ src/__tests__/export-golden.test.ts      13 tests

Test Files  2 passed (2)
Tests      35 passed (35)
```

The legacy `generateBoqXlsx` and `generatePackagePdf` paths were not touched. All 35 tests pass.

### TypeScript build

`pnpm --filter api build` → clean, zero errors.

---

## Files added (all additive — nothing modified in matching/gates/scoring/ingestion/legacy export)

| File | Role |
|---|---|
| `apps/api/src/lib/exports/types.ts` | Spine type contracts |
| `apps/api/src/lib/exports/spine.ts` | `MatchDecisionExportSource` |
| `apps/api/src/lib/exports/templates/base.ts` | `ExportTemplate` interface |
| `apps/api/src/lib/exports/templates/aecom-xlsx.ts` | AECOM XLSX renderer |
| `apps/api/src/lib/exports/templates/registry.ts` | Template registry + `renderStatement()` |
| `apps/api/src/db/export-compliance.ts` | CLI script |

`apps/api/package.json` — one line added: `"export:compliance": "tsx src/db/export-compliance.ts"`

---

## Needs human decision

1. **`general_description` source**: currently uses `matching_requirements.description ?? name`. If requirements eventually have a richer description field (or it should come from the BOQ item), the spine's fallback logic needs updating.

2. **`country_of_origin` provenance**: read from `product_attribute_values` where `attribute_key = 'country_of_origin'`. This attribute is not currently ingested for WKL strips. The identity row renders `—` until the ingestion pipeline extracts it. Decision: ingest it, or hard-code per manufacturer?

3. **Multi-item exports**: the current CLI generates one sheet for one requirement. For a full BOQ export (multiple items → multiple sheets), the API layer needs a loop over requirements + a combined workbook. Architecture decision: single workbook with N sheets, or N separate files + a ZIP?

4. **Revision / REF fields**: currently accept static defaults from the CLI. These should eventually come from a project record in the DB. Decision: when to model `projects` as a first-class entity?

5. **AECOM column D width**: set to 54 characters to accommodate long comment strings. If consultants report truncation on-screen, this needs to be wider (or `wrapText` increased with taller row heights).

6. **`match_evidence.required_operator`**: used as the primary `operator` for formatting `specified_value`. This column exists in the evidence schema but is nullable. If missing, falls back to `reqAttr.operator`. Confirm the engine always writes it.
