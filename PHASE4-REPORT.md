# Phase 4 — Evidence & Trust UI

**Branch:** `feature/evidence-ui`
**Date:** 2026-06-21

## What was built

A read-and-display interface in the web app (`apps/web`) that surfaces Phase 3 matching output. Three new pages and a minimal API extension.

### New routes (web)

| URL | Description |
|-----|-------------|
| `/matching` | Requirements list — shows all matching requirements for the org |
| `/matching/[requirementId]` | Results view — ranked / disqualified / excluded products |
| `/matching/[requirementId]/decisions/[decisionId]` | Evidence detail — per-attribute gate + scorecard with Confirm action |

### New components

| Component | Purpose |
|-----------|---------|
| `VerdictBadge` | Colour-coded badge (comply / comment / deviation / gate verdicts) |
| `FitBar` / `FitNumber` | Horizontal fit% bar and inline numeric, colour by score |
| `ConfidencePill` | High / Med / Low confidence band pill with % |

### Sidebar

"Matching" entry added between Projects and Categories (`SlidersHorizontal` icon).

### API extensions (`apps/api`)

- `GET /matching/decisions` extended with `deviations_medium_weight`, `deviations_low_weight`, `comments_count`, `soft_gate_comments`, `fit_cap_reason`, `luminaire_type`, `evaluated_at`, `display_name`
- `GET /matching/decisions/:id` extended with `display_name` and `luminaire_type` from canonical_products join
- `POST /matching/decisions/:id/confirm-attr` — sets `provenance_state = 'human_confirmed'` on a single attribute, re-runs matching, returns updated decision + evidence

### Design

Follows existing app tokens: Inter font, warm earth palette (`#7B5A43` primary, `#F7F4EF` canvas, `#2B2621` ink), Card/Button/Badge components.

## Evidence detail page — feature summary

- **Product header**: name, fit%, confidence band, rank, "capped" warning banner
- **Gate Results table**: attribute key, required value, product value, verdict badge, note
- **Attribute Scorecard table**: attribute key, required value (with operator), actual value, verdict badge, weight, provenance (colour-coded), note, Confirm button
- **Confirm action**: visible on rows with `provenance = 'extracted'`; on click POSTs to confirm-attr, re-runs match, refreshes confidence and verdicts in-place
- **Score summary footer**: fit%, deviation counts, comment count

## Needs human decision

None. All behaviour was deterministic from the Phase 3 schema and API.

## Known pre-existing TypeScript errors (not introduced here)

`apps/web/src/components/products/AttributeEditor.tsx` lines 80/92/94 — `title` prop on Lucide icons. Errors exist on `main` before this branch. Out of scope for Phase 4.

## To verify end-to-end

1. Start API: `pnpm --filter api dev`
2. Start web: `pnpm --filter web dev`
3. Navigate to `/matching` — requirements list should appear
4. Click a requirement → results view with ranked/disqualified/excluded sections
5. Click a ranked product → evidence detail with gate table and scorecard
6. On a row with provenance "AI extracted", click Confirm → confidence updates
