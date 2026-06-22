# Spec Parser Review — LightSelect-Test-Schedule.md

**Parsed at:** 2026-06-22 06:51
**Source file:** `C:\Users\julia\lightselect\spec-input\LightSelect-Test-Schedule.md`
**Org ID:** `e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e`
**Items detected:** 4
**Items written:** 4
**LLM:** claude-sonnet-4-6 · in=2962 out=1916 (21183ms)

> All extracted values have provenance = **extracted** and require human review.
> Luminaire type classifications with confidence < 0.8 are flagged for review.
> Unknown attribute keys and low-confidence values are listed per item.

---

## LCL-001 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `17e18a07-564d-4dc7-ba68-06ac50edcf9d` |
| Luminaire type | `downlight` (conf=1.00) |
| Matchable attrs | 7 |
| Informational attrs | 3 |

### Matching Results (1 assessed, 0 pending, 0 disqualified, 28 excluded)

| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |
|------|---------|------|------|------|-----------|
| 1 | Signify — BRP 331 | 0.0% | 0.00 | Low | 3/2/0 |

---

## LCL-015 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `aacfb018-c941-4d86-af63-0b73a97b0efe` |
| Luminaire type | `flexible_tape` (conf=1.00) |
| Matchable attrs | 8 |
| Informational attrs | 0 |

### Matching Results (21 assessed, 0 pending, 0 disqualified, 8 excluded)

| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |
|------|---------|------|------|------|-----------|
| 1 | ILTI LUCE — 1-WKL-6023-0-00 | 69.7% | 0.50 | Med | 0/1/1 |
| 2 | ILTI LUCE — 1-WKL-3021-1-00 | 69.7% | 0.50 | Med | 0/1/1 |
| 3 | ILTI LUCE — 1-WKL-4501-0-00 | 69.0% | 0.50 | Med | 1/0/1 |
| 4 | ILTI LUCE — 1-WKL-4502-0-00 | 62.8% | 0.50 | Med | 1/0/1 |
| 5 | EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00 | 55.2% | 0.50 | Med | 1/1/1 |

---

## LCL-020 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `c3290a01-3507-4057-b499-97ae822a0c2c` |
| Luminaire type | `linear` (conf=0.90) |
| Matchable attrs | 6 |
| Informational attrs | 4 |

### Matching Results (0 assessed, 0 pending, 0 disqualified, 29 excluded)

_No assessed candidates ranked._

> ⚠️  No candidates of this luminaire_type in the product pool. Run catalogue ingestion first.

---

## LCL-030 — ✓ ok

| Field | Value |
|-------|-------|
| Requirement ID | `c632bcdb-400d-47a0-ba58-bb15c7900e6f` |
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
