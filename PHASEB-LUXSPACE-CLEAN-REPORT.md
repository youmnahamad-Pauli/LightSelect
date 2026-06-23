# Phase B LuxSpace Clean Re-Ingest Report
## feature/phaseb-luxspace-clean

**Branch**: `feature/phaseb-luxspace-clean` (off main post-extractor-legend-fix merge)  
**Ingestion run**: 2026-06-23  
**Source**: `ingestion-input/luxspace-pro-dn5xx.pdf` (Signify LuxSpace Pro DN5XX, pp.120–124)  
**Filter**: `--filter DN589B` (23 article codes)  
**Org**: `e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e`  
**Prior state**: 23 stale DN589B products from broken phaseb run deleted via cleanup-dn589b.ts before this run.

---

## 1. Purpose

The original Phase B ingest (`feature/phaseb-luxspace`) was produced by a broken extractor: all 23 products received `cct` and `cri` as `legend_decoded` even though the 5-page slice contains no printed order-code legend. That data was deleted. This report documents the clean re-ingest with the corrected+guarded extractor.

---

## 2. Product Grain

**23 products ingested, all `merged_into_existing: false`.**

| Cut-out | Article codes | Example |
|---------|---------------|---------|
| D75 | 6 | DN589B LED10/930 P8PSU D75 MB G2 |
| D100 | 5 | DN589B LED10/940 P8PSU D100 WB G2 |
| D125 | 8 | DN589B LED11/840 PBPSU D125 WB G2 |
| D150 | 4 | DN589B LED12/840 PBPSU D150 WB G2 |

Article-code grain: each DN589B SKU is its own canonical product. All 23 have `review_status = needs_review`.  
Total attribute values written: 346 (~15 per product).

---

## 3. Sample Products — Full Attribute Detail

### DN589B LED10/940 P8PSU D75 MB G2

| Attribute | Value | Method | Conf | source_locator | needs_review |
|-----------|-------|--------|------|----------------|-------------|
| `certifications` | "CE, ENEC" | table_read | 0.95 | page 2, Technical Specifications table | — |
| `cri` | "90" | **inferred_flagged** | 0.45 | page 2, Technical Specifications table, row CRI | ⚠️ yes |
| `description` | "Signify Philips…" | table_read | 0.9 | page 2 | — |
| `dimming` | "Compatible" | table_read | 0.95 | page 2, Technical Specifications table, row Dimming | — |
| `family_name` | "LuxSpace Pro DN589B" | table_read | 0.95 | page 2 | — |
| `finish` | "White" | table_read | 0.9 | page 2 | — |
| `ik_rating` | "IK02" | table_read | 0.95 | page 2, Technical Specifications table, row IK | — |
| `ip_rating` | "IP44" | table_read | 0.95 | page 2, Technical Specifications table, row IP | — |
| `lifetime_hours` | "50000" | table_read | 0.95 | page 2, Technical Specifications table, row Lifetime (h) | — |
| `material` | "Polycarbonate" | table_read | 0.9 | page 2 | — |
| `model_number` | "DN589B LED10/940 P8PSU D75 MB G2" | table_read | 0.95 | page 5, Article Code table | — |
| `mounting` | "Recessed" | table_read | 0.95 | page 1 | — |
| `operating_temp` | "-20°C to +40°C" | table_read | 0.9 | page 2 | — |
| `series_cct_options` | "930, 940, 840, 830" | table_read | 0.9 | page 2 | — |
| `voltage` | "220-240V" | table_read | 0.95 | page 2, Technical Specifications table, row System voltage | — |
| `watts` | "8.5" | **inferred_flagged** | 0.40 | page 2, D75 Aluminium Faceting specification table, row 990 lm, column Power(w) | ⚠️ yes |
| `cct` | **ABSENT** | — | — | — | — |
| `lumens` | **ABSENT** | — | — | — | — |
| `efficacy` | **ABSENT** | — | — | — | — |
| `beam_angle` | **ABSENT** | — | — | — | — |

---

### DN589B LED10/940 P8PSU D100 WB G2

| Attribute | Value | Method | Conf | source_locator | needs_review |
|-----------|-------|--------|------|----------------|-------------|
| `cri` | "90" | **inferred_flagged** | 0.45 | page 2, Technical Specifications table, row CRI | ⚠️ yes |
| `cct` | **ABSENT** | — | — | — | — |
| `lumens` | **ABSENT** | — | — | — | — |
| `watts` | **ABSENT** | — | — | — | — |
| `efficacy` | **ABSENT** | — | — | — | — |
| `beam_angle` | **ABSENT** | — | — | — | — |
| *(14 other attrs)* | table_read | 0.90–0.95 | as above | as above | — |

---

### DN589B LED11/840 P8PSU D125 VWB-M G2

| Attribute | Value | Method | Conf | source_locator | needs_review |
|-----------|-------|--------|------|----------------|-------------|
| `cri` | "80" | **inferred_flagged** | 0.45 | page 2, Technical Specifications table, row CRI | ⚠️ yes |
| `cct` | **ABSENT** | — | — | — | — |
| `lumens` | **ABSENT** | — | — | — | — |
| `watts` | **ABSENT** | — | — | — | — |
| `efficacy` | **ABSENT** | — | — | — | — |
| `beam_angle` | **ABSENT** | — | — | — | — |
| *(14 other attrs)* | table_read | 0.90–0.95 | as above | as above | — |

---

### DN589B LED12/840 PBPSU D150 WB G2

| Attribute | Value | Method | Conf | source_locator | needs_review |
|-----------|-------|--------|------|----------------|-------------|
| `cri` | "80" | **inferred_flagged** | 0.45 | page 2, Technical Specifications table, row CRI | ⚠️ yes |
| `cct` | **ABSENT** | — | — | — | — |
| `lumens` | **ABSENT** | — | — | — | — |
| `watts` | **ABSENT** | — | — | — | — |
| `efficacy` | **ABSENT** | — | — | — | — |
| `beam_angle` | **ABSENT** | — | — | — | — |
| *(14 other attrs)* | table_read | 0.90–0.95 | as above | as above | — |

---

## 4. Provenance Verdict

| Check | Result |
|-------|--------|
| `legend_decoded` count (all 23 products) | **0 ✓** |
| `[registry-writer] legend_decoded guard` warnings | **0 ✓** |
| CCT across all 23 products | **ABSENT ✓** (correctly omitted — no printed legend in document) |
| CRI across all 23 products | **inferred_flagged ✓** (from shared spec table CRI row; value is the family-level floor, not per-SKU) |

The primary objective of the clean re-ingest is met: no `legend_decoded` attributes, CCT correctly absent, CRI correctly flagged for review. The extractor legend fix is working.

---

## 5. Performance Attribute Gap — Honest Assessment

**This is a regression in completeness relative to the original phaseb run.**

| Attribute | phaseb run (broken extractor) | clean run (corrected extractor) |
|-----------|-------------------------------|--------------------------------|
| `lumens` | `table_read` (all 23) | **ABSENT (all 23)** |
| `watts` | `table_read` (all 23) | **ABSENT (22/23), `inferred_flagged` (1)** |
| `efficacy` | `table_read` (all 23) | **ABSENT (all 23)** |
| `beam_angle` | `table_read` (all 23) | **ABSENT (all 23)** |

The LuxSpace DN5XX document has a three-table layout that requires multi-table cross-referencing:

1. **Shared specs table (p.2)**: IP, IK, lifetime, voltage, dimming, CRI — shared across all 23 article codes.
2. **Per-cut-out performance tables (pp.2–3)**: lumens, watts, efficacy, beam angle — one table per cut-out size (D75, D100, D125, D150), each with multiple lumen-package rows.
3. **Article code list (pp.4–5)**: individual SKUs, with cut-out size encoded in the model code (e.g. "D75 MB").

The corrected extractor correctly extracted the shared spec values as `table_read`. However, it failed to reliably link the per-cut-out performance rows to individual article codes:

- The model can find the D75 performance table, but cannot reliably determine which of the multiple lumen-package rows (e.g. 990 lm vs. 1050 lm at D75) corresponds to a specific article code like `LED10/940`.
- In the phaseb run, the model returned performance values as `table_read` but this confidence was likely not warranted — it was asserting a row binding that the three-table layout makes genuinely ambiguous.
- The single `watts: inferred_flagged` value for D75 MB shows the model found the table but correctly doubted the binding.

The clean run's omissions are **more honest** than the phaseb run's `table_read` performance values. The corrected extractor is not producing wrong provenance — it is producing correct provenance with a gap in completeness.

**This gap must be addressed in human review or by a targeted re-extraction pass with explicit row-binding instructions.**

---

## 6. Human Review Time Estimate

**~80–100 min for all 23 products.**

| Task | Products | Time |
|------|----------|------|
| Confirm or reject 23 × `cri inferred_flagged` values (look up in PDF shared spec table; confirm 90 for /9XX, 80 for /8XX) | 23 | ~15 min |
| Manually enter performance values (lumens, watts, efficacy, beam_angle) per article code, looking up from the 4 per-cut-out tables on pp.2–3 | 23 × 4 attrs = 92 values | ~50 min |
| CCT: cannot be confirmed from this document. Requires either: (a) a PDF slice that includes the Signify order-code legend page, or (b) manual entry from external documentation + mark as manually_confirmed, not legend_decoded | 23 | ~20 min |
| **Total** | | **~85 min** |

Note: CCT entry without a printed legend is not `legend_decoded`. If CCT is entered from Signify's published order-code convention documentation (external), the `resolution_method` should be recorded as `manually_confirmed` (or equivalent), not `legend_decoded`. This ensures the provenance distinction is preserved.

---

## 7. What the Clean Run Tells Us About the Extractor

The clean run isolates the corrected extractor's true behaviour on this document layout:

- **Shared spec table extraction**: reliable. All 23 products got identical `table_read` values for IP, IK, lifetime, dimming, voltage, etc. — correct.
- **CRI from family spec**: extracted as `inferred_flagged` at conf=0.45. Slightly conservative (the value IS in the shared spec table), but the flag is appropriate because the shared table gives a family range, not a per-SKU value.
- **Per-cut-out performance binding**: unreliable for this layout. The model cannot confidently bind row → article code without explicit disambiguation. A structured prompt change (e.g., "extract all cut-out performance tables, then for each article code, look up its cut-out size from the model code and record the matching row") would likely fix this.
- **CCT from order codes**: correctly omitted (no printed legend). This is the primary fix delivered by `feature/extractor-legend-fix`.

---

## 8. Files in This Branch

| File | Status |
|------|--------|
| `ingestion-input/INGESTION-REVIEW.md` | Updated by this ingest run |
| `PHASEB-LUXSPACE-CLEAN-REPORT.md` | This file |

**Not merged.** Awaiting human review and decision on performance attribute strategy before merge to main.
