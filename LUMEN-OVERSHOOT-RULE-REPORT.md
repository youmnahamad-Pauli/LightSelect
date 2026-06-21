# Lumen-Output Overshoot / Undershoot Rule — Implementation Report

**Branch:** `feature/lumen-overshoot-rule`  
**Base:** `origin/main` (post-PR #7 — per-SKU CCT/lm/m fix)  
**Date:** 2026-06-21  

---

## 1. Rule Summary

The previous symmetric ±10% match-target band treated a +11% overshoot (too bright) the same as a −11% undershoot (too dim). That was wrong: a product delivering more light than specified *may* be acceptable, depending on whether it is dimmable and whether its wattage stays within the electrical budget.

**New asymmetric rule — `match_target_lumen` operator:**

| Condition | Verdict |
|---|---|
| \|delta\| ≤ 2% | Comply (lumen-basis may downgrade to Comment if unconfirmed provenance) |
| Undershoot −2% to −10% | Comment |
| Undershoot > −10% | Deviation |
| Overshoot + watts over spec | Deviation (power budget exceeded — brightness not credible) |
| Overshoot + watts OK + dimmable | Comment up to +20%; beyond +20% → Deviation |
| Overshoot + watts OK + non-dimmable / unknown | Comment up to +10%; beyond +10% → Deviation |

**Evaluation order:** watts is evaluated **before** lumens in the scorer so the lumen rule can read the watts verdict.

**Dimmable attribute:** stored as `attribute_value = 'true'/'false'` in `product_attribute_values`. All 20 WKL ILTI strips set to `dimmable = 'true'` by this seed run.

---

## 2. Files Changed

| File | Change |
|---|---|
| `apps/api/src/lib/matching/config.ts` | Added `LUMEN_TIGHT_PCT`, `LUMEN_UNDERSHOOT_COMMENT_PCT`, `LUMEN_OVERSHOOT_COMMENT_PCT_DIMMABLE`, `LUMEN_OVERSHOOT_COMMENT_PCT_NONDIMMABLE` |
| `apps/api/src/db/schema/matching.ts` | Added `match_target_lumen` to `matchingOperators` |
| `apps/api/src/lib/matching/comparators.ts` | Added `compareMatchTargetLumen()` — asymmetric, dimmable-aware, returns `{ verdict, note }` |
| `apps/api/src/lib/matching/scorer.ts` | Import + WATT/LUMEN key sets; evaluation re-ordered (watts → other → lumens); `verdictCache` accumulates as attrs are scored; `match_target_lumen` case added |
| `apps/api/src/db/matching-seed.ts` | `lumens_per_metre` operator → `match_target_lumen`; dimmable=true upserted on all 20 WKL SKUs |
| `LightSelect-Matching-Rules-Spec.md` | Lumen output rows updated in Core and Flexible/tape tables |

---

## 3. Constants (all in `config.ts`)

```typescript
LUMEN_TIGHT_PCT: 2,                         // ±2% → comply
LUMEN_UNDERSHOOT_COMMENT_PCT: 10,           // −2% to −10% → comment; > −10% → deviation
LUMEN_OVERSHOOT_COMMENT_PCT_DIMMABLE: 20,  // overshoot up to +20% → comment (dimmable, watts OK)
LUMEN_OVERSHOOT_COMMENT_PCT_NONDIMMABLE: 10, // overshoot up to +10% → comment (non-dimmable / unknown)
```

---

## 4. BEFORE / AFTER Ranking

Full 18-product flexible-tape ranking for requirement:  
**"LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC [tuned]"**

| Rank (NEW) | SKU | CCT | lm/m | delta% | W/m | Dimmable | lm/m verdict (OLD) | lm/m verdict (NEW) | Fit% OLD | Fit% NEW | Δ Rank |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | 1-WKL-6023-0-00 | 3000K | 1850 | −7.5% | 14.4 | yes | comment | **comment** | 93.1% | 93.1% | — |
| **2** | 1-WKL-3021-1-00 | 3000K | 2224 | +11.2% | 14.5 | yes | **deviation** | **comment** | 76.9% | **93.1%** | **↑1** |
| **3** | 1-WKL-4501-0-00 | 3000K | 1770 | −11.5% | 15.0 | yes | deviation | **deviation** | 76.9% | 76.9% | ↓1 |
| 4 | 1-WKL-6022-0-00 | 2700K | 1800 | −10.0% | 14.4 | yes | comment | comment | 70.0% | 70.0% | — |
| 5 | 1-WKL-3020-1-00 | 2700K | 2064 | +3.2% | 14.5 | yes | comment | comment | 70.0% | 70.0% | — |
| 6 | 1-WKL-6024-0-00 | 4000K | 2000 | 0.0% | 14.4 | yes | comment† | comment† | 70.0% | 70.0% | — |
| 7 | 1-WKL-4502-0-00 | 4000K | 1905 | −4.75% | 15.0 | yes | comment | comment | 70.0% | 70.0% | — |
| **8** | **1-WKL-3022-1-00** | **4000K** | **2368** | **+18.4%** | **14.5** | **yes** | **deviation** | **comment** | **53.8%** | **70.0%** | **↑2** |
| 9 | 1-WKL-4500-0-00 | 2700K | 1590 | −20.5% | 15.0 | yes | deviation | deviation | 53.8% | 53.8% | ↓1 |
| 10 | 1-WKL-7102-0-00 | 3000K | 1400 | −30.0% | 15.0 | yes | deviation | deviation | 53.8% | 53.8% | ↓1 |
| 11 | 1-WKL-3010-1-00 | 3000K | 3091 | +54.6% | 19.2 | yes | deviation | deviation† | 38.5% | 38.5% | — |
| 12 | 1-WKL-3026-0-00 | 3000K | 3650 | +82.5% | 23.0 | yes | deviation | deviation‡ | 38.5% | 38.5% | — |
| 13 | 1-WKL-7101-0-00 | 2700K | 1300 | −35.0% | 15.0 | yes | deviation | deviation | 30.8% | 30.8% | — |
| 14 | 1-WKL-7103-0-00 | 4000K | 1550 | −22.5% | 15.0 | yes | deviation | deviation | 30.8% | 30.8% | — |
| 15 | 1-WKL-7100-0-00 | 6500K | 1200 | −40.0% | 15.0 | yes | deviation | deviation | 30.8% | 30.8% | — |
| 16 | 1-WKL-3025-0-00 | 2700K | 3400 | +70.0% | 23.0 | yes | deviation | deviation‡ | 15.4% | 15.4% | — |
| 17 | 1-WKL-3027-0-00 | 4000K | 4300 | +115.0% | 23.0 | yes | deviation | deviation‡ | 15.4% | 15.4% | — |
| 18 | 1-WKL-3011-1-00 | 3000K | 3264 | +63.2% | 19.2 | yes | deviation | deviation† | 15.4% | 15.4% | — |

† Overshoot beyond +20% dimmable limit → deviation (even though watts OK).  
‡ Watts over spec (23 W/m > 20 W/m limit) → deviation regardless of overshoot %.

**Summary of changes:**
- **3021 (3000K, +11.2%):** deviation → comment. Watts OK (14.5 W/m). Dimmable. +11.2% < +20% dimmable band. Fit: 76.9% → **93.1%**. Climbs to **rank 2**.
- **3022 (4000K, +18.4%):** deviation → comment. Watts OK (14.5 W/m). Dimmable. +18.4% < +20% dimmable band. Fit: 53.8% → **70.0%**. Climbs to **rank 8** (note: CCT still deviates on 4000K, so overall still a marginal candidate).
- **4501 (3000K, −11.5%):** unchanged deviation. −11.5% exceeds −10% undershoot limit. No dimmable exception on undershoot.
- **3026, 3025, 3027 (N24HF):** unchanged deviation. Watts over spec (23 W/m > 20 W/m) → lm/m deviation regardless of overshoot %, confirmed by new evidence note.

---

## 5. Evidence Notes (key SKUs)

```
1-WKL-3021-1-00  lumens_per_metre: 2224 — overshoot +11.2%; watts OK + dimmable → within +20% band
1-WKL-4501-0-00  lumens_per_metre: 1770 — undershoot 11.5% exceeds −10% limit
1-WKL-3022-1-00  lumens_per_metre: 2368 — overshoot +18.4%; watts OK + dimmable → within +20% band
1-WKL-3026-0-00  lumens_per_metre: 3650 — overshoot +82.5%; watts over spec → deviation
1-WKL-3010-1-00  lumens_per_metre: 3091 — overshoot +54.6% exceeds +20% limit (dimmable)
```

---

## 6. Design Decisions

- **No schema migration required.** `match_target_lumen` is a text-column operator, not a DB enum. Adding it to the TypeScript `matchingOperators` array is sufficient.
- **Evaluation ordering is in the scorer, not the DB.** `scoredAttrs` are re-sorted per-candidate evaluation: watts → other → lumens. The seed's insertion order is no longer the execution order for watts/lumens.
- **`verdictCache` is local to each `evaluateScoredAttributes` call** — no cross-candidate leakage.
- **Lumen-basis downgrade is preserved.** If `compareMatchTargetLumen` returns `comply` (tight ±2% band) and provenance is `extracted`, the existing lumen-basis block downgrades it to `comment`. The comparator returns an empty note for the comply case to let the downgrade note take precedence.
- **Undershoot has no dimmable exception.** A product that delivers less than target light output cannot compensate via dimming — you would only dim further down. The spec is firm: undershoot > −10% → deviation.

---

## 7. Ambiguities / Flags

None. The rule, thresholds, and attribute naming were all specified unambiguously. The only decision made independently was evaluation ordering (put watts first, then other scored attrs, then lumens), which is consistent with the stated dependency.
