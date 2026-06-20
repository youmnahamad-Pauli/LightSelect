# Phase 0 — Export Seam Report
_Branch: `feature/export-seam` · Off: `main` (4183370) · Date: 2026-06-20_

---

## Pre-flight

| Check | Result |
|---|---|
| `feature/compliance-statement` merged to main | ✓ (commit 4183370) |
| `main` working tree clean | ✓ (one untracked `LightSelect-Product-Database-Map-v3.md`) |
| API compiles | ✓ (pre-existing `spec.ts:288` error unchanged; zero new errors) |
| No DB schema changes in this phase | ✓ |
| No renderer logic changed | ✓ |

---

## 1. Module map summary

Full detail: `docs/module-map.md`.

### Export pipeline call graph

```
POST /projects/:projectId/exports  (routes/exports.ts)
  ├─ buildChecklistSnapshot()       → ChecklistSnapshot
  ├─ buildBoqSnapshot()             → BoqSnapshot
  ├─ getActiveSpecDocumentId()      → string | null
  ├─ INSERT export_packages
  ├─ buildAndInsertPackageItems()   → INSERT export_package_items
  ├─ buildAndInsertBoqItems()       → INSERT export_package_boq_items
  └─ generateArtifact(ArtifactInput)  (services/export-artifact.ts)
       ├─ [DB] projects + consultant_templates  → projectMeta + pdfBranding
       ├─ [DB] project_spec_documents           → activeSpec
       ├─ buildComplianceBlocks()               → LuminaireComplianceBlock[]
       ├─ generateBoqXlsx(...)
       │    ├─ [DB] export_package_boq_items    → boqRows
       │    └─ [DB] export_package_items        → sectionItems
       ├─ generatePackagePdf(...)
       │    ├─ [DB] export_package_items        → sectionItems
       │    └─ [DB] export_package_boq_items    → boqRows
       └─ generateExportZip(...)                (no DB)
```

### Features not yet implemented

| Feature | Status |
|---|---|
| Audit log for memory-state changes (`is_preferred`, `is_do_not_use`) | **Not implemented** |
| Canonical product deduplication | **Not implemented** |

See `docs/module-map.md` §Audit log and §Canonical product deduplication for decision items.

---

## 2. ExportSource interface

The seam consolidates all data the renderers need into one typed record.
Full definition: `apps/api/src/services/export-source.ts`.

```typescript
interface ExportSource {
  // Identity
  exportPackageId: string;
  projectId:       string;
  orgId:           string;

  // Project context (resolved from DB by LegacyExportSource)
  projectMeta: {
    project_name:   string;
    client_name:    string | null;
    project_code:   string | null;
    revision_label: string | null;
  };
  pdfBranding: PdfBranding;

  // Spec context
  activeSpecDocumentId: string | null;
  activeSpec: { title: string; version_label: string } | null;

  // Pre-computed snapshots (from ArtifactInput; stored on export_packages)
  checklistSnapshot: ChecklistSnapshot;
  boqSnapshot:       BoqSnapshot;

  // Compliance blocks (computed at generation time)
  complianceBlocks: LuminaireComplianceBlock[] | null;

  // Package snapshot rows (formerly queried internally by renderers)
  packageBoqItems:    ExportPackageBoqItem[];
  packageSectionItems: ExportPackageItem[];
}
```

### What changed and what stayed the same

| Concern | Before | After |
|---|---|---|
| External API | `generateArtifact(ArtifactInput)` | Unchanged — same signature |
| DB queries in renderers | `generateBoqXlsx` queried `export_package_boq_items` + `export_package_items`; `generatePackagePdf` queried the same two tables | Queries moved to `LegacyExportSource.resolve()`; renderers receive rows as params |
| DB queries in coordinator | `generateArtifact()` fetched project meta, branding, active spec, compliance blocks | Same queries now in `LegacyExportSource.resolve()` |
| Rendering logic | Unchanged | Unchanged |
| Output | Unchanged | Unchanged |
| Route | Unchanged | Unchanged |

### Files changed

| File | Change |
|---|---|
| `apps/api/src/services/export-source.ts` | **New.** `ExportSource` interface + `LegacyExportSource` class. |
| `apps/api/src/services/export-artifact.ts` | `generateArtifact()` → wrapper calling `LegacyExportSource.resolve()` then `generateArtifactFromSource()`. `generateBoqXlsx()` made public and pure (rows as params). `ArtifactInput` re-exported from `export-source.ts`. |
| `apps/api/src/services/export-pdf.ts` | `PdfGeneratorInput` adds `packageSectionItems` + `packageBoqItems`. Internal DB queries removed; renderer reads from input fields. |
| `docs/module-map.md` | **New.** Full feature map. |
| `apps/api/src/__tests__/export-golden.test.ts` | **New.** 13 golden-file and structural tests for both renderers. |

---

## 3. Golden-file test results

**35 / 35 tests pass** (`export-generators.test.ts`: 22; `export-golden.test.ts`: 13).

### export-golden.test.ts test inventory

```
generateBoqXlsx — pure renderer (no DB)
  ✓ returns a non-empty Buffer
  ✓ produces exactly 2 sheets when no compliance blocks
  ✓ produces 3 sheets when compliance blocks are present
  ✓ writes project name into the Summary sheet
  ✓ writes active spec into Summary sheet when provided
  ✓ writes BOQ rows into Sheet 1 when provided
  ✓ writes section composition into Summary sheet
  ✓ produces byte-identical output on two consecutive calls (determinism)

generatePackagePdf — pure renderer (no DB)
  ✓ returns a non-empty Buffer starting with %PDF magic
  ✓ produces a valid PDF of reasonable size (> 1 KB)
  ✓ PDF with BOQ rows is larger than PDF without (content scales with data)
  ✓ PDF with empty rows is smaller than PDF with rows

seam equivalence
  ✓ direct generateBoqXlsx matches ExportSource path structure
```

### Why no byte-level golden files for PDF?

PDFKit uses FlateDecode compression for content streams. Text content is
not readable in raw bytes, and minor implementation differences (e.g. xref
table offsets) cause byte variance even with a pinned clock. Structural
tests (magic bytes, size ordering, sheet count) are sufficient for Phase 0.

### Why no real-project exports?

The live DB has no export packages (verified during pre-flight: zero rows
in `export_packages`). Rather than inserting test data, tests call the pure
renderer functions directly with fixture data. This is a valid approach —
the seam makes this possible.

---

## 4. Needs human decision

### A. Audit log for memory-state changes
`is_preferred`, `is_do_not_use`, `workspace_note` on products can be changed via `PATCH /products/:id` with no record of who changed what or when. Before building workspace-memory features, define:
- Audit table schema (entity / old_value / new_value / user_id / timestamp)
- Retention policy
- Whether changes should trigger events (webhooks, checklist invalidation)

### B. Canonical product deduplication
Multiple product rows can share the same manufacturer + model number. No dedup key or merge policy exists. Before building a "product memory" feature, define:
- Dedup key (manufacturer + model_number + category? hash of normalised model code?)
- Merge policy (which row wins for `is_preferred` / `is_do_not_use` when deduping)
- How existing project links are preserved on merge

### C. ExportSource extensibility
The current `ExportSource` contains all data the renderers need for the
existing XLSX + PDF + ZIP output. Future renderers (e.g. a "Compliance
Statement PDF" or a "Spec Comparison Report") will need additional fields.
Decide whether to:
- Extend `ExportSource` with optional fields as renderers are added
- Or introduce typed sub-records per renderer (e.g. `ComplianceExportData`)

### D. Review workflow read path
`GET /exports/:id` and the download endpoints read directly from
`export_package_*` tables and the file system. They are not routed through
`ExportSource`. This is intentional for Phase 0 (read paths are already
immutable snapshot reads). If the decision engine needs to reconstruct or
reinterpret old exports, this path will need a separate seam.

---

## PR instructions

Branch: `feature/export-seam`  
Base: `main`  
Do NOT merge. All 35 tests pass; zero new TypeScript errors.
