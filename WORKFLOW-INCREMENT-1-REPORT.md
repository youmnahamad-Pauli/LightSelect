# Workflow Layer — INCREMENT 1 Report

**Branch:** `feature/workflow-project-hub`
**Date:** 22 Jun 2026

---

## What was built

Increment 1 wires the project as a document and intake hub. The project model, project CRUD, and `project_id` on `matching_requirements` already existed in `main`; this branch adds the document repository, spec-parse-into-project, and the two new dashboard tabs.

### Backend (additive only)

| Component | Change |
|-----------|--------|
| `0008_project_documents.sql` | New migration — creates `project_documents` table |
| `db/schema/projects.ts` | `project_documents` Drizzle table, `ProjectDocumentType` enum, `ProjectDocument` type |
| `schema/index.ts` | Exports `project_documents`, `ProjectDocumentType`, `ProjectDocument` |
| `lib/spec-parser/types.ts` | `SpecParseOptions.projectId?: string \| null` |
| `lib/spec-parser/pipeline.ts` | Threads `projectId` from opts to `writeSpecItem` |
| `lib/spec-parser/writer.ts` | `writeSpecItem` now accepts `projectId` and sets it on the inserted requirement |
| `routes/project-documents.ts` | Upload, list, classify, delete, parse-spec endpoints |
| `routes/matching.ts` | `GET /matching/requirements` now accepts `?project_id=` to filter by project |
| `index.ts` | Mounts `/projects/:projectId/documents` and `/project-documents/:docId` |

### Web (additive only)

| Component | Change |
|-----------|--------|
| `types/index.ts` | `ProjectDocument`, `ProjectDocumentType`, `PROJECT_DOCUMENT_TYPE_LABELS`, `SpecParseResult`, updated `MatchingRequirement` (added `project_id`, `item_code`, `informational_attrs`) |
| `lib/api-client.ts` | `api.projectDocuments` (list, upload, classify, delete, parseSpec); `api.matching.listRequirements` now accepts optional `projectId` |
| `components/projects/ProjectTabNav.tsx` | Added **Documents** and **Schedule** tabs (positions 2 and 3) |
| `(app)/projects/[id]/documents/page.tsx` | Documents hub: upload zone, list grouped by type, inline reclassify select, parse-spec button for PDF specs, delete |
| `(app)/projects/[id]/schedule/page.tsx` | Item schedule: table of `matching_requirements` filtered to this project, shows item code, description, luminaire type, informational attrs, flags |

---

## API endpoints

### Document repository

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/documents` | Upload document (multipart, `file` field) |
| GET | `/projects/:id/documents` | List project documents |
| POST | `/projects/:id/documents/parse-spec` | Parse a PDF spec into requirements (`{ document_id }`) |
| PATCH | `/project-documents/:docId` | Reclassify (`{ document_type }`) |
| DELETE | `/project-documents/:docId` | Delete document + disk file |

### Matching schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/matching/requirements?org_id=&project_id=` | List requirements, optionally filtered to a project |

---

## Document types

`spec` · `boq` · `drawing_dwg` · `submittal_template` · `test_certificate` · `datasheet` · `trade_licence` · `other`

DWG files are accepted (mime: `image/vnd.dwg`, `application/acad`, etc.), stored as `drawing_dwg`, never processed.

---

## File storage

Documents are stored at:
```
<api-root>/../project-documents/<orgId>/<projectId>/<uuid><ext>
```
This is separate from the existing `files`/`project_files` system and managed entirely by the `project_documents` table.

---

## What was already in main (no changes needed)

- `projects` table with all columns
- `project_id` on `matching_requirements` (nullable FK to projects, `onDelete: set null`)
- Project CRUD API (`/projects` routes)
- Project list/create web UI (`/projects` page)

---

## Verification path

1. Create project via the existing project list page
2. Navigate to **Documents** tab → upload a DWG → auto-classified as `drawing_dwg`
3. Upload a spec PDF → reclassify to `spec` if needed → click **Parse spec**
4. Navigate to **Schedule** tab → parsed requirements appear with item codes and luminaire types
5. Upload other doc types (BOQ PDF, submittal template) → each lands in correct group

---

## Tests

35/35 passing. TypeScript: 0 errors in both `apps/api` and `apps/web`.

---

## Notes / ambiguities

1. **File size limit**: uses the existing `config.maxFileSizeBytes` from the API config — no separate limit for documents.
2. **DWG mime types**: browsers report varying MIME types for `.dwg` files (the ALLOWED_MIMES set covers all known variants). If a DWG is rejected, the user can rename to `.dwg` — the filename extension check in `inferDocumentType` catches it.
3. **Parse-spec path resolution**: the stored path is relative (`project-documents/<orgId>/…`). The endpoint resolves it relative to `process.cwd()/..` (monorepo root). If the API working directory changes this will need adjustment.
4. **No download endpoint**: project documents don't have a download/stream endpoint in this increment. The `stored_path` field allows one to be added trivially.

---

## Deliberately deferred (Increments 2–4)

- **Matching / selection UI**: running the matching engine per schedule item and reviewing candidates — Increment 2
- **Document completeness index**: tracking which document types are required vs uploaded per project — Increment 3
- **Package assembly**: bundling compliance sheets, datasheets, submittals into an export package — Increment 4
- **DWG take-off**: extracting room/fixture data from DWG drawings — a later module, explicitly out of scope here
- **Object storage**: files are stored on the local filesystem under `project-documents/`. Production deployments should use S3/GCS/Azure Blob; the `stored_path` field is designed to be a path or object-storage key and the upload/serve code is isolated in `routes/project-documents.ts`

---

## Needs human decision

1. **`submittal_date` field**: ~~Resolved in amendment 0009~~ — `planned_submittal_date` (nullable date) added to `projects` table.

2. **Re-parse idempotency scope**: ~~Resolved in amendment 0009~~ — idempotency is now scoped to `(org_id, project_id, item_code)`. The same item code in two different projects creates separate requirements and never overwrites across projects.

3. **File storage root**: `storageDirForProject` uses `path.join(process.cwd(), '..', 'project-documents', ...)`. In production this should be replaced with object storage. The swap point is the `storageDirForProject` helper and the path construction in the upload handler — both in `routes/project-documents.ts`.

4. **Document download**: the `stored_path` is persisted but there's no `GET /project-documents/:docId/download` endpoint. Required for the completeness review UI in Increment 3 to let reviewers open uploaded documents.

5. **Spec parse trigger UX**: "Parse spec" is currently a manual button per spec document. Decide whether uploading a file already classified as `spec` should auto-trigger parsing (with confirmation), or keep it manual-only.

---

## Amendment — migration 0009 (project-scoped idempotency + planned_submittal_date)

**Branch:** `feature/workflow-project-hub` (same branch, follow-up commit)

### Changes

| File | Change |
|------|--------|
| `migrations/0009_project_scoped_requirements.sql` | Two partial unique indexes + `planned_submittal_date` on `projects` |
| `db/schema/projects.ts` | `planned_submittal_date` nullable `date` column |
| `db/schema/matching.ts` | `uqOrgProjectItem` and `uqOrgItemNoProj` uniqueIndex definitions |
| `lib/spec-parser/writer.ts` | Delete scoped to `(org_id, project_id, item_code)` — uses `isNull()` for unscoped case |
| `migrations/meta/0009_snapshot.json` | New snapshot (id→prevId chain: 0008→0009) |
| `migrations/meta/_journal.json` | idx 9 entry added |

### Unique index strategy

Two partial indexes enforce the correct scope without conflicting:

```sql
-- project-scoped requirements: each item_code is unique per (org, project)
CREATE UNIQUE INDEX uq_req_org_project_item
  ON matching_requirements (org_id, project_id, item_code)
  WHERE project_id IS NOT NULL AND item_code IS NOT NULL;

-- org-level requirements (no project): unique per (org, item_code) among unscoped rows
CREATE UNIQUE INDEX uq_req_org_item_noproj
  ON matching_requirements (org_id, item_code)
  WHERE project_id IS NULL AND item_code IS NOT NULL;
```

PostgreSQL NULL semantics mean a NULL `project_id` is never equal to another NULL `project_id` in a plain unique index, so without the second partial index two unscoped rows with the same `item_code` could coexist. The pair of partial indexes closes both gaps.

### Verification

Parsing two specs that share item code `FLEX-01` into projects A and B now produces two `matching_requirements` rows, each with its own `project_id`. Re-parsing into project A deletes only project A's `FLEX-01` row (leaving B's intact). 35/35 tests passing. TypeScript: 0 errors.
