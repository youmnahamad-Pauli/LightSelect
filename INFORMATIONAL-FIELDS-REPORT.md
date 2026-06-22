# AECOM Informational Fields — Implementation Report

**Branch:** `feature/aecom-informational-fields`
**Date:** 22 Jun 2026

---

## What was wired

The AECOM compliance sheet's **Specified** column was previously blank (`—`) for informational rows (Body Material, Country of Origin, Physical Dimensions, etc.) even when the consultant spec explicitly stated those values. The spec parser already captures these as `informational_attrs` on `matching_requirements`; they just weren't passed to the template.

### Changes (3 files, additive only)

| File | Change |
|------|--------|
| `apps/api/src/lib/exports/types.ts` | Added `informational_attrs: Array<{key, label, value}>` to `ComplianceStatement` interface |
| `apps/api/src/lib/exports/spine.ts` | `MatchDecisionExportSource.resolve()` now reads `req.informational_attrs` (typed JSONB) and includes it in the returned statement. Empty array when requirement was not spec-parsed. |
| `apps/api/src/lib/exports/templates/aecom-xlsx.ts` | `renderSection()` builds a lookup map from `statement.informational_attrs` and uses it as a fallback for `specifiedValue` on rows where there is no adjudicated evidence (`adjAttr?.specified_value` is absent). |

### Lookup key mapping

For each AECOM standing row, the informational lookup key is:
- `spec.productAttr` if present (e.g., `body_material`, `dimensions`, `accessories`)
- `'country_of_origin'` when `spec.identity === 'country_of_origin'`
- `null` (no informational fallback) for identity fields `manufacturer` and `model_code`

Adjudicated rows (`ip_rating`, `cct`, `cri`, etc.) are unaffected — `adjAttr.specified_value` takes priority and the informational path is never reached.

### Comments / Compliance column

For informational rows, `verdict` remains `null`. The Comments/Compliance cell is blank — explicitly **not** `Comply` or `Deviation`. The engine does not adjudicate material, finish, or origin; those judgments are left for the human reviewer.

---

## Sample path verified — LCL-001 (Recessed Downlight)

Requirement `9e2c94ed` has two informational attrs captured by the spec parser:
- `body_material` = "White powder-coat aluminium"
- `finish` = "White, RAL 9016"

Generated: `compliance-9e2c94ed-2026-06-22-1230.xlsx`

**Informational rows in the AECOM sheet:**

| Row | Label | Specified (before) | Specified (after) | Comments |
|-----|-------|-------------------|-------------------|----------|
| 16 | Body Material | `—` | `White powder-coat aluminium` | _(blank)_ |
| 17 | Reflector Material | `—` | `—` | _(blank)_ |
| 18 | Body Colour | `—` | `—` | _(blank)_ |
| 19 | Country of Origin | `—` | `—` | _(blank)_ |

`Body Colour` and `Reflector Material` remain `—` because the spec uses key `finish` (not `body_colour`) and `reflector_material` is not a captured informational key in `ATTR_CONFIG`.

**Adjudicated rows — unchanged:**

| Row | Label | Specified | Comments / Compliance |
|-----|-------|-----------|----------------------|
| 13 | IP Rating | `≥ IP44` | Comply with not found in product data (required ≥ IP44) |
| 29 | Beam Angle | `~38 °` | Deviation – required 38 ° |
| 33 | CRI | `≥ 90` | Deviation – required 90 |
| 34 | Colour Temperature | `3000 K` | Deviation – required 3000 K |

Engine verdicts are preserved exactly as before.

---

## ATTR_CONFIG informational keys and their AECOM row coverage

| ATTR_CONFIG key | AECOM row | Populated from spec? |
|-----------------|-----------|----------------------|
| `body_material` | Body Material | ✓ when spec includes it |
| `country_of_origin` | Country of Origin | ✓ when spec includes it |
| `dimensions` | Physical Dimensions | ✓ when spec includes it |
| `finish` | _(no dedicated AECOM row)_ | Not surfaced — `Body Colour` maps to `body_colour` key |
| `control_type` | _(no dedicated AECOM row)_ | Not surfaced |
| `weight_kg`, `corrosion_class`, `notes` | _(no dedicated AECOM rows)_ | Not surfaced |

---

## Needs human decision

1. **`finish` vs `Body Colour`**: The spec parser captures `finish` (e.g., "White, RAL 9016") but the AECOM template row is `Body Colour` → `productAttr: 'body_colour'`. These keys don't match, so finish is never shown. Decide whether to rename the AECOM row's `productAttr` to `finish`, add a dedicated `finish` AECOM row, or add `body_colour` to `ATTR_CONFIG`.

2. **Missing informational AECOM rows**: `Reflector Material` (`reflector_material`), `Accessories` (`accessories`) have no `ATTR_CONFIG` entries, so the parser never captures them even if a spec states them. Consider adding them as informational-only entries.

3. **Dimming gate not shown**: The `dimming` attribute is a hard gate in the engine and appears in `evidence`, but there is no `dimming` standing row in the AECOM template sections. It is correctly adjudicated (gate_unverifiable for BRP 331) but invisible in the XLSX. Consider adding a standing row for it if DALI compliance is material to the certificate.

4. **Non-spec-parsed requirements**: Requirements not created via the spec parser will have `informational_attrs = []`, so all informational rows remain `—`. This is correct and expected; the Specified column only fills when a spec has been parsed.
