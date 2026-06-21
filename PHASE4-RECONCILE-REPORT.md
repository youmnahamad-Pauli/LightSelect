# Phase 4 Reconcile Report

**Branch:** `feature/evidence-ui`
**Reconciled against:** `origin/main` @ `84878f2` (merged PR #7, includes cct-lumens fix `75bc9fe`)
**Date:** 2026-06-21

---

## STEP 1 — Merge result

`git merge origin/main --no-edit` completed with **no conflicts**.

The two branches had no overlapping file edits:

| Changed by `main` | Changed by `feature/evidence-ui` |
|-------------------|----------------------------------|
| `apps/api/src/db/schema/registry.ts` (`cct_kelvin` field) | `apps/api/src/routes/matching.ts` (new endpoints) |
| `apps/api/src/lib/matching/engine.ts` | `apps/web/src/app/(app)/matching/**` (new pages) |
| `apps/api/src/lib/matching/scorer.ts` | `apps/web/src/components/matching/**` (new components) |
| `apps/api/src/lib/matching/types.ts` | `apps/web/src/lib/api-client.ts` |
| `apps/api/src/lib/ingestion/catalogue-llm.ts` | `apps/web/src/types/index.ts` |
| `apps/api/src/lib/ingestion/registry-writer.ts` | `PHASE4-REPORT.md` |
| `apps/api/src/db/migrations/0004_…sql` + meta | |
| Docs, ingestion review, source PDF | |

Migration `0004_motionless_mother_askani.sql` (`ALTER TABLE product_attribute_values ADD COLUMN cct_kelvin integer`) was already applied to the database before this reconcile. No re-migration needed.

---

## STEP 2 — CCT display fix

### Problem
The scorecard's "Actual" column renders `match_evidence.product_value` verbatim. After the cct-lumens fix, `product_value` for the `cct` attribute is now a single integer string (`"2700"`, `"3000"`, etc.) — correctly a single value, not the old family-level comma-string. However the unit suffix ("K") was missing from the display.

### Change
**File:** `apps/web/src/app/(app)/matching/[requirementId]/decisions/[decisionId]/page.tsx`

Scorecard "Actual" cell (scored attributes table) — conditional on `required_operator === 'match_target_cct'`:

```
Before: {row.product_value ?? <missing>}
After:  row.required_operator === 'match_target_cct' ? `${row.product_value} K` : row.product_value
```

This is display-only. No matching logic, no schema, no evidence storage was changed.

The old comma-string issue (e.g. `"2700K, 3000K, 4000K"`) was already resolved by the data fix in commit `75bc9fe` — the `attribute_value` column now holds a single integer per SKU, and `cct_kelvin` is populated. The display change adds the K suffix for clarity.

---

## Pre-existing build fix

**File:** `apps/web/src/components/products/AttributeEditor.tsx` (last changed in `bb32942` — predates Phase 4 entirely)

`title` prop on Lucide icon components is not valid in this version of `lucide-react`. Changed three instances to `aria-label`. The `<span title={…}>` wrapper on the extracted-provenance row was left as-is (valid HTML). This blocked `next build` and is unrelated to matching.

---

## STEP 3 — Verification results

### Build
- `pnpm --filter api build` — **pass** (TypeScript clean)
- `pnpm --filter web build` — **pass** (all 12 routes compiled, 0 type errors after fix)

### DB state (live queries against Supabase)

**Requirement:** `aa049267-c07d-41a9-96d2-94a0f09963b9` — "LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC [tuned]" / `flexible_tape`

**Ranked list (top 10 of 18 scored):**

| Rank | Model | Fit% | H-Dev | Cmts |
|------|-------|------|-------|------|
| 1 | 1wkl6023000 | 93.1% | 0 | 1 |
| 2 | 1wkl4501000 | 76.9% | 1 | 0 |
| 3 | 1wkl3021100 | 76.9% | 1 | 0 |
| 4 | 1wkl6022000 | 70.0% | 1 | 1 |
| 5 | 1wkl3020100 | 70.0% | 1 | 1 |
| 6 | 1wkl6024000 | 70.0% | 1 | 1 |
| 7 | 1wkl4502000 | 70.0% | 1 | 1 |
| 8 | 1wkl4500000 | 53.8% | 2 | 0 |
| 9 | 1wkl7102000 | 53.8% | 2 | 0 |
| 10 | 1wkl3022100 | 53.8% | 2 | 0 |

Matches the live engine output from the matching-seed re-run (2026-06-21). No regressions.

**CCT evidence (all 10 checked — zero multi-value):**

| Model | product_value | verdict |
|-------|---------------|---------|
| 1wkl6023000 | `"3000"` ✓ | comply |
| 1wkl4501000 | `"3000"` ✓ | comply |
| 1wkl3021100 | `"3000"` ✓ | comply |
| 1wkl6022000 | `"2700"` ✓ | deviation |
| 1wkl3020100 | `"2700"` ✓ | deviation |
| 1wkl6024000 | `"4000"` ✓ | deviation |
| 1wkl4502000 | `"4000"` ✓ | deviation |
| 1wkl4500000 | `"2700"` ✓ | deviation |
| 1wkl7102000 | `"3000"` ✓ | comply |
| 1wkl3022100 | `"4000"` ✓ | deviation |

With the display fix, the "Actual" column in the scorecard shows `"3000 K"`, `"2700 K"`, etc.

**lm/m evidence (all 10 checked — zero ranges):**

All `product_value` entries are single figures (`"1850"`, `"1770"`, `"2224"`, etc.), confirming the per-SKU re-ingestion is reflected in persisted evidence.

**Confirm button / provenance lift:**
- `provenance_state` column confirmed present in `product_attribute_values`
- `1wkl3010100` (cct) and `1wkl3020100` (cct) show `provenance_state = human_confirmed` — evidence that the confirm-attr endpoint has been exercised and correctly upgrades provenance
- Confirm button in the UI calls `POST /matching/decisions/:id/confirm-attr` → updates `provenance_state = 'human_confirmed'` → re-runs evaluation → returns updated decision + evidence. Logic unchanged by merge.

---

## Files changed in this reconcile

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/matching/[requirementId]/decisions/[decisionId]/page.tsx` | CCT K-suffix display |
| `apps/web/src/components/products/AttributeEditor.tsx` | `title` → `aria-label` on Lucide icons (pre-existing build error) |
| `PHASE4-RECONCILE-REPORT.md` | This file |
| *(14 files from merge)* | All from `origin/main` — no manual edits |
