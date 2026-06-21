# Phase 5 AECOM Refine — Implementation Report

## Branch: `feature/phase5-aecom-refine`

---

## Part A — Spine additions (`apps/api/src/lib/exports/`)

### New types (`types.ts`)

#### `ProductArchetype`
```typescript
type ProductArchetype = 'preassembled' | 'component_build' | 'unknown'
```

| Value | Meaning |
|---|---|
| `preassembled` | Factory-built luminaire; published lm figure is delivered output |
| `component_build` | Strip + profile + diffuser; delivered = source × diffuser_transmission |
| `unknown` | Archetype not confirmed; lumen basis flagged for human review |

#### `LumenRepresentation`
```typescript
interface LumenRepresentation {
  source_lumens:        number | null   // bare strip/module output
  delivered_lumens:     number | null   // null = PENDING (no transmission data)
  basis:                'source' | 'delivered'
  diffuser_transmission: number | null  // 0.0–1.0; null if not characterised
  unit:                 string          // "lm/m" for tape, "lm" for fixture
  efficacy_lm_per_w:   number | null   // delivered ÷ watts; null when pending
  pending_reason:       string | null   // why delivered is null
}
```

#### `ProposedProduct` additions
- `archetype: ProductArchetype`
- `lumen_representation: LumenRepresentation | null`
- `raw_attributes: Record<string, string | null>` — all `product_attribute_values` for the product; templates reach any attribute not in adjudicated evidence

### Archetype detection (`spine.ts` — `detectArchetype()`)

Priority:
1. Explicit `archetype` product attribute (`'preassembled'` or `'component_build'`)
2. Model code starting with `1wkl` → `component_build` (WKL strips need profile + diffuser)
3. Fallback → `'unknown'` (logged implicitly via pending_reason)

ILTI WKL strips are classified as `component_build` by rule 2.

### Lumen representation builder (`buildLumenRepresentation()`)

| Archetype | `source_lumens` | `delivered_lumens` | `basis` |
|---|---|---|---|
| `component_build`, transmission set | published figure | source × transmission | `'source'` |
| `component_build`, no transmission | published figure | **null (PENDING)** | `'source'` |
| `preassembled` | null | published figure | `'delivered'` |
| `unknown` | published figure | published figure (assumed equal, unconfirmed) | `'source'` |

Source lumens are read from match_evidence `product_value` (preferred — already parsed) or fallback to `product_attribute_values`.

Diffuser transmission is read from `product_attribute_values.attribute_key = 'diffuser_transmission'`. Currently not characterised for WKL strips → delivered_lumens = null.

Efficacy (`lm/W`) is computed as `delivered ÷ watts` when both are available; null when pending.

### Display-friendly manufacturer + model code

The spine now extracts the display-friendly manufacturer and model code from `display_name` (e.g. `"ILTI LUCE — 1-WKL-6023-0-00"` → manufacturer `"ILTI LUCE"`, model_code `"1-WKL-6023-0-00"`) rather than using the lowercased canonical dedup key (`"iltiluce"`, `"1wkl6023000"`). The confirmed `manufacturer` product attribute takes priority when set.

---

## Part B — AECOM template rebuild (`aecom-xlsx.ts`)

### Layout: three sections, each with Specified | Proposed | Comments/Compliance

#### Row structure (43 rows total for FLEX-TAPE sample)

| Rows | Content |
|---|---|
| 1–4 | Dark header band (unchanged) |
| 5 | Spacer |
| 6–7 | General Description |
| 8 | Spacer |
| 9 | **LUMINAIRE (FIXTURE)** banner (indigo tint `#E8EAF6`) |
| 10 | Column headers |
| 11–22 | 12 standing rows |
| 23 | Spacer |
| 24 | **LAMP / SOURCE** banner |
| 25 | Column headers |
| 26–35 | 10 standing rows incl. DELIVERED lumen row |
| 36 | Spacer |
| 37 | **CONTROL GEAR / BALLAST / TRANSFORMER** banner |
| 38 | Column headers |
| 39–41 | 3 standing rows |
| 42 | Spacer |
| 43 | Other (trailing catch-all) |

#### Section 1 — LUMINAIRE (FIXTURE)

| Row | Label | attr_key | Proposed source |
|---|---|---|---|
| 11 | Manufacturer | — | `proposed_product.manufacturer` |
| 12 | Manufacturer Product Reference | — | `proposed_product.model_code` |
| 13 | IP Rating | `ip_rating` | evidence |
| 14 | IK Rating | — | `raw_attributes.ik_rating` |
| 15 | Mounting Type | `mounting` | evidence → `raw_attributes.mounting` |
| 16 | Body Material | — | `raw_attributes.body_material` |
| 17 | Reflector Material | — | `raw_attributes.reflector_material` |
| 18 | Body Colour | — | `raw_attributes.body_colour` |
| 19 | Country of Origin | — | `proposed_product.country_of_origin` |
| 20 | Operating Temperature | `operating_temperature` | evidence → `raw_attributes.operating_temperature` |
| 21 | Physical Dimensions | `dimensions` | evidence → `raw_attributes.dimensions` |
| 22 | Accessories | — | `raw_attributes.accessories` |

#### Section 2 — LAMP / SOURCE

| Row | Label | attr_key | Proposed source |
|---|---|---|---|
| 26 | Manufacturer | — | `proposed_product.manufacturer` |
| 27 | Reference | — | `proposed_product.model_code` |
| 28 | Type | — | `raw_attributes.lamp_type` |
| 29 | Beam Angle | `beam_angle` | evidence → `raw_attributes.beam_angle` |
| 30 | Voltage | `voltage` | evidence |
| 31 | Wattage | `watts_per_metre` | evidence → `raw_attributes.watts_per_metre` |
| 32 | SDCM | — | `raw_attributes.sdcm` |
| 33 | CRI | `cri` | evidence → `raw_attributes.cri` |
| 34 | Colour Temperature | `cct` | evidence → `raw_attributes.cct` |
| 35 | **Lumen Output (DELIVERED)** | `lumens_per_metre` | **special — see below** |

#### Section 3 — CONTROL GEAR / BALLAST / TRANSFORMER

| Row | Label | Proposed source |
|---|---|---|
| 39 | Type | `raw_attributes.driver_type` |
| 40 | Manufacturer | `raw_attributes.driver_manufacturer` |
| 41 | Reference | `raw_attributes.driver_reference` |

### Lumen Output (DELIVERED) — row 35

**Rendering cascade:**

| Condition | Proposed cell | Comments / Compliance |
|---|---|---|
| `component_build`, no diffuser_transmission | `"pending diffuser transmission"` | amber: `"Comply with Delivered not confirmed — source {X} lm/m; delivered = source × diffuser transmission (diffuser transmission not characterized)"` |
| Any archetype, `delivered_lumens` known | `"{delivered} lm/m"` | Engine verdict (comply/comment/deviation) from adjudicated `lumens_per_metre` evidence |
| No `lumen_representation` at all | Evidence `product_value` or `—` | Engine verdict from evidence |

**Critical invariant:** the source figure (1850 lm/m for 1-WKL-6023-0-00) is NEVER substituted for delivered. The verdict is always `comply_with_comment` (amber) for the pending case, regardless of the engine's source-based verdict.

### Row rendering rules

- **All standing rows always rendered** — blank rows are honest gaps, not hidden rows.
- **Cascade**: adjudicated evidence → identity field → raw_attributes → `—`
- **Specified column**: formatted requirement value from evidence/req attrs; `—` for rows without a requirement
- **Comments/Compliance composition** (unchanged from Phase 5):
  - `comply` → `"Comply"` (green)
  - `comply_with_comment` → `"Comply with <comment>"` (amber)
  - `deviation` → `"Deviation – <comment>"` (red, bold)
  - `null` → empty (no verdict)

---

## Sample output

**Command**: `pnpm export:compliance --consultant aecom`  
**File**: `apps/api/compliance-c088d9d3-2026-06-21-1835.xlsx`  
**Sheet**: `FLEX-TAPE`  
**Proposed**: ILTI LUCE — 1-WKL-6023-0-00 (Rank #1, 93.1% fit, `component_build`)

### Key rows verified

| Row | Label | Specified | Proposed | Comment |
|---|---|---|---|---|
| 11 | Manufacturer | — | ILTI LUCE | — |
| 12 | Manufacturer Product Reference | — | 1-WKL-6023-0-00 | — |
| 13 | IP Rating | ≥ IP20 | IP20 | Comply (green) |
| 30 | Voltage | 24V DC | 24V DC | Comply (green) |
| 31 | Wattage | ≤ 20 W/m | 14.4 | Comply (green) |
| 33 | CRI | ≥ 90 | 90 | Comply (green) |
| 34 | Colour Temperature | 3000 K | 3000 | Comply (green) |
| **35** | **Lumen Output (DELIVERED)** | **~2000 lm/m** | **pending diffuser transmission** | **Comply with Delivered not confirmed — source 1850 lm/m; delivered = source × diffuser transmission (diffuser transmission not characterized)** |

Row 35 confirmed: NOT showing `1850` in Proposed; source figure is in the comment only.

---

## Verification

| Check | Result |
|---|---|
| `pnpm --filter api build` | Clean (zero TS errors) |
| Golden tests `export-generators.test.ts` | 22/22 ✓ |
| Golden tests `export-golden.test.ts` | 13/13 ✓ |
| Three sections present | ✓ |
| All standing rows present | ✓ (blanks where data absent) |
| Lumen row pending path | ✓ Proposed = "pending diffuser transmission" |
| Source figure NOT in Proposed | ✓ |

---

## Needs human decision

1. **`diffuser_transmission` ingestion**: WKL strips paired with a BP profile + diffuser need a `diffuser_transmission` product attribute characterised from the diffuser spec sheet. Until then, delivered_lumens = null for ALL component_build products. Decision: who characterises this — the user, a future ingestion rule, or a lab measurement?

2. **Per-combination diffuser transmission**: a single WKL strip can be paired with multiple profile + diffuser combinations (e.g. opal vs micro-prism). Diffuser transmission may vary by combination. Currently the spine assumes a single `diffuser_transmission` attribute. Decision: model as a separate "combination" entity or keep it on the strip?

3. **`item_code` persistence**: currently passed as a CLI option (`FLEX-TAPE`) and not stored in `matching_requirements`. To pre-populate sheet names without CLI args, add a nullable `item_code` column to `matching_requirements` (requires DB migration). Decision: when to add this field?

4. **Section 1 / Section 2 Manufacturer identity**: for integrated LED strips (component_build), both sections show the same manufacturer and reference. For traditional luminaires with replaceable lamps, Section 1 = luminaire maker, Section 2 = lamp maker. The spine doesn't yet distinguish these. Decision: add `lamp_manufacturer` / `lamp_model_code` fields to the product data?

5. **`lamp_type`, `sdcm`, `driver_*` attributes**: none of these are currently ingested for WKL strips (blank rows in Sections 2 and 3). Decision: add to the ingestion extraction pipeline, or allow users to fill them in via the admin UI?

6. **Unknown archetype flag for non-WKL products**: products without a model code starting with `1wkl` and without an explicit `archetype` attribute are classified `'unknown'`. Their `pending_reason = 'archetype unknown — lumen basis unconfirmed'` silently marks them. Decision: surface this as a UI warning, or require archetype confirmation before export is allowed?
