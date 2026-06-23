# Phase B — LuxSpace Pro Breadth Test
## Ingestion + Extraction Review Report

**Source PDF**: `ingestion-input/luxspace-pro-dn5xx.pdf` (5 pages, pp. 120–124 of Signify Specifiers Catalog 2026 v11)
**Filter**: `--filter DN589B` (representative model family across all cut-out sizes)
**Run**: `catalogue-ingest.ts`, claude-sonnet-4-6, 39,071 output tokens, 335 s
**Date**: 2026-06-23
**Branch**: `feature/phaseb-luxspace`

---

## 1. Product Count and Grain

| Metric | Value |
|---|---|
| Products written | 23 DN589B SKUs |
| Grain | One product per full article code (model number) |
| auto_merged | 22 |
| needs_review | 1 (DN589B LED11/840 PBPSU D125 WB G2) |
| Attributes written | 443 total, ~19–21 per product |

The extractor correctly chose **article-code grain** — each distinct full model code (e.g., `DN589B LED10/940 P8PSU D75 MB G2`) becomes one product, not a family-level record. The DN589B filter covers cut-outs D75, D100, D125, and D150 with multiple beam and driver variants per size.

The unfiltered DN5XX family would exceed the 64k output token budget (see §6).

---

## 2. Three-Table Layout Analysis

The 5-page slice has three distinct information structures:

| Table | Pages | Content | Extractor verdict |
|---|---|---|---|
| **Shared Technical Specifications** | p.2 | IP/IK ratings, certifications, voltage, dimming, operating temp, lifetime, housing material/color, mounting, application, family CCT range | ✓ Correctly applied to all products |
| **Per-cut-out Performance Rows** | pp.2–3 | Lumens, watts, efficacy, beam angle — each cut-out (D75/D100/D125/D150) has its own block | ✓ Correctly linked to the right cut-out group |
| **Article Code Product List** | pp.4–5 | Individual order codes across all cut-outs | ✓ Used as the source of model_number and product grain |

The extractor correctly triangulated all three tables. Performance data (flux, power, efficacy, beam) came from the right cut-out block for each article code, and shared specs were not duplicated with per-SKU overrides.

### Where it struggled

- **PBPSU vs P8PSU rows for D125 WB**: The D125 page contains rows for multiple optic variants (Aluminium Faceting, Aluminium Matt, White Faceting, White Matt). The `PBPSU D125 WB G2` product mapped to "White Faceting/White Matt" rows but the flux figure in the source_locator ("900 lm") differs from the stored value ("870 lm"). The model encountered two candidate rows and stored the lower value at conf=0.5 with `needs_review`. `beam_angle` and `efficacy` were also dropped for this product.
- **UGR**: The shared spec table states "UGR 16 / UGR 19" as a family range. No per-cut-out UGR was extracted — correct behavior, since neither table ties a specific UGR value to a specific cut-out. A reviewer would need to confirm which UGR applies to which cut-out.

---

## 3. Sample Products — Full Attribute Detail

### A. DN589B LED10/940 P8PSU D75 MB G2 — `auto_merged`

| Attribute | Value | Method | Confidence | Source Locator |
|---|---|---|---|---|
| manufacturer | Philips | table_read | — | page 1, document header |
| family_name | LuxSpace Pro DN5XX G2 | table_read | 1.0 | page 1, document header |
| model_number | DN589B LED10/940 P8PSU D75 MB G2 | table_read | 1.0 | page 4, Product Information table, left column |
| application | Retail, Office, Airports, Hotels, Education, Healthcare | table_read | 1.0 | page 2, Primary Applications section |
| mounting | Recessed | table_read | 1.0 | page 2, Technical Specifications table |
| dimensions | Cut-out range Ø75-80mm | table_read | 1.0 | page 1, D75 Cut-out range label |
| material | Die-cast Aluminum | table_read | 1.0 | page 2, Technical Specifications table |
| finish | White | table_read | 1.0 | page 2, Technical Specifications table |
| **lumens** | **990** | table_read | 0.80 | page 2, D75 Aluminium Faceting table, Power 8.5W row |
| **watts** | **8.5** | table_read | 0.80 | page 2, D75 Aluminium Faceting table, Flux 990 lm row |
| **efficacy** | **117** | table_read | 0.80 | page 2, D75 Aluminium Faceting table, Power 8.5W row |
| **cct** | **4000** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '940' in 'LED10/940' |
| **cri** | **90** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '940': 9=CRI90, 40=4000K |
| **beam_angle** | **36°** | table_read | 0.80 | page 2, D75 Aluminium Faceting table, Power 8.5W row |
| ip_rating | IP20 (overall), IP65 (light-emitting surface) | table_read | 1.0 | page 2, Technical Specifications table |
| ik_rating | IK03 | table_read | 1.0 | page 2, Technical Specifications table |
| certifications | CCC / CB / CE / EMC | table_read | 1.0 | page 2, Technical Specifications table |
| voltage | 220–240 V | table_read | 1.0 | page 2, Technical Specifications table |
| dimming | Switch / 1-10V / DALI 2.0 / WIA | table_read | 1.0 | page 2, Technical Specifications table |
| operating_temp | -20°C to 40°C | table_read | 1.0 | page 2, Technical Specifications table |
| lifetime_hours | 75000 hrs @ L70B50; 50000 hrs @ L80B10 | table_read | 1.0 | page 2, Technical Specifications table |
| series_cct_options | 2700, 3000, 3500, 4000 | table_read | 1.0 | page 2, Technical Specifications table, row CCT |

---

### B. DN589B LED10/940 P8PSU D100 WB G2 — `auto_merged`

| Attribute | Value | Method | Confidence | Source Locator |
|---|---|---|---|---|
| model_number | DN589B LED10/940 P8PSU D100 WB G2 | table_read | 1.0 | page 4, Product Information table, right column |
| dimensions | Cut-out range Ø100-105mm | table_read | 1.0 | page 1, D100 Cut-out range label |
| **lumens** | **1070** | table_read | 0.80 | page 3, D100 Aluminium Faceted table, Power 8.4W row |
| **watts** | **8.4** | table_read | 0.80 | page 3, D100 Aluminium Faceted table, Flux 1070 lm row |
| **efficacy** | **128** | table_read | 0.80 | page 3, D100 Aluminium Faceted table, Power 8.4W row |
| **beam_angle** | **60°** | table_read | 0.80 | page 3, D100 Aluminium Faceted table, Power 8.4W row |
| **cct** | **4000** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '940' in 'LED10/940' |
| **cri** | **90** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '940': 9=CRI90, 40=4000K |
| *(shared specs: same as D75 above)* | | | | |

---

### C. DN589B LED11/840 P8PSU D125 VWB-M G2 — `auto_merged`

| Attribute | Value | Method | Confidence | Source Locator |
|---|---|---|---|---|
| model_number | DN589B LED11/840 P8PSU D125 VWB-M G2 | table_read | 1.0 | page 4, Product Information table, right column |
| dimensions | Cut-out range Ø125-130mm | table_read | 1.0 | page 1, D125 Cut-out range label |
| **lumens** | **870** | table_read | 0.75 | page 3, D125 Aluminium Faceting/Aliminium Matt table, Power 6.5W row |
| **watts** | **6.5** | table_read | 0.75 | page 3, D125 Aluminium Faceting/Aliminium Matt table, Flux 870 lm row |
| **beam_angle** | **60°** | table_read | 0.75 | page 3, D125 table, column Beam Angle |
| **cct** | **4000** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '840' in 'LED11/840' |
| **cri** | **80** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '840': 8=CRI80, 40=4000K |
| efficacy | — | *not extracted* | — | (column absent or unmatched) |
| *(shared specs: same as above)* | | | | |

---

### D. DN589B LED11/840 PBPSU D125 WB G2 — `needs_review` ⚠️

| Attribute | Value | Method | Confidence | Source Locator | Flag |
|---|---|---|---|---|---|
| model_number | DN589B LED11/840 PBPSU D125 WB G2 | table_read | 1.0 | page 4, Product Information table, right column | |
| **lumens** | **870** | table_read | **0.50** | page 3, D125 White Faceting/White Matt table, Power 6.5W, Luminous Flux 900 lm | ⚠️ conf=0.5; source_locator cites "900 lm" but stored value is 870 |
| **watts** | **6.5** | table_read | 0.75 | page 3, D125 White Faceting/White Matt table | |
| beam_angle | *absent* | — | — | — | ⚠️ Could not match row |
| efficacy | *absent* | — | — | — | ⚠️ Could not match row |
| **cct** | **4000** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '840' | |
| **cri** | **80** | **legend_decoded** ⚠️ | 0.85 | page 4, model code segment '840': 8=CRI80, 40=4000K | |
| *(shared specs: same as above)* | | | | | |

**Root cause of `needs_review`**: The D125 page contains multiple sub-tables for different optic/finish variants (Aluminium Faceting, Aluminium Matt, White Faceting, White Matt). The PBPSU WB model maps to the White Faceting/White Matt rows, but the model found two candidate flux figures (870 and 900 lm) in that sub-table and stored 870 at conf=0.5. The conflict triggered the `attributes_needing_review: 1` flag and `review_status: needs_review` on the canonical product.

The `beam_angle` and `efficacy` drop-off on this product (vs the P8PSU VWB-M above) suggests the model could not confidently bind the WB row when the flux figures were ambiguous.

---

## 4. Critical Finding: CCT and CRI Resolved via `legend_decoded` Without Printed Legend

**This is a policy violation of the hardened extractor rules.**

The CCT rule (step 2) permits `legend_decoded` only when: *"this catalogue prints an order-code legend or key AND that legend entry is visible in this document."*

The 5-page LuxSpace Pro slice does **not** print an explicit order-code legend. The document lists only the family CCT range ("2700K / 3000K / 3500K / 4000K") in the shared spec table. No table maps `/940 → 4000K` or `/840 → 4000K CRI80`. The model decoded CCT and CRI from its training knowledge of Signify model code conventions.

**Correct behavior (per rules):** Omit `cct` entirely and record only `series_cct_options` = "2700, 3000, 3500, 4000".

**Observed behavior:** CCT extracted as `legend_decoded` with conf=0.85 for all 23 products, citing the model code segment as the source.

Note: the model reasoned correctly about this in the failed run #3 — its prose output said *"catalogue does NOT print an explicit order-code legend... I must omit CCT per the rules"* — but the final successful (filtered) run did not follow this reasoning to the same conclusion. This inconsistency likely reflects that the shorter filtered output left more token budget for the model to include more attributes.

**Impact**: All 23 products currently carry CCT (and CRI) values that are not document-grounded. The CCT values are almost certainly correct (Signify codes are unambiguous), but they violate the provenance guarantee that `legend_decoded` implies a printable source.

**For human review**: Either:
1. Accept `legend_decoded` as close enough and confirm CCT/CRI on those 23 products, or
2. Delete CCT/CRI from all 23 records and re-run once the Signify full catalogue has its legend page included in the PDF slice.

---

## 5. Clean vs Flagged Attribute Summary

| Attribute | Method | Clean? | Notes |
|---|---|---|---|
| manufacturer | table_read | ✓ | |
| family_name | table_read | ✓ | |
| model_number | table_read | ✓ | |
| application | table_read | ✓ | |
| mounting | table_read | ✓ | |
| dimensions | table_read | ✓ | Cut-out size correctly differentiated |
| material, finish | table_read | ✓ | |
| ip_rating, ik_rating | table_read | ✓ | |
| certifications, voltage | table_read | ✓ | |
| dimming, operating_temp | table_read | ✓ | |
| lifetime_hours | table_read | ✓ | |
| series_cct_options | table_read | ✓ | Correctly kept as informational |
| lumens | table_read | ✓* | *conf=0.75–0.80; D125 WB: conf=0.50 (needs_review) |
| watts | table_read | ✓* | *same caveats |
| efficacy | table_read | ✓* | *missing on D125 products |
| beam_angle | table_read | ✓* | *missing on PBPSU D125 WB |
| **cct** | **legend_decoded** | **✗ policy violation** | **No legend printed in document** |
| **cri** | **legend_decoded** | **✗ policy violation** | **No legend printed in document** |
| UGR | *absent* | — | Correct: only family range in doc (16/19), not per-SKU |
| weight | *absent* | — | Not in document |

---

## 6. Token Budget Limitation

The full DN5XX family spans DN589B through DN595B, covering 100+ article codes across all cut-out sizes (D75–D200). With the grounded attribute schema (~20 attributes × ~30 tokens each per product), a full extraction runs to ~210,000 characters of JSON — well beyond the 64k output token ceiling.

Three pipeline fixes were made to `catalogue-llm.ts` during this test:

| Fix | Symptom | Change |
|---|---|---|
| Prose-stripping before JSON parse | `"Unexpected token 'I', 'I'll analy...'"` | Find first `{` and slice from there |
| max_tokens: 16000 → 64000 | JSON truncated at position 50,651 | Bumped token budget |
| Streaming (SDK requirement) | `"Streaming is required..."` | `client.messages.stream().finalMessage()` |

Even with `max_tokens: 64000`, the unfiltered DN5XX run truncated at position 210,831. The `--filter DN589B` workaround captured 23 representative SKUs across all cut-out groups for this breadth test.

**Production options for large families:**
- Chunked extraction by cut-out group (5 calls × ~20 products each)
- Two-pass: extract performance rows first, then link article codes
- Extended output API beta (100k+ tokens) when available

---

## 7. Human Review Effort Estimate

| Task | Effort |
|---|---|
| **CCT + CRI on all 23 products** | ~30 min — either confirm from training knowledge or pull from full catalogue legend page |
| **DN589B LED11/840 PBPSU D125 WB G2 `needs_review`** | ~5 min — open the PDF, find the correct D125 WB row, confirm lumens (870 or 900?), add beam_angle and efficacy |
| **UGR per cut-out** | ~15 min — map UGR 16/UGR 19 to the correct cut-out groups, add to each product |
| **Verify efficacy on D125 products** | ~5 min — confirm or add missing efficacy values |
| **Total for DN589B (23 products)** | ~55 min estimated |

If the CCT/CRI policy violation were fixed at extraction time (by including the Signify order-code legend page in the PDF slice), the human review estimate drops to ~25 min (UGR + D125 WB ambiguity only).

---

## 8. Pipeline Robustness Changes (Infrastructure Only)

These changes to `catalogue-llm.ts` are infrastructure fixes, not logic changes. They were needed to handle the LuxSpace Pro layout and token volume — they improve robustness for any catalogue.

1. **Prose-stripping**: complex multi-table layouts can cause the model to reason before emitting JSON; the parser now handles this.
2. **64k max_tokens**: 16k is insufficient for large catalogues with the grounded attribute schema.
3. **Streaming**: SDK requires streaming for `max_tokens > ~60000`; the call was switched to `client.messages.stream().finalMessage()`.

None of these changes touch extraction logic, attribute definitions, schema, matching, or scoring.
