# WORKFLOW LAYER — INCREMENT 3 REPORT
## Submittal Template + Required-Document Index + Completeness

Branch: `feature/workflow-doc-index`  
Completed: 2026-06-22  
Author: Youmna Hamad / Claude

---

## What was built

### 1 — Data model (`apps/api/src/db/schema/`)

| Table | Purpose |
|---|---|
| `submittal_templates` | Reusable document-checklist definitions (per-consultant or global) |
| `submittal_template_items` | Checklist lines: document_type, label, required, scope (`project` \| `per_item`), sort_order |
| `submittal_override_log` | Audit trail for export-gate overrides |

`projects.submittal_template_id` — nullable FK to `submittal_templates`.  
`project_documents.document_type` CHECK constraint extended to include `compliance_statement`.

Migration file: **`0012_submittal_templates.sql`**

**Seeded example template** (`a1b2c3d4-e5f6-7890-abcd-ef1234567890` — "Generic Lighting Submittal / AECOM"):
- project scope: Trade Licence (required), Company Profile (optional)
- per_item: AECOM Compliance Statement (required), Technical Datasheet (required), Third-Party Test Certificate (optional)

---

### 2 — Completeness engine (`apps/api/src/services/submittal-completeness.ts`)

`buildSubmittalCompleteness(projectId)` returns `SubmittalCompletenessResult`:

- **project-scope** items: satisfied when ≥1 `project_document` of that `document_type` exists for the project
- **per_item, non-compliance_statement**: satisfied when ≥1 `project_document` with matching `item_id` and `document_type`
- **per_item, compliance_statement**: satisfied when `resolved_canonical_product_id !== null` (auto rank-1 evaluated decision or stored manual/override selection)
- `is_export_ready = true` when `blocking_missing === 0`

---

### 3 — API routes (`apps/api/src/routes/submittal.ts`)

Registered in `apps/api/src/index.ts`:

| Method | Path | Description |
|---|---|---|
| GET | `/submittal-templates` | List (org's own + global) |
| POST | `/submittal-templates` | Create |
| GET | `/submittal-templates/:id` | Get with items |
| PATCH | `/submittal-templates/:id` | Update |
| DELETE | `/submittal-templates/:id` | Soft-delete (is_active=false) |
| POST | `/submittal-templates/:id/items` | Add item |
| PATCH | `/submittal-template-items/:itemId` | Update item |
| DELETE | `/submittal-template-items/:itemId` | Delete item |
| PATCH | `/projects/:projectId/submittal-template` | Assign / unassign template |
| GET | `/projects/:projectId/submittal-completeness` | Compute completeness |
| POST | `/projects/:projectId/submittal-completeness/check` | Export gate check |
| PATCH | `/project-documents/:docId/item-link` | Link doc to schedule item |

**Export gate** (`POST /projects/:id/submittal-completeness/check`):
- `is_override: false` (default) + incomplete → 422 `SUBMITTAL_INCOMPLETE` with `missing_items[]`
- `is_override: true` + `override_reason` → 200 `override_applied: true`, logs to `submittal_override_log`
- No template assigned → 422 `NO_SUBMITTAL_TEMPLATE`

---

### 4 — Web layer (`apps/web/`)

| File | Change |
|---|---|
| `src/types/index.ts` | Added `SubmittalTemplate`, `SubmittalTemplateItem`, `SubmittalTemplateWithItems`, `SubmittalProjectScopeItem`, `SubmittalPerItemDetail`, `SubmittalRequirementRow`, `SubmittalCompletenessResult`, `SubmittalGateCheckResult`, `SubmittalCompletenessSummary`, `SubmittalItemScope`; added `compliance_statement` to `ProjectDocumentType` union + label map; added `submittal_template_id` to `Project` |
| `src/lib/api-client.ts` | Added `api.submittalTemplates.*` (8 methods) and `api.submittalCompleteness.*` (3 methods) |
| `src/hooks/use-submittal-completeness.ts` | New hook |
| `src/components/projects/ProjectTabNav.tsx` | Added "Submittal" tab after "Checklist" |
| `src/app/(app)/projects/[id]/submittal/page.tsx` | Completeness view: project-scope + per-item sections, export gate with override |
| `src/app/(app)/projects/[id]/overview/page.tsx` | Added `useSubmittalCompleteness` + "Submittal" mini quick-nav card with urgency state |
| `src/app/(app)/projects/[id]/documents/page.tsx` | Added `compliance_statement` to inline `docTypeBadgeColor` record |

---

## VERIFY results

All checks on branch `feature/workflow-doc-index` against live API (http://localhost:3001):

| Check | Result |
|---|---|
| Migration 0012 applied | ✅ `migrations applied successfully` |
| Seeded template visible via `GET /submittal-templates` | ✅ `a1b2c3d4 \| Generic Lighting Submittal \| AECOM` |
| `PATCH /projects/:id/submittal-template` assigns template | ✅ `submittal_template_id` set on project |
| `GET /projects/:id/submittal-completeness` returns correct structure | ✅ `ps_total=1, ps_sat=0, blocking=1, per_item_rows=0` (no matching reqs in test project) |
| Gate check with missing items (no override) returns 422 | ✅ `code=SUBMITTAL_INCOMPLETE, missing=[project] Trade Licence / Company Registration` |
| Gate check with `is_override=true` logs override, returns 200 | ✅ `override_applied=true` |
| `GET /submittal-templates/:id` returns 5 seeded items | ✅ |
| `npx tsc --noEmit` apps/api | ✅ clean |
| `npx tsc --noEmit` apps/web | ✅ clean |
| `npx vitest run` apps/api | ✅ 35/35 pass |

---

## Design notes

- **Circular import**: `submittal.ts` imports from `projects.ts` (for `submittal_override_log.project_id`). To avoid the reverse dependency, `projects.ts` declares `submittal_template_id` as a plain `uuid()` column with no `.references()`. The FK is enforced at DB level via the migration SQL only.
- **compliance_statement as virtual document type**: Compliance statements are generated documents (AECOM sheets), not uploaded files. The completeness engine satisfies them by checking `resolved_canonical_product_id !== null` on the matching selection, not by querying `project_documents`.
- **Gate override is logged, not blocked**: The override pattern matches the existing matching-engine decision override: the action is permitted and audited rather than hard-blocked.
