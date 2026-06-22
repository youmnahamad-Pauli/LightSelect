# Workflow Layer — INCREMENT 2 Report
## Match & Select the Proposed Product per Item

**Branch:** `feature/workflow-select-product` (off `main`)
**Date:** 2026-06-22

---

## What was built

INCREMENT 2 adds the ability to designate a **proposed product** for each luminaire
item in a project schedule, surfacing that designation across the schedule view,
the matching results page, and the AECOM compliance export.

---

## 1. Selection Model

### Schema — `matching_requirements` (migration `0010`)

Four nullable columns added:

| Column | Type | Purpose |
|---|---|---|
| `selected_candidate_type` | `text CHECK IN ('product','combo')` | Discriminates plain products from delivery combos |
| `selected_candidate_id` | `uuid` | Stable reference ID (see below) |
| `selection_is_override` | `boolean DEFAULT false` | True when the selected candidate was not `evaluated` |
| `selected_at` | `timestamptz` | Selection timestamp |

### Stable reference rationale

`match_decisions` rows are re-generated on every match run (old rows are deleted and
replaced). Storing a `match_decision_id` would break after the next re-run.

Instead, the selection stores the **identity of the product/combo itself**:

- **Plain canonical product** — `selected_candidate_type = 'product'`, `selected_candidate_id = canonical_products.id`
- **Delivery combo** — `selected_candidate_type = 'combo'`, `selected_candidate_id = delivery_combos.id`

Resolution path: `delivery_combos.id → delivery_combos.canonical_product_id → pass to spine`.

This survives match re-runs as long as the product stays in the catalogue.

---

## 2. Resolution Rules

The `resolveSelectionState(requirementId)` helper implements the full state machine:

| Stored selection | Latest decisions | Mode | `needs_review` |
|---|---|---|---|
| None | At least one `evaluated` | `auto` | false |
| None | None `evaluated` | `no_candidates` | false |
| Stored | Candidate still `evaluated` | `manual` | false |
| Stored | Candidate `evaluated`, `is_override=true` | `override` | false |
| Stored | Candidate no longer `evaluated`, `is_override=false` | `needs_review` | true |
| Stored | Candidate no longer in decisions at all | `needs_review` | true |
| Stored | Candidate not found in catalogue | `needs_review` | true |

**Auto** always shows the rank-1 assessed candidate when no manual selection is stored.

**Override confirmation**: PUT `/requirements/:id/selection` with a `disqualified` or
`pending_characterisation` candidate returns **409 REQUIRES_OVERRIDE** unless the
caller passes `is_override: true`. The web client shows a confirm dialog before
re-issuing the request with the flag.

**Excluded candidates** (luminaire type mismatch) return **422** and cannot be selected.

---

## 3. API Endpoints

All under `/matching/requirements/:id/`:

| Method | Path | Action |
|---|---|---|
| `PUT` | `/selection` | Set proposed product (auto-confirm or override) |
| `DELETE` | `/selection` | Clear selection (revert to auto) |
| `GET` | `/selection` | Resolve selection state for one requirement |
| `POST` | `/requirements/resolve-selections` | Batch resolve (request body: `{ requirement_ids: string[] }`) |
| `GET` | `/export/aecom` | Download AECOM XLSX for the proposed candidate |

---

## 4. Export Wiring

`GET /matching/requirements/:id/export/aecom` reuses the existing spine:

1. Calls `resolveSelectionState()` to find `resolved_canonical_product_id`
2. Calls `MatchDecisionExportSource.resolve(db, requirementId, resolvedCanonicalProductId, meta)`
3. Passes the `ComplianceStatement` to `renderStatement(statement, 'aecom')`
4. Streams the buffer as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Response headers:
- `X-Selection-Mode` — the mode (`auto`, `manual`, `override`, …)
- `X-Selection-Override` — `"true"` / `"false"`

No changes were made to the matching engine, scoring, gates, or ingestion pipeline.

---

## 5. Web

### Schedule page (`/projects/[id]/schedule`)

- Loads all requirements for the project
- After requirements load, calls `resolveSelectionsBatch()` once (single POST)
- New **Proposed Product** column shows:
  - `loading…` while batch resolves
  - `no assessable candidate` for `no_candidates`
  - Amber `selection needs review` badge for `needs_review`
  - `auto #{rank} {name}` for `auto`
  - Coloured `selected` or `override` badge + name for manual/override
- Clicking any row navigates to the matching results page

### Matching results page (`/matching/[requirementId]`)

- Loads current selection via `resolveSelection()` on mount
- Displays selection state at the top of the page (badge + "clear selection" link)
- Ranked candidates table: **Proposed** column
  - Current selection (auto or manual): green `auto` / `selected` / `override` badge
  - Other candidates: "select" link
- **Pending characterisation** section: "select (override)" link per product
- **Disqualified** section: "select (override)" link per product
- Override confirm dialog: explains the candidate status and warns about the override
  flag before re-issuing the PUT with `is_override: true`
- **Excluded** section: listed read-only, no selection action
- AECOM XLSX download button uses `api.matching.aecomExportUrl(requirementId)`

---

## 6. Verification

- `npx tsc --noEmit` — clean in both `apps/api` and `apps/web`
- `npx vitest run` — **35/35 tests pass** (no regressions)
- Matching engine, scoring, gate logic, and ingestion pipeline were not modified

---

## Deliberately deferred

- Bulk "select all auto" shortcut on the schedule page
- Selection history / audit log (who selected what, when)
- Email/notification when selection enters `needs_review` after a re-run
- Undo/redo stack for selections

---

## Needs human decision

1. **Re-run behaviour for `needs_review`**: When matching is re-run and the previously
   selected candidate re-appears as `evaluated`, should the system automatically
   clear `needs_review` and restore the selection, or leave it flagged until a human
   explicitly re-confirms? Current implementation leaves it flagged.

2. **AECOM export for `override`**: The export currently uses the override candidate
   without any special notation inside the XLSX itself (only via the response header).
   Should the XLSX carry an explicit "OVERRIDE — not fully compliant" cell or watermark?

3. **`no_candidates` in AECOM export**: Currently returns HTTP 422. Should the API
   instead export a "no candidate available" stub sheet so the consultant can see the
   requirement details even without a match?
