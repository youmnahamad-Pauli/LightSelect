# LightSelect — Module Map
_Generated on feature/export-seam for Phase 0 of the decision-engine refactor._

---

## Export pipeline

### XLSX renderer
| Item | Detail |
|---|---|
| Entry function | `generateBoqXlsx()` — private async, returns `Buffer` |
| File | `apps/api/src/services/export-artifact.ts` lines 341–538 |
| Triggered by | `generateArtifact()` in the same file |
| DB queries (internal) | `SELECT * FROM export_package_boq_items WHERE export_package_id = …` (sort_order ASC); `SELECT * FROM export_package_items WHERE export_package_id = …` (section_order, sort_order ASC) |
| Rendered content | Sheet 1 "BOQ Schedule": BOQ line items with compliance scores. Sheet 2 "Summary": project info, checklist, BOQ stats, section composition, legend. Sheet 3 "Compliance Statement": per-luminaire attribute compliance (added in feature/compliance-statement). |
| Non-determinism | `new Date().toLocaleString()` written into "Generated At" cell (Summary sheet). `wb.created` / `wb.modified` metadata. |
| Output | `Buffer` written to disk as `{uploadsDir}/{orgId}/exports/{exportPackageId}/boq-schedule.xlsx` |

### PDF renderer
| Item | Detail |
|---|---|
| Entry function | `generatePackagePdf(input: PdfGeneratorInput)` — exported async, returns `Buffer` |
| File | `apps/api/src/services/export-pdf.ts` lines 261–521 |
| DB queries (internal) | Same two queries as XLSX (export_package_items, export_package_boq_items by exportPackageId) |
| Rendered content | A4 multi-page PDF: project header (with optional consultant logo + brand colour), export readiness, BOQ summary, compliance statement, section composition, BOQ schedule table, legend. Page footers with timestamp + page numbers. |
| Non-determinism | `new Date().toLocaleString()` in footer timestamp; `bufferPages` / PDFKit metadata. |
| Output | `Buffer` written as `package-summary.pdf` alongside XLSX |

### ZIP bundler
| Item | Detail |
|---|---|
| Entry function | `generateExportZip(opts)` |
| File | `apps/api/src/services/export-zip.ts` |
| DB queries | None — bundles already-written files on disk |
| Output | `export-bundle.zip` |

### Export coordinator (`generateArtifact`)
| Item | Detail |
|---|---|
| File | `apps/api/src/services/export-artifact.ts` lines 542–673 |
| Input | `ArtifactInput` = `{ exportPackageId, projectId, orgId, checklistSnapshot, boqSnapshot, activeSpecDocumentId }` |
| DB queries (own) | 1. `projects` (project_name, client_name, project_code, revision_label, consultant_template_id). 2. `consultant_templates` (template_name, logo_url, brand_color) — if template assigned. 3. `project_spec_documents` (title, version_label) — if activeSpecDocumentId set. 4. `buildComplianceBlocks()` — queries spec_comparison_runs, spec_comparison_results, project_spec_requirements, boq_items, products, product_attributes. |
| Calls | `generateBoqXlsx`, `generatePackagePdf`, `generateExportZip`, `persistArtifact` |
| Persists | Writes files to disk. Inserts rows into `export_package_artifacts`. |
| Output | `ArtifactOutput` = `{ artifact_type, artifact_path, artifact_url }` |

### Export route entry (review workflow)
| Item | Detail |
|---|---|
| File | `apps/api/src/routes/exports.ts` |
| Routes | `POST /projects/:projectId/exports` — triggers generation after readiness check. `GET /projects/:projectId/exports` — lists packages + artifacts for review. `GET /exports/:id` — single package with items, BOQ, artifacts. `GET /exports/:id/download` — streams primary XLSX. `GET /exports/:id/artifacts/:artifactId/download` — streams named artifact. |
| Generation flow | Calls `buildChecklistSnapshot()`, `buildBoqSnapshot()`, `getActiveSpecDocumentId()`, then inserts `export_packages` record, calls `buildAndInsertPackageItems()`, `buildAndInsertBoqItems()`, finally `generateArtifact(input)`. |
| Review data | `GET /exports/:id` reads live from `export_package_items`, `export_package_boq_items`, `export_package_artifacts`. These are immutable snapshots captured at generation time. |

### Snapshot builders
| Function | File | DB reads | DB writes |
|---|---|---|---|
| `buildChecklistSnapshot` | `services/export-snapshot.ts` | `projects`, `consultant_templates`, `consultant_template_sections`, `project_files`, `checklist_items` | `checklist_items` (upsert) |
| `buildBoqSnapshot` | `services/export-snapshot.ts` | `boq_items` | — |
| `buildAndInsertPackageItems` | `services/export-snapshot.ts` | `project_files`, `consultant_template_sections`, `files`, `categories`, `document_types` | `export_package_items` |
| `buildAndInsertBoqItems` | `services/export-snapshot.ts` | `boq_items` | `export_package_boq_items` |
| `getActiveSpecDocumentId` | `services/export-snapshot.ts` | `project_spec_documents` | — |
| `buildComplianceBlocks` | `services/compliance-statement.ts` | `boq_items`, `products`, `spec_comparison_runs`, `spec_comparison_results`, `project_spec_requirements`, `product_attributes` | — |

---

## Workspace memory

| Feature | Where |
|---|---|
| `is_preferred` flag | `products.is_preferred` (boolean, org-wide). Set via `PATCH /products/:id` → `apps/api/src/routes/products.ts`. Provides +0.15 score boost in `suggestCandidates()`. |
| `is_do_not_use` flag | `products.is_do_not_use` (boolean, org-wide). Set via same PATCH. Product is excluded entirely from candidate suggestions. |
| `workspace_note` | `products.workspace_note` (free text). Set via same PATCH. Displayed in product UI; not read by matching. |

---

## Candidate boosting / exclusion controls

| Item | File | Logic |
|---|---|---|
| `suggestCandidates()` | `apps/api/src/lib/boq/candidate-service.ts` | Loads all org products. Applies `scoreProduct()` from `match-scorer.ts`. Excludes `is_do_not_use`. Adds `PREFERRED_BOOST = 0.15` to `match_score` for `is_preferred`. Applies `MINIMUM_SCORE_THRESHOLD = 0.10` floor. Sorts by score then current-project-first then preferred then fewer deviations. |
| `scoreProduct()` | `apps/api/src/lib/boq/match-scorer.ts` | Weighted composite score over spec requirements. Uses `compareProductToSpec()` from `lib/spec/comparator.ts`. Numeric closeness bonus. Per-attribute weights in `ATTRIBUTE_WEIGHTS` constant. |

---

## Preferred / do-not-use overrides

`PATCH /products/:id` accepts `is_preferred`, `is_do_not_use`, `workspace_note` in body. Route: `apps/api/src/routes/products.ts`. No separate audit event is fired.

---

## Audit log for memory-state changes

**Not implemented.** No audit table, no log entries, no event trail for changes to `is_preferred`, `is_do_not_use`, or `workspace_note`. When a product's memory flags change, there is no record of who changed them, when, or what the previous value was.

→ **Needs human decision:** define the audit schema and log retention policy before implementing.

---

## Canonical product deduplication

**Not implemented.** No deduplication logic exists. Multiple products with the same manufacturer + model number can exist in the same org workspace. `is_preferred` / `is_do_not_use` must be set per-row; there is no canonical identity concept.

→ **Needs human decision:** define the dedup key (manufacturer + model_number? + category?), the merge policy, and how memory flags propagate on merge.

---

## Matching and compliance engines (not in Phase 0 scope)

| Engine | File | Note |
|---|---|---|
| Spec comparator | `lib/spec/comparator.ts` | Reads product attributes vs spec requirements. Pure function over in-memory data. |
| Attribute normaliser | `lib/spec/normalize.ts` | Unit extraction, IP/IK numeric coercion. Pure. |
| Version diff | `lib/spec/diff.ts` | Compares two requirement sets. Pure. |
| BOQ match scorer | `lib/boq/match-scorer.ts` | Weighted composite score. Pure. |
| Spec extractor (stub) | `lib/spec/extractor.ts` + `lib/spec/claude-extractor.ts` (on feature/spec-extraction) | Extracts requirements from a spec PDF. |
| Product attribute extractor | `lib/extraction/` | Extracts attributes from a datasheet PDF. |
