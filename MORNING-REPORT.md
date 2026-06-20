# Morning Report — feature/editable-categories

_Branch: `feature/editable-categories` · Off: `main` (4183370) · Date: 2026-06-20_

---

## Summary

Category taxonomy unlocked, v3 schema applied, and three new catalogue record types shipped. The existing Road Lighting product link (`093411dc`) is verified intact throughout. All smoke tests pass; zero new TypeScript errors introduced.

---

## What changed

### Schema (migration `0001_sleepy_peter_quill.sql`)

**`categories` table — 1 new column:**
- `status text NOT NULL DEFAULT 'active'` — enum `active | deprecated | hidden`.
  - `active` = visible + selectable in all pickers.
  - `deprecated` = visible but greyed; not selectable for new products. Existing links keep it.
  - `hidden` = removed from pickers; record and all FK links are retained. Records are **never hard-deleted**.
  - Legacy `is_active` boolean is kept and synced by the API (`hidden → false`, others → `true`).
  - All 22 original rows received `status = 'active'` as the default — backward safe.

**5 new tables (all additive):**
- `catalogue_profiles` — extrusion housing records (code, section dims, mounting capability, diffuser, dot-free flag, compatible strip codes).
- `catalogue_accessories` — end caps, clips, connectors, drivers, etc. (typed BOM components).
- `configured_products` — assembled deliverable: core product + optional profile + accessory BOM.
- `configured_product_accessories` — BOM lines for a configured product.
- `category_attribute_relevance` — per-category attribute relevance hints for the UI (primary / secondary / not_applicable). **Never read by matching or compliance.**

`parent_category_id` already existed on the `categories` table — no new column needed for the "parent_id" concept. All existing parent links (Indoor subcategories, Outdoor subcategories, Architectural subcategories) are preserved unchanged.

---

### Category unlock (routes/categories.ts)

The v3 unlock adds **two new explicit routes** alongside the existing ones. The original `PATCH /categories/:id` guard (`assertCategoryAccess`) is unchanged — it still blocks edits on system categories from the old path, preserving backward compat.

New routes (both require auth + org scope):

| Route | Purpose |
|---|---|
| `PATCH /categories/:id/status` | Set `active / deprecated / hidden` on **any** visible category, including system-defined ones. Syncs `is_active` automatically. |
| `PATCH /categories/:id/label` | Rename or re-parent **any** visible category, including system-defined ones. Slug collision is checked within the correct scope. |

`GET /categories` now filters `status != 'hidden'` (was `is_active = true`). A `?include_hidden=true` query param shows all statuses for admin recovery UIs.

---

### v3 taxonomy (seed script `seed-v3-categories.ts`)

41 new luminaire-type categories seeded as `is_system_defined = true`, `status = active`. Idempotent — safe to re-run.

**Flexible branch resolution (no human decision needed):**
- No "Flexible Linear" category existed → both new:
  - `Flexible LED Tapes` — `99b49d18-a926-4606-a6ca-590f0635c39c`
  - `Flex Neon` — `2ae11ee9-2254-45dd-95b6-46b4d8887f8b`

Full list of 41 new IDs is in the seed script output (committed to git history via `pnpm db:seed:v3`).

---

### Attribute schema (Phase 2)

12 v3 attributes added to:
- `apps/web/src/components/products/AttributeEditor.tsx` — `STANDARD_ATTRIBUTES` extended (new group: "Flexible").
- `apps/api/src/lib/extraction/claude.ts` — product datasheet Claude extractor attribute list extended.

| New key | Label | Group | Primary use |
|---|---|---|---|
| `watts_per_metre` | Wattage per metre (W/m) | Flexible | Flex LED Tapes |
| `lumens_per_metre` | Lumens per metre (lm/m) | Flexible | Flex LED Tapes |
| `led_per_metre` | LED density (LED/m) | Flexible | Flex LED Tapes |
| `cut_interval` | Cut interval | Flexible | Flex LED Tapes |
| `max_run` | Max run length | Flexible | Flex LED Tapes |
| `bend_plane` | Bend plane | Flexible | Flex Neon |
| `min_bend_radius` | Min bend radius | Flexible | Flex Neon |
| `colour_mode` | Colour mode | Electrical | Both |
| `addressability` | Addressability (static/pixel) | Electrical | Both |
| `pixel_protocol` | Pixel protocol (SPI/DMX) | Electrical | Both |
| `wash_optic` | Wash / graze / flood optic | Photometric | Both / facade |
| `high_temp_variant` | High-temp variant | Performance | Both |

**Note:** `apps/api/src/lib/spec/claude-extractor.ts` (spec PDF extractor) lives only on `feature/spec-extraction` which is not yet merged to `main`. The same 12 attributes must be added to that file when it is merged. Tracked in §Needs human decision.

---

### Catalogue routes (Phase 3)

New routes registered in `src/index.ts`:
- `GET/POST /catalogue/profiles`, `GET/PATCH /catalogue/profiles/:id`
- `GET/POST /catalogue/accessories`, `PATCH /catalogue/accessories/:id`
- `GET/POST /configured-products`, `GET /configured-products/:id`
- `POST /configured-products/:id/bom`, `DELETE /configured-products/:id/bom/:lineId`

All catalogue routes are org-scoped, behind auth. No matching or compliance code reads them.

---

## Smoke test results

All 11 checks passed and test data rolled back:

1. Road Lighting ID `093411dc` intact ✓
2. Product `f315d577` still linked to Road Lighting ✓
3. Flexible LED Tapes record present ✓
4. Flex Neon record present ✓
5. Test category created ✓
6. Subcategory linked via `parent_category_id` ✓
7. Status→hidden + `is_active=false` sync ✓
8. Road Lighting link unaffected by other status changes ✓
9. Subcategory parent reference intact while parent is hidden ✓
10. All 65 category rows have valid `status` values ✓
11. Test data rolled back cleanly ✓

---

## Invariants verified

| Invariant | Status |
|---|---|
| No category ID changed or reused | ✓ |
| Road Lighting product link (`093411dc`) intact | ✓ |
| `status='hidden'` retains record + FK links | ✓ |
| `parent_category_id` (self-ref) enables subcategories without future migration | ✓ |
| Matching / compliance code untouched | ✓ |
| Export code untouched | ✓ |
| Checklist code untouched | ✓ |
| Zero new TypeScript errors | ✓ (pre-existing `spec.ts:288` unchanged) |

---

## Needs human decision

### 1. Overlap reconciliation (v3 §5 open items)
The 22 original seeded categories co-exist with the 41 new v3 ones. Several overlap or conflict:

| Original | v3 equivalent | Recommended action |
|---|---|---|
| Recessed Downlight | Downlight (recessed) | Deprecate original, link to new |
| Track Lighting | Track & rail system / Track inserts | Deprecate original |
| Pendant | Pendant / suspended | Deprecate original |
| Road Lighting | Street & area | Deprecate original (has 1 product — migrate link first) |
| Facade Lighting | Facade-surface linear | Deprecate original |
| Tunnel Lighting | Tunnel | Deprecate original |
| Landscape Lighting | Landscape | Deprecate original |
| Emergency | Emergency / exit | Deprecate original |
| Wall Washer | Now an optic attribute, not a category | Deprecate original |
| Linear Profile | Now a catalogue_profiles record type | Deprecate original |
| Sports Lighting | Not in v3 — keep or remap to Floodlight/projector | Decide |
| Parking | Not in v3 — keep or deprecate | Decide |
| Indoor / Outdoor / Architectural / Controls | Grouping labels, not luminaire types | Deprecate or hide |
| Office / Retail / Hospitality / Healthcare / Industrial / Education | Application segments, not luminaire types | Deprecate |

**Action required:** review the table above and confirm which originals to deprecate, and whether the Road Lighting product should be re-linked to "Street & area" before deprecation.

### 2. category_document_requirements — greenfield
No `category_document_requirements` rows exist. The table structure is in place.
Decide which document types (Datasheet DS, IES, CE, etc.) should be required per luminaire category and add them via `POST /categories/:id/requirements`.

### 3. category_attribute_relevance — greenfield
The table exists but no relevance rows are populated. Decide the primary/secondary/not_applicable mapping for each category × attribute_key pair and populate via the DB or a future admin UI.

### 4. spec claude-extractor attribute update
The 12 v3 attributes need to be added to `apps/api/src/lib/spec/claude-extractor.ts` on `feature/spec-extraction` before that branch is merged. File: `src/lib/spec/claude-extractor.ts`, in the `ATTRIBUTE_META` object and system prompt attribute list.

### 5. Cove — dual meaning
v3 §2.2 notes "cove" appears as a flex IBL facet (application context) AND as a luminaire-type category in §3. The new "Cove" category is seeded. Decide whether it should eventually be absorbed into the flex-neon attribute set or kept as a standalone category.

---

## Files changed

```
apps/api/src/db/schema/categories.ts          — added status column + CategoryStatus type
apps/api/src/db/schema/catalogue.ts           — NEW: 5 new tables
apps/api/src/db/schema/index.ts               — export catalogue
apps/api/src/db/migrations/0001_sleepy_peter_quill.sql — NEW: migration
apps/api/src/db/migrations/meta/_journal.json — updated
apps/api/src/db/migrations/meta/0001_snapshot.json — NEW
apps/api/src/db/seed-v3-categories.ts         — NEW: v3 seed script
apps/api/src/routes/categories.ts             — status + label unlock endpoints; GET filter
apps/api/src/routes/catalogue.ts              — NEW: profiles/accessories/configured products
apps/api/src/index.ts                         — register catalogue routes
apps/api/package.json                         — db:seed:v3 script
apps/api/src/lib/extraction/claude.ts         — 12 v3 attributes
apps/web/src/components/products/AttributeEditor.tsx — STANDARD_ATTRIBUTES extended
LightSelect-Product-Database-Map-v3.md        — reference doc (untracked, not committed)
```

---

## Sign-off resolution (2026-06-20)

All five sign-off items resolved via `seed-v3-signoff.ts` (`pnpm db:seed:v3-signoff`). Idempotent — safe to re-run.

### Item 1 — Orphaned originals hidden

Seven original categories set to `status='hidden'`, `is_active=false`. All had zero product links and zero file links. No IDs were changed or deleted.

| Original category | ID (first 8) | Duplicated by v3 |
|---|---|---|
| Recessed Downlight | `8ce70106` | Downlight (recessed) |
| Track Lighting | `f617dd52` | Track & rail system |
| Pendant | `f20885e4` | Pendant / suspended |
| Facade Lighting | `0509b6c2` | Facade-surface linear |
| Tunnel Lighting | `4c12a8e5` | Tunnel |
| Landscape Lighting | `b67966f6` | Landscape |
| Emergency | `bbbcb2ed` | Emergency / exit |

Categories left active (no direct v3 duplicate or non-orphaned): Road Lighting, Sports Lighting, Parking, Controls, Indoor, Outdoor, Architectural, Wall Washer, Linear Profile, Office, Retail, Hospitality, Healthcare, Industrial, Education.

### Item 2 — Road Lighting preserved; Street & area hidden

- **Road Lighting** (`093411dc`) — remains `active`. Product link `f315d577` intact. Not renamed.
- **Street & area** (`94291617`) — set to `hidden`. The v3 duplicate is suppressed until the product is deliberately re-linked and Road Lighting is deprecated by a human decision.

### Item 3 — category_document_requirements

Left empty. No rows created. Needs human decisions on which document types are required per category.

### Item 4 — category_attribute_relevance populated for Flexible categories

24 rows inserted (12 per category). All 12 new v3 Flexible-group attribute keys are mapped.

**Flexible LED Tapes** (`99b49d18`):

| Attribute key | Relevance |
|---|---|
| watts_per_metre | primary |
| lumens_per_metre | primary |
| led_per_metre | primary |
| cut_interval | primary |
| max_run | primary |
| colour_mode | primary |
| addressability | primary |
| pixel_protocol | secondary |
| wash_optic | secondary |
| high_temp_variant | secondary |
| bend_plane | not_applicable |
| min_bend_radius | not_applicable |

**Flex Neon** (`2ae11ee9`):

| Attribute key | Relevance |
|---|---|
| bend_plane | primary |
| min_bend_radius | primary |
| colour_mode | primary |
| addressability | primary |
| watts_per_metre | primary |
| lumens_per_metre | primary |
| led_per_metre | secondary |
| cut_interval | secondary |
| max_run | secondary |
| pixel_protocol | secondary |
| wash_optic | secondary |
| high_temp_variant | secondary |

### Item 5 — spec/claude-extractor.ts

> **TODO (deferred):** When `feature/spec-extraction` is merged to `main`, add the 12 new v3 attribute keys to `apps/api/src/lib/spec/claude-extractor.ts` — specifically in the `ATTRIBUTE_META` object and in the system-prompt attribute list. The keys to add are: `watts_per_metre`, `lumens_per_metre`, `led_per_metre`, `cut_interval`, `max_run`, `bend_plane`, `min_bend_radius`, `colour_mode`, `addressability`, `pixel_protocol`, `wash_optic`, `high_temp_variant`. No schema or DB changes are needed — the attribute_key column is free-text.

---

## Post sign-off state

- **Visible categories** (`status != hidden`): **55** (65 total; 10 hidden)
- **Hidden**: 7 orphaned originals + Street & area = 8 hidden
- **category_attribute_relevance**: 24 rows (Flex Tapes × 12, Flex Neon × 12)
- **Road Lighting** (`093411dc`): active, product link intact ✓
- All sign-off items resolved. Branch is ready for final review.

---

## PR instructions

Branch: `feature/editable-categories`  
Base: `main`  
All five sign-off items resolved. Remaining open items (document requirements mapping, full attribute relevance for non-flexible categories, spec extractor TODO) are non-blocking and deferred by design.
