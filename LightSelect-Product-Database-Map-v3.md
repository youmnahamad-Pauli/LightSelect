# LightSelect — Product Database Map (v3)

_Status: supersedes the data-model sections (§3–§6) of `LightSelect-Session-Handoff.md`. This is the signed-off model that gates the editable-categories rewire. Positioning context: `LightSelect-Value-Proposition.docx`._

---

## 0. Purpose & how to use

A clean product-database map: a flat, org-editable **luminaire-type taxonomy** plus an **attribute schema**, grounded in real brand catalogues.

- **Category drives organisation + document requirements ONLY.** It is never read by matching or compliance — those run on attributes.
- **Division of labour:** chat = planning/decisions; Claude Code = all repo work. Rewire only after this model is signed off.
- The user is a lighting-specifications domain expert (not a developer); the model is expressed in luminaire-type and photometric vocabulary.

---

## 1. Locked structural principles

Carried forward from the handoff, with the v3 additions in **bold**.

1. **Root = luminaire type.** Flat, org-wide, project-stable. IDs preserved on unlock.
2. **Application segment** (Commercial / Retail / Industry / Sports / Outdoor) = optional browsing tag; never read by compliance/matching.
3. **Mounting** = attribute in general; deliberately a naming axis for some linear / landscape / underwater categories.
4. **Power source** = attribute (mains / solar / hybrid). **Driver architecture** = attribute (integral / remote / no-PSU AC / 48V DC).
5. **Construction (flexible / rigid)** = attribute. Rigid-Linear catch-all removed. **The flexible branch splits into two form-based categories: Flexible LED Tapes (bare cuttable tape, needs a profile) and Flex Neon (encapsulated, self-housed, bends natively).**
6. Modular vs single = flag. Track voltage (230V vs 48V) = attribute.
7. **Graze / wall-wash / flood = OPTIC attribute, NOT categories** (decision A). Re-confirmed by IBL's "Wall Washer" facet sitting inside a single flex family.
8. Compliance & matching run on attributes, never on category.
9. **NEW — Two flexible categories split by form (Flexible LED Tapes vs Flex Neon); within each, variety is expressed through attributes, not further sub-categories.** IBL filters one neon family by attribute facets; ILTI does the same for tape. We follow suit inside each category.
10. **NEW — Profiles are their own catalogue (a component/library record type), NOT luminaire-type categories.** A bare profile emits no light, so it stays out of the matching taxonomy. In a build, a profile is *attached to* the strip as its housing.
11. **NEW — Addressability (static vs pixel) is an attribute**, orthogonal to colour mode.
12. Out of scope: table & floor lamps; GOBO / effect projectors; controls/sensors/drivers as categories.

---

## 2. The flexible branch (the v3 work): Flexible LED Tapes + Flex Neon

Two flat-root categories. They share the same catalogue model below, but differ in how central the profile is.

| | Flexible LED Tapes | Flex Neon |
|---|---|---|
| Form | bare cuttable PCB tape on a reel | encapsulated silicone/PVC, self-diffused |
| Finished by | a profile + diffuser (incomplete without one) | self-housed; mounts via clips / channel / track |
| Bending | mostly straight in a profile | native horizontal / vertical / multi bend |
| Profile role | central — sets mounting, trim, dot-free outcome | optional — mounting accessory, not a diffuser |
| Grounded by | ILTI LUCE 2024 (§4.3 numbers) | IBL facet structure (numbers pending datasheet) |

### 2.1 Model — three catalogues compose one configured product

Combining the "profiles are first-class" and "profile attaches to the strip" instincts: profiles and accessories live as their own reusable records, and a deliverable is an assembled instance. The model applies to both categories; for Flex Neon the profile slot is usually empty (the neon is its own housing).

- **Strip / neon catalogue** — the photometric core. Carries lm/m, W/m, CCT, CRI, R9, LED/m, cut interval, max run, voltage, IP. This is what matching queries against a consultant spec.
- **Profile catalogue** — the housing (central for tapes, optional for neon). Its own records (code, section, finish, mounting capability, diffuser/screen) plus its own accessories and its compatibility / dot-free data. Sets the configured product's mounting, trim and appearance.
- **Accessory catalogue** — end caps, clips, joints, brackets, suspension kits, connectors, feed cables, drivers. BOM lines only.
- **Configured product** = strip-or-neon + (optional) profile + accessories. This is the record that is submitted, matched, approved and revised. Compliance/matching read the **core attributes + the assembled result** (profile contributes mounting, trim, diffuser losses, dot-free outcome). Accessories feed proposal + BOQ only.

Side effect that serves the "product memory" pillar: a profile catalogued once is reused across many tape builds — reused even more than a tape.

### 2.2 Within each category, facets resolve to attributes (no further sub-categories)

The IBL facets below apply mainly to Flex Neon; colour mode and addressability apply to both categories.

| IBL facet (REFINE) | Modelled as |
|---|---|
| Horizontal / Vertical / Multi bend | **Bend-plane attribute** {horizontal, vertical, multi} + **min bend radius** value |
| High temp | **Operating-temperature variant** (high-ambient flex) |
| Wall washer | **Wash optic** (decision A); usually delivered via profile/lens |
| Cove | Application/mounting context — overlaps the existing "Cove" category (reconciliation item §5) |
| Accessories | Accessory catalogue |

IBL's nine **LED TYPE** entries decompose into two attributes — five colour modes by an addressability flag:

| Colour mode | Static | Pixel (addressable) |
|---|---|---|
| Mono / static white | ✓ | ✓ |
| Tunable white | ✓ | ✓ |
| Warm dim (dim-to-warm) | ✓ | — |
| RGB | ✓ | ✓ |
| RGBW | ✓ | ✓ |

**Addressability** (static vs pixel; per-LED SPI / DMX pixel control) is the genuinely new axis the neon range introduces — it lets matching answer "tunable white, addressable" without hard-coding the nine LED-TYPE entries as types. It applies to both categories.

### 2.3 Grounding evidence

- **ILTI LUCE 2024 (tape + profiles)** — supplies real per-metre/cuttability numbers (§4.3 table), seven profile families with accessories, and the dot-free mechanism (cut interval + strip×profile compatibility matrix).
- **IBL flex navigation** — supplies the Flex Neon facet structure (REFINE + LED TYPE) and the addressability axis; its facets become attributes within the Flex Neon category.
- **Pending (flex datasheet):** W/m · lm/m · LED/m · cut interval · max run · IP (flex neon typically IP65/67 — finally grounds the outdoor/wet sub-type) · input voltage (24V/48V/mains) · min bend-radius values.

---

## 3. Luminaire-type taxonomy (current, flat root)

Grouped for readability only.

**Interior — ceiling & recessed:** Downlight (recessed) · Downlight (surface) · Panels & Troffers · Recessed modular multiples · Recessed accent / adjustable spotlight · Projector / spotlight (standalone) · Track & rail system · Track inserts · Pendant / suspended.

**Interior — surface group:** Surface-mounted linear · Surface bulkhead · Surface spots · Surface ceiling (general).

**Interior — wall & special:** Wall (surface) · Recessed wall / step / orientation (incl. handrail) · Emergency / exit · Cleanroom.

**Industrial:** High/low bay · Waterproof batten · Batten & trunking.

**Linear / continuous-run** (decision A; by mounting/form; flex/rigid = attribute): **Flexible LED Tapes** · **Flex Neon** · Ceiling recessed linear · Pendant linear (indoor) · Pendant linear (outdoor) · Cove.

**Facade / exterior architectural:** Facade-surface linear · Facade-inground linear · Facade beam/projector · Facade quad/flood.

**Exterior — area & street:** Floodlight/projector · Street & area · Post-top · Light column · Pole/column (structural) · Tunnel · Bollard · In-ground (general) · Wall-mounted exterior.

**Specialist:** Underwater (IP68) — one category, forms as mounting variants · Landscape — spike/stake, buried, surface, tree-mount.

---

## 4. Attribute schema

### 4.1 Core 26 (retained)
Identity (Manufacturer · Product Family · Model · Description · Application) · Physical (Mounting · Dimensions · Weight · Housing Material · Finish) · Photometric (Lumens · Wattage · Efficacy · CCT · CRI · Optic) · Compliance (IP · IK · Certifications) · Electrical (Input Voltage · Dimming/Driver · Operating Temp) · Performance (Lifetime · Warranty · Accessories · Notes) · plus user-defined custom.

### 4.2 Additions (catalogue-driven), grouped — v3 additions in **bold**
- **Photometric:** UGR · optic distribution (H°×V° · IES Type · EN 13201 road class · BUG · ULOR) · wash/graze/flood optic mode · lumen-maintenance Lx · **per-metre W/m & lm/m** · **LED density (LED/m)** · colour mode (static white · tunable white · dim-to-warm · RGB/RGBW/RGBA + PC-amber) · CRI 80+/90+ (and 97+) · lens/diffusion (clear/frosted/opal/micro-prismatic).
- **Compliance/safety:** glow-wire · class I/II/III · surge SPD (kV) · vibration rating · dark-sky flag · standards (EN 13201, ANSI C136.31, EN 60598-2-18 underwater).
- **Electrical/control:** control & dimming protocol (on-off · 1-10V · DALI/DALI-2 · DMX/RDM · **SPI / DMX pixel** · Casambi · Lumentalk · Zhaga D4i · NEMA · PIR) · **addressability {static, pixel}** · driver architecture · power source · track voltage · CLO.
- **Physical:** construction (flexible/rigid) · modular (single/continuous) · trim/bezel · adjustability · **bend plane {horizontal, vertical, multi}** · **min bend radius** · **cut interval / sectionable-every** · **max run length** · corrosion/material grade · length increments.
- **Spectrum/wildlife:** animal-friendly (amber/PC-amber/turtle/low-blue/1800K/2200K).
- **Underwater (WIBRE):** submersion depth · water type · material grade · EN 60598-2-18 · IP68/69.
- **Landscape (Maestro):** mounting (spike/buried/surface/tree) · anti-glare snoot · BUG · aimable tilt.
- **Emergency:** maintained/non-maintained · battery autonomy · self-test.
- **Operating-temperature variant:** standard / **high-temp**.

Attributes carry per-type relevance (W/m + cut interval = flexible LED tapes; bend plane + min radius + addressability = flex neon; depth/water-type = underwater; BUG/road class = street/landscape; UGR = interior functional).

### 4.3 Flexible LED Tapes — relevant attribute set + grounding numbers

These ILTI LUCE numbers ground the **Flexible LED Tapes** category. **Flex Neon** uses the same attribute set (plus bend plane / min bend radius / addressability emphasis); its numbers are pending a datasheet (§2.3).

ILTI LUCE tapes (all 24V DC · IP20 · indoor · 120° · dimmable · L70B50 >50,000h · −10/+35°C · 3-yr warranty · 3M VHB tape · max 5m run):

| Strip | W/m | lm/m | LED/m | Cut every | CRI / R9 | Colour mode |
|---|---|---|---|---|---|---|
| N25 | 9.6 | >1200 | 128 | 6.25 cm | >80 | static white 2200–4000K |
| N19 | 14.4 | >1850 | 160 | 5 cm | 90 | static white 2700–4000K |
| N24 | 14.5 | >2064 | 160 | 0.5 cm | 90 / >65 | static white 2200–5000K (dot-free) |
| N24HF | 23 | >3400 | 160 | 0.5 cm | >80 | high-output white (dot-free) |
| N17 | 15 | >1590 | 240 | 3.3 cm | >97 / >83 | high-CRI white 2700–4000K |
| N10 | 19.2 | >3091 | 112 | 7.14 cm | >80 | high-output white 3000–4000K |
| N21 | 14.4 | 570 | 120 | 5 cm | — | RGB |
| N22 | 15 | 700 | 192 | 6.25 cm | 90 | 2400K + RGB (RGBW) |

ILTI LUCE profile families (aluminium · grey, black on demand · opal screen included):

| Profile | Section | Mounting role |
|---|---|---|
| P23 | 1.6×1.6 corner | ceiling/wall 45° |
| P24 | 1.9×1.1 | surface |
| P04 | 2.1×1.2 | surface / recessed / suspended / wall (by accessory) |
| P25 | 1.0×1.5 | recessed |
| P22 | 1.7×0.7 | surface |
| P13 | 1.6×0.8 (2.5 trim) | recessed flanged |
| P05 | 1.9×2.0 | recessed trimless / plaster-in |

Profile-level data: section dimensions · mounting capability · finish · diffuser/screen (opal/clear/frosted) · own accessories · strip-compatibility & dot-free outcome (per the brochure's compatibility matrix).

---

## 5. Open reconciliation items (resolve next session / with Claude Code)

- De-dup overlaps: "surface-mounted linear" appears twice; "inground linear" vs general "in-ground" vs "facade-inground" vs Underwater (rule of thumb: IP68 → Underwater).
- **Cove** as a category vs "cove" as a flex application (IBL lists cove as a flex facet).
- Handrail — own type or part of recessed wall/step/orientation.
- "Application" attribute vs segment tag — keep both or collapse.
- Landscape — one category or split.
- Flex numeric attribute examples — pending a flex datasheet (§2.3).
- Tape vs neon boundary — where does a fully-encapsulated, dot-free COB "neon-look" tape sit? (Rule of thumb: self-housed + encapsulated → Flex Neon; needs a profile to finish → Flexible LED Tapes.)

---

## 6. Repo context & next step

- Re-verify before any code: is `feature/compliance-statement` merged to `main`; does `main` run cleanly; editable-categories build is paused until this model is signed off.
- Rewire on a feature branch off `main`: unlock seeded system categories into **editable DB records preserving existing IDs** (file/product links must survive); align the attribute schema per §4.
- Add **profile** and **accessory** catalogues as their own record types (not luminaire categories), with a link from a configured product (Flexible LED Tapes or Flex Neon) to its core record + optional profile + accessory BOM.
