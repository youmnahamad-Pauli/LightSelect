# WORKFLOW — INCREMENT 4: Package Assembly — Implementation Report

**Branch:** `feature/workflow-package-assembly`
**Status:** Complete — verified, tests green, ready for review

---

## What Was Built

INCREMENT 4 assembles the resolved compliance statements and linked project documents into a single ordered submittal PDF package, with a companion ZIP for any non-PDF attachments.

**Output:**
- `merged.pdf` — index page + per-item compliance statement PDFs + uploaded project-document PDFs, in template sort order
- `companion.zip` — present only when non-PDF attachments (images, XLSX, DWG) are linked; these cannot be merged into the PDF and are listed in the index with a note
- `PackageManifest` — structured JSON describing every component, its status, and where it lives

---

## Key Decisions

### 1. Compliance statement renderer: pdfkit direct from spine (not XLSX→PDF)

The spec required per-item compliance statement PDFs to carry the same override/stub banners as the existing XLSX renderer. Two paths were considered:

| Path | Verdict |
|---|---|
| Convert existing XLSX to PDF via LibreOffice | Rejected — LibreOffice is not available in the deployment environment and would add a large, brittle native dependency |
| New `aecom-pdf` pdfkit renderer directly from the ComplianceStatement spine | **Chosen** — pure Node.js, no native dependencies, same data source and layout as the XLSX renderer |

The `aecom-pdf` template (`apps/api/src/lib/exports/templates/aecom-pdf.ts`) reproduces the three-section AECOM layout (Luminaire / Lamp / Control Gear) using pdfkit, with:
- **Override banner** (red, `⚠ OVERRIDE — proposed against engine assessment: <reason>`) when `is_override=true`
- **No-candidate banner** (grey, `NO COMPLIANT CANDIDATE IDENTIFIED`) when rendered via `resolveStub`
- Same attribute cascade as the XLSX renderer: `adjAttr → componentIdentity → productAttr → null`

The existing XLSX renderer is untouched. Both are available for standalone single-item download via `renderStatement(statement, 'aecom-xlsx' | 'aecom-pdf')`.

### 2. PDF merge: pdf-lib (pure JS)

`pdf-lib ^1.17.1` was added to `apps/api`. It merges native PDF buffers without spawning any subprocess. The index page (pdfkit) and all CS + uploaded PDFs are combined into a single PDF via `mergePdfs()`.

### 3. PDF + ZIP output model

- All PDF documents → merged into the single output PDF
- Non-PDF documents (images, XLSX, DWG) → companion ZIP via `archiver`; ZIP is `null` when all uploads are PDFs
- API returns `{ pdf_base64, pdf_filename, zip_base64, zip_filename }` for browser download

---

## Assembly Order

Assembly follows the submittal template's `sort_order`, then requirement creation order within per-item groups:

```
[#1] Index page (pdfkit cover + contents table)
[#2..N] Template items in sort_order:
  • project-scope: linked project_documents (PDFs merged; non-PDFs → ZIP)
  • per_item compliance_statement: pdfkit-rendered AECOM CS per requirement
  • per_item other: linked project_documents per requirement
```

Missing or incomplete components are **visible in the index** with a note (e.g., "optional — not provided", "required — not provided"). Nothing is silently dropped.

---

## Manifest Model

```typescript
interface PackageManifestItem {
  pdf_component_index?: number;   // position in merged PDF (1 = index page)
  template_item_id: string;
  sort_order: number;
  label: string;
  document_type: string;
  scope: 'project' | 'per_item';
  requirement_id?: string;
  requirement_name?: string;
  item_code?: string;
  status: 'present' | 'generated' | 'missing_overridden' | 'missing';
  filename?: string;
  mime_type?: string;
  in_pdf: boolean;
  in_zip: boolean;
  note?: string;
}

interface PackageManifest {
  project_id: string;
  template_id: string;
  template_name: string;
  generated_at: string;
  gate_state: 'ready' | 'override_applied' | 'blocked';
  items: PackageManifestItem[];
  pdf_component_count: number;
  zip_component_count: number;
}
```

`gate_state`:
- `ready` — completeness gate passed
- `override_applied` — gate failed but override logged; package generated with visible missing items
- `blocked` — gate failed, no override; endpoint returns 422

---

## New Files

| File | Purpose |
|---|---|
| `apps/api/src/lib/exports/templates/aecom-pdf.ts` | pdfkit compliance statement renderer (`aecom-pdf` key) |
| `apps/api/src/services/submittal-package.ts` | Package assembly service: manifest, assembly loop, PDF merge, ZIP |
| `WORKFLOW-INCREMENT-4-REPORT.md` | This document |

## Modified Files

| File | Change |
|---|---|
| `apps/api/src/lib/exports/templates/registry.ts` | Register `AecomPdfTemplate` |
| `apps/api/src/routes/submittal.ts` | Add `GET manifest` and `POST generate` endpoints |
| `apps/web/src/types/index.ts` | Add `PackageManifestItem`, `PackageManifest`, `PackageGenerateResult` types |
| `apps/web/src/lib/api-client.ts` | Add `submittalPackage.manifest()` and `submittalPackage.generate()` |
| `apps/web/src/app/(app)/projects/[id]/submittal/page.tsx` | Add manifest preview UI + generate button with override flow |
| `apps/api/package.json` | Add `pdf-lib ^1.17.1` |

---

## VERIFY Results

Test project: **Expo 2026** — 3 requirements (FLEX-TAPE, LCL-001, LCL-020), AECOM submittal template, 4 uploaded PDFs.

Test configuration:
- **FLEX-TAPE**: override selection (manually confirmed against engine)
- **LCL-001**: auto-selected rank-1 candidate (normal)
- **LCL-020**: no selection, no ranked candidate → stub

```
gate_state:           override_applied  ✓ (LCL-020 stub → gate fails → override applied)
pdf_component_count:  8                 ✓ (index + trade_licence + 3 CS + 3 datasheets)
zip_component_count:  0                 ✓ (all uploads are PDFs → no ZIP needed)
pdf header:           %PDF-1            ✓ valid merged PDF

INDEX (template order):
[#2]  present     PROJECT      Trade Licence / Company Registration
      missing     PROJECT      Company Profile  ← optional — not provided
[#3]  generated   FLEX-TAPE    AECOM Compliance Statement  ← override — proposed against engine assessment
[#4]  generated   LCL-001      AECOM Compliance Statement
[#5]  generated   LCL-020      AECOM Compliance Statement  ← no compliant candidate — stub sheet generated
[#6]  present     FLEX-TAPE    Technical Datasheet
[#7]  present     LCL-001      Technical Datasheet
[#8]  present     LCL-020      Technical Datasheet
      missing     FLEX-TAPE    Third-Party Test Certificate (IES/LM)  ← optional — not provided
      missing     LCL-001      Third-Party Test Certificate (IES/LM)  ← optional — not provided
      missing     LCL-020      Third-Party Test Certificate (IES/LM)  ← optional — not provided
```

**vitest:** 35/35 pass  
**tsc --noEmit:** clean

Note: ZIP path (non-PDF attachments) is code-complete but was not exercised in this verify run — the test project has no non-PDF uploads. The branch is in_zip logic correctly sets `in_zip: !isPdf` and calls `buildZipBuffer()`.

---

## Needs Human Decision

1. **Index PDF design** — The index page is a functional cover page (project name, template, date, gate status, full contents table). It is not styled to AECOM brand guidelines. If AECOM branding (logo, colour palette, typography) is required on the index, that work is separate.

2. **Non-PDF test coverage** — ZIP path is untested end-to-end. A test project with a non-PDF attachment (e.g., an IES file uploaded as a test certificate) is needed to confirm ZIP generation and download.

3. **Large PDF performance** — No stress testing was done. Projects with many schedule items will generate many CS PDFs. `pdf-lib` merge is synchronous-ish; for very large packages (50+ items), a streaming or queued approach may be needed.

4. **CS PDF fidelity** — The `aecom-pdf` renderer was built to match the AECOM XLSX layout. Visual sign-off from AECOM against a reference submittal is recommended before use in a real project.

5. **File storage path convention** — Uploaded files are stored at `process.cwd()/../project-documents/<orgId>/<projectId>/<filename>`. In the current dev setup `process.cwd()` is `apps/api`, making the root `apps/project-documents/`. This must be confirmed for the production deployment path.
