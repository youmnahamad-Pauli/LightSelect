# Phase 1 — Canonical Product Registry Report
_Branch: `feature/canonical-registry` · Off: `main` (4183370) · Date: 2026-06-20_

---

## Pre-flight

| Check | Result |
|---|---|
| Working tree clean on main | ✓ (one untracked `LightSelect-Product-Database-Map-v3.md`) |
| API compiles | ✓ (pre-existing `spec.ts:288` unchanged; zero new errors) |
| No existing product tables modified | ✓ |
| Export tests (22/22) pass | ✓ |

---

## Step 0.5 — Build-vs-wrap findings

**Search target:** all TypeScript / SQL / Markdown files across all local branches and commits.

| Feature | Found? | Location | Decision |
|---|---|---|---|
| Audit log for memory-state changes | **Not found** | — | Build as LATER phase. Not implemented in Phase 1. |
| Canonical product deduplication | **Not found** | — | Built fresh in this phase (see §Tables added). |
| `is_preferred` / `is_do_not_use` | Found | `products.ts`, `candidate-service.ts`, `routes/products.ts` | Existing workspace flags — read-only in Phase 1. Registry does not touch them. |

No prior dedup work exists anywhere; this is a greenfield build.

---

## Tables added (migration `0001_lumpy_mockingbird.sql`)

Three additive tables. **No existing tables were modified.** No existing columns were changed. All existing read/write paths continue to work.

### `canonical_products`

One row per deduplicated product identity within an org.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK→organizations CASCADE | Org-scoped registry |
| `canonical_manufacturer` | text NOT NULL | Normalised: lowercase, non-alphanumeric stripped |
| `canonical_model_code` | text nullable | Normalised model/order code. Null for no-model-number products. |
| `dedup_key` | text nullable | `normalize(mfr)::normalize(model)`. Null when model is absent. |
| `display_name` | text NOT NULL | Human-readable, e.g. "Signify — BRP381 LED140/NW" |
| `category_id` | uuid FK→categories SET NULL | Optional luminaire category link |
| `review_status` | text | `auto_merged` \| `needs_review` \| `confirmed` |
| `review_notes` | text nullable | Why flagged or how created |
| `soft_match_hint` | text nullable | Fingerprint for no-model products (manufacturer + family + key attr values) |
| `created_at`, `updated_at` | timestamp tz | |

**Unique index:** `(org_id, dedup_key)` — Postgres enforces uniqueness only for non-null values, so multiple records with `dedup_key = null` (no-model-number products) are allowed.

### `canonical_product_sources`

Which existing `products` rows contributed to each canonical record. Immutable after backfill.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `canonical_product_id` | uuid FK→canonical_products CASCADE | |
| `source_product_id` | uuid FK→products SET NULL | SET NULL on product deletion (canonical record survives) |
| `merge_type` | text | `exact_key` \| `backfill_no_model` \| `manual` |
| `created_at` | timestamp tz | |

### `product_attribute_values`

Per-attribute values on a canonical product, with full provenance.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `canonical_product_id` | uuid FK→canonical_products CASCADE | |
| `attribute_key` | text NOT NULL | Maps to STANDARD_ATTRIBUTES keys |
| `attribute_value` | text nullable | The winning value after merge |
| `value_state` | text | `extracted` \| `confirmed` \| `not_applicable` |
| `source_product_id` | uuid FK→products SET NULL | Provenance |
| `confidence_score` | real nullable | 0.0–1.0 from extraction |
| `conflict_notes` | text nullable | Set when two sources disagreed; explains winner/loser |
| `created_at`, `updated_at` | timestamp tz | |

**Unique index:** `(canonical_product_id, attribute_key)` — one winning row per attribute.

---

## Dedup results

The live DB has **1 existing product** (created during a previous session):

| Metric | Count |
|---|---|
| Products read (read-only) | 1 |
| Skipped (no manufacturer AND no model_number) | 0 |
| Exact-key new canonical products | **1** |
| Exact-key merged (added to existing canonical) | 0 |
| No-model flagged for review | 0 |
| Attribute value rows created | 0 |
| Merge conflicts detected | 0 |

The one product (`Signify / BRP 331`, id `f315d577`) was mapped to canonical product `Signify — BRP 331` with `dedup_key = signify::brp331` and `review_status = auto_merged`.

It has zero attribute rows in `product_attributes` — so `product_attribute_values` is empty. This is correct: nothing to merge.

---

## Backfill summary

Script: `apps/api/src/db/registry-backfill.ts`  
Run: `pnpm --filter @lightselect/api registry:backfill`  
Idempotent: uses `onConflictDoNothing()` on source links; checks for existing canonical records before inserting.

### Merge policy implemented

```
confirmed (2) > extracted (1) > not_applicable (0)

Same value, different states → upgrade to higher state.
Different values:
  - Pick winner by state priority (existing wins on tie).
  - Store winning value in product_attribute_values.
  - Record loser in conflict_notes.
  - Set canonical_product.review_status = 'needs_review'.
confirmed values are NEVER overwritten by extracted ones.
```

### Dedup key construction

```typescript
normalize(s) = s.toLowerCase().replace(/[^a-z0-9]/g, '')
dedup_key    = normalize(manufacturer) + '::' + normalize(model_number)

Example: "Signify" + "BRP381 LED140/NW" → "signify::brp381led140nw"
```

Products without a model_number → `dedup_key = null`, `review_status = 'needs_review'`, `soft_match_hint = soft::mfr::family::cct:watts:lumens:ip`.

---

## Step 4 — Export parity

| Check | Result |
|---|---|
| Export tests (22/22) | ✓ pass |
| `generateArtifact(ArtifactInput)` signature | Unchanged |
| `export_packages`, `export_package_*` tables | Not touched |
| Rendering logic | Not touched |
| LegacyExportSource (on feature/export-seam) | Not on main; not relevant here |

Exports keep reading the existing `products` / `product_attributes` / `export_package_*` path. The canonical registry is parallel infrastructure.

---

## Needs human decision

### 1. Audit log for memory-state changes (deferred to later phase)
`is_preferred`, `is_do_not_use`, `workspace_note` changes have no audit trail. Schema for the audit table and its retention policy need to be decided before building. This is explicitly out of scope for Phase 1.

### 2. How the canonical registry should write back into matching/BOQ
Today `candidate-service.ts` reads from `products` directly. Once the canonical registry is populated and trusted, matching should read from `canonical_products` + `product_attribute_values` instead. This is a Phase 2 decision:
- When does a canonical record become "trusted enough" to use for matching?
- Does matching read `confirmed` values only, or also `extracted`?
- What's the migration path for the existing `boq_items.candidate_product_ids` JSONB column?

### 3. No-model-number product handling
There is currently 0 no-model-number products in the live DB (all 1 product has a model number). When real data is added without model numbers, the `needs_review` records will accumulate. Decide:
- What UI surface shows the human the `soft_match_hint` for manual merge decisions?
- What's the `confirmed` confirmation workflow?
- Can two `needs_review` records be manually merged into one `canonical_products` row?

### 4. dedup_key partial uniqueness (null behaviour)
The `UNIQUE INDEX ON (org_id, dedup_key)` allows multiple rows where `dedup_key IS NULL` (Postgres treats each NULL as distinct). This is intentional — no-model products get separate canonical records. If you later want to prevent the same manufacturer+family combination appearing twice with null model, a separate unique index on a soft_match_hint column would be needed.

### 5. Backfill idempotency on subsequent product additions
The backfill script processes all existing products on each run. For new products added after the initial backfill, a trigger or incremental sync mechanism will be needed. Options:
- Re-run the full backfill periodically (safe but slow at scale)
- Add a DB trigger on `products` INSERT/UPDATE
- Add a post-save hook in the products API route

---

## Files changed

```
apps/api/src/db/schema/registry.ts          — NEW: 3 table definitions + types
apps/api/src/db/schema/index.ts             — added export * from './registry'
apps/api/src/db/registry-backfill.ts        — NEW: backfill script + dedup logic
apps/api/src/db/migrations/0001_lumpy_mockingbird.sql  — NEW: migration
apps/api/src/db/migrations/meta/_journal.json           — updated
apps/api/src/db/migrations/meta/0001_snapshot.json      — NEW
apps/api/package.json                       — registry:backfill script added
PHASE1-REPORT.md                            — this file
```
