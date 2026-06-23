# Hardening Pre-Capstone Report

**Branch:** `feature/hardening-pre-capstone`  
**Date:** 2026-06-23  
**Status:** All three items implemented, TypeScript clean, verified live.

---

## Item 1 — Placeholder Data Must Not Present as Real

**Problem:** The EXAMPLE Opal combo (`diffuser_transmission=0.80`, `transmission_provenance='estimated'`, `delivery_combos.notes='PLACEHOLDER — ...'`) ranked #1 for the flex-tape requirement. Its placeholder status was silently buried in a comment cell; no structured field existed to flag it programmatically.

**Changes made:**

| File | Change |
|---|---|
| `apps/api/src/lib/exports/types.ts` | Added `InformationalAttr`, `DataQuality` types; added `data_quality: DataQuality` to `ProposedProduct`; added `is_placeholder: boolean` and `informational_attrs: InformationalAttr[]` to `ComplianceStatement` |
| `apps/api/src/lib/exports/spine.ts` | Captures `comboTransmissionProvenance` and `comboNotes` from `delivery_combos` row in step 5; computes `isPlaceholder` (true when `transmission_provenance='estimated'` or notes start with "PLACEHOLDER"); sets `data_quality: 'estimated_placeholder'` on `ProposedProduct`; passes `is_placeholder` and `informational_attrs` through to `ComplianceStatement`; `resolveStub()` updated with `data_quality: 'uncharacterised'`, `is_placeholder: false` |
| `apps/api/src/lib/exports/templates/aecom-xlsx.ts` | Adds amber banner row (`PLACEHOLDER_BG='FFFFF3E0'`, `PLACEHOLDER_FG='FFE65100'`) when `statement.is_placeholder` — shown immediately after any override/no-candidate notice, before the spacer |
| `apps/api/src/routes/matching.ts` | Added `productDataQuality()` helper that looks up `transmission_provenance` attribute; all three return paths of `resolveSelectionState()` now include `data_quality` and `is_placeholder` fields |
| `apps/web/src/types/index.ts` | Added `data_quality` and `is_placeholder` to `SelectionState` interface |

**Verification — selection-state API (`GET /matching/requirements/:id/selection`):**
```json
{
  "mode": "override",
  "resolved_display_name": "EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00",
  "resolved_fit_score": 76.9231,
  "resolved_rank": 1,
  "resolved_status": "evaluated",
  "is_override": true,
  "data_quality": "estimated_placeholder",
  "is_placeholder": true
}
```

**Verification — AECOM XLSX (sheet FLEX-TAPE):**
```
Row 5: ⚠  OVERRIDE — proposed against engine assessment: assessment status: evaluated
Row 6: ⚠  DATA QUALITY — PLACEHOLDER PRODUCT: key transmission value estimated, not measured.
       Delivered lumen output is indicative only. Verify diffuser transmission from manufacturer
       characterisation before issue for construction.
```
Both banners render at the top of the sheet, immediately after the dark header band, before any data rows.

---

## Item 2 — Wire `informational_attrs` Into AECOM Export (S-6)

**Problem:** The spec parser writes `informational_attrs` (body_material, finish, dimensions, etc.) to `matching_requirements`, but the AECOM template never consumed them. The Specified column for Body Material, Body Colour, and Physical Dimensions rows was always blank (—) even when values were specified in the project specification.

**Changes made:**

| File | Change |
|---|---|
| `apps/api/src/lib/exports/templates/aecom-xlsx.ts` | Added `infoAttrKey?: string` to `RowSpec`; updated `LUMINAIRE_ROWS` with `infoAttrKey` for Body Material (`body_material`), IK Rating (`ik_rating`), Mounting Type (`mounting`), Reflector Material (`reflector_material`), Body Colour (`finish` — mapping spec's finish field to the Body Colour row per spec), Operating Temperature (`operating_temperature`), Physical Dimensions (`dimensions`), Accessories (`accessories`); in `renderSection()` builds an `infoAttrMap` from `statement.informational_attrs` and uses it as a fallback for the Specified column: `specifiedValue = adjAttr?.specified_value ?? infoAttr?.value ?? null`; informational-only rows produce no verdict (Comments column stays blank) |
| `apps/api/src/lib/exports/spine.ts` | Passes `req.informational_attrs` as `InformationalAttr[]` in both `resolve()` and `resolveStub()` |

**Verification — AECOM XLSX for LCL-020** (requirement has `informational_attrs: [{key:'body_material',value:'Anodized aluminium'},{key:'finish',value:'Silver anodized'},{key:'dimensions',value:'1200 mm length'}]`):

| Row | Label | Specified (literal cell value) |
|---|---|---|
| 17 | Body Material | `Anodized aluminium` |
| 18 | Reflector Material | `—` (no attr) |
| 19 | Body Colour | `Silver anodized` (from `finish` mapping) |
| 22 | Physical Dimensions | `1200 mm length` |

Comments / Compliance column for all informational rows: blank (no verdict fabricated).

---

## Item 3 — Document Download Endpoint (W1-4)

**Problem:** No download endpoint existed for project documents. Users could upload and delete files but could not retrieve them.

**Changes made:**

| File | Change |
|---|---|
| `apps/api/src/routes/project-documents.ts` | Added `GET /project-documents/:docId/download` to `projectDocumentRouter`; resolves absolute path via `path.join(process.cwd(), '..', doc.stored_path)`; streams file with correct `Content-Type`, `Content-Disposition: attachment; filename="..."`, `Content-Length`, `Cache-Control: private, no-cache` headers |
| `apps/web/src/lib/api-client.ts` | Added `download(token, docId, filename)` — fetches with Authorization header, creates Blob URL, triggers browser download, revokes URL |
| `apps/web/src/app/(app)/projects/[id]/documents/page.tsx` | Added `handleDownload()` function; added Download button (lucide `Download` icon) to each document row |

**Verification — `GET /project-documents/4a4c16ab.../download`:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="flex_tape_datasheet.pdf"; filename*=UTF-8''flex_tape_datasheet.pdf
Content-Length: 1356
Cache-Control: private, no-cache
```
Downloaded file: 1356 bytes — exact byte-for-byte match with stored file on disk. ✓

---

## TypeScript / Test Status

- `apps/api`: `tsc --noEmit` — **0 errors**
- `apps/web`: `tsc --noEmit` — **0 errors**
- Jest: 8 test suites fail with "must contain at least one test" — **pre-existing on main, unchanged by this hardening pass**

---

## Guardrails Compliance

- New branch `feature/hardening-pre-capstone` off main (`636793b`) — no commits to main, no merge
- Matching/scoring/gates/ingestion logic: **not touched**
- EXAMPLE Opal combo: **not deleted** — only surfaced its placeholder status
- Ranking of candidates: **unchanged**
- All changes are additive (new fields, new route, new banner, new Specified-column fallback)
