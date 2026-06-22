# Spec Parser Review — LightSelect-Test-Schedule.md

**Parsed at:** 2026-06-22 07:59
**Source file:** `C:\Users\julia\lightselect\spec-input\LightSelect-Test-Schedule.md`
**Org ID:** `e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e`
**Items detected:** 4
**Items written:** 4
**LLM:** claude-sonnet-4-6 · in=3057 out=1917 (18605ms)

> All extracted values have provenance = **extracted** and require human review.
> Luminaire type classifications with confidence < 0.8 are flagged for review.
> Unknown attribute keys and low-confidence values are listed per item.

---

## LCL-001 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `9e2c94ed-3999-46d1-a86a-10dfe5aa92ff` |
| Luminaire type | `downlight` (conf=1.00) |
| Matchable attrs | 8 |
| Informational attrs | 2 |

### Matching Results (1 assessed, 0 pending, 0 disqualified, 28 excluded)

| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |
|------|---------|------|------|------|-----------|
| 1 | Signify — BRP 331 | 0.0% | 0.00 | Low | 3/2/0 |

---

## LCL-015 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `003999ce-2c38-4932-bd87-85c129b0fc80` |
| Luminaire type | `flexible_tape` (conf=1.00) |
| Matchable attrs | 8 |
| Informational attrs | 0 |

### Matching Results (1 assessed, 20 pending, 0 disqualified, 8 excluded)

| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |
|------|---------|------|------|------|-----------|
| 1 | EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00 [COMBO] | 55.2% | 0.50 | Med | 1/1/1 |

**Pending characterisation (20):** ILTI LUCE — 1-WKL-4511-0-00, ILTI LUCE — 1-WKL-6024-0-00, ILTI LUCE — 1-WKL-3027-0-00, ILTI LUCE — 1-WKL-7101-0-00, ILTI LUCE — 1-WKL-6022-0-00, ILTI LUCE — 1-WKL-7102-0-00, ILTI LUCE — 1-WKL-7103-0-00, ILTI LUCE — 1-WKL-6023-0-00, ILTI LUCE — 1-WKL-4501-0-00, ILTI LUCE — 1-WKL-4502-0-00, ILTI LUCE — 1-WKL-7100-0-00, ILTI LUCE — 1-WKL-3021-1-00, ILTI LUCE — 1-WKL-3022-1-00, ILTI LUCE — 1-WKL-3026-0-00, ILTI LUCE — 1-WKL-3011-1-00, ILTI LUCE — 1-WKL-3020-1-00, ILTI LUCE — 1-WKL-3025-0-00, ILTI LUCE — 1-WKL-4500-0-00, ILTI LUCE — 1-WKL-3010-1-00, ILTI LUCE — 1-WKL-4510-0-00

---

## LCL-020 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `1d7beed4-fcf1-4453-a5d6-ae597225bab0` |
| Luminaire type | `linear` (conf=0.90) |
| Matchable attrs | 7 |
| Informational attrs | 3 |

### Matching Results (0 assessed, 0 pending, 0 disqualified, 29 excluded)

_No assessed candidates ranked._

> ⚠️  No candidates of this luminaire_type in the product pool. Run catalogue ingestion first.

---

## LCL-030 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `10faee2e-7d3c-4f8a-9dc2-2f08731f3ea5` |
| Luminaire type | `floodlight` (conf=1.00) |
| Matchable attrs | 8 |
| Informational attrs | 4 |

### Matching Results (0 assessed, 0 pending, 0 disqualified, 29 excluded)

_No assessed candidates ranked._

> ⚠️  No candidates of this luminaire_type in the product pool. Run catalogue ingestion first.

---

## Summary

- **4** requirement(s) written
- **0** need human review (type unclassified, unknown keys, or low confidence)

### Needs human decision

1. **Luminaire type classification**: Items with confidence < 0.8 must have their luminaire_type confirmed before matching is meaningful — the type scoping filter excludes wrong-type candidates entirely.
2. **Unknown attribute keys**: Keys returned by the LLM that are not in ATTR_CONFIG are discarded. Review whether they should be added to the locked config or treated as informational.
3. **Lumen basis**: All lumen targets are written with `notes: "lumen basis: delivered"`. Confirm the spec intends delivered output before running matching.
4. **Dimming as gate**: The current config does NOT add dimming as a gate requirement (it was captured as informational `control_type`). If dimming protocol is a hard gate for this project, add it manually to the requirement attrs.
