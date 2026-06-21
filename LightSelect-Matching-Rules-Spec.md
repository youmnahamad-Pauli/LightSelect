# LightSelect — Matching Rules Spec

**Purpose.** The domain rules that drive the matching core. Each Requirement (parsed from a spec) is compared against each candidate Product on attributes only. The output per requirement × candidate is a Match Decision: an organic technical fit score, per-attribute evidence classified **Comply / Comply-with-comment / Deviation**, and a confidence. The organic score is kept separate from manual adjustments (preferred/do-not-use, boost/exclude) and any future commercial weighting, and every result is auditable.

**Framework.**
- Comparison operators: **meet-or-exceed (≥)** · **at-or-below (≤)** · **match-target** (exact or within tolerance) · **contains-required** (must include a required option).
- Each attribute is a **Gate** (a miss disqualifies) or **Scored** (a miss lowers the fit score by its weight).
- Each comparison classifies as **Comply** · **Comply-with-comment** (acceptable tolerance band) · **Deviation**. On a gate, a Deviation = disqualified.
- A comply-with-comment band exists **only where one is explicitly defined**. Everywhere else a miss is a Deviation, surfaced for the customer to accept or reject — the engine never softens a miss on its own.

Upstream of all gates: **luminaire type** is the scoping filter — a requirement is only matched against candidates of the same type; gates and scoring then run inside that pool.

---

## A. Gates

### Hard gates — physical/safety, cannot be obtained later. A miss disqualifies.

| Gate | Operator | Pass / fail rule |
|---|---|---|
| **IP rating** | ≥ | Product IP ≥ required. Underwater specialises to **IP68 continuous immersion** (the X8 second digit is the check; IP67 does not qualify). |
| **Input voltage** | compatible | Mains: within the 220–240 V range. **DC tape: exact match (24 V ≠ 48 V)**. Also checks **AC vs DC** type. Pool/underwater: **SELV / Class III** (typically 12 V) per pool electrical-zone rules (IEC 60364-7-702). |
| **Mounting type** | match | Product mounting matches the required. For strips, mounting is delivered by the **compatible profile** (surface/recessed/suspended/corner) — no compatible profile in the required style = mounting fail. |
| **Control / dimming protocol** | contains-required | Product supports the required protocol (DALI-2, 0–10 V, DMX, show controller, etc.). |
| **Operating temperature (ambient ta)** | range-covers | Product rated ta range must envelop the application ambient at **both ends** (ta-min ≤ site min AND ta-max ≥ site max). Underwater: read against **water temperature**, accounting for derating. |
| **Material type** | match | Named material must match — **stainless ≠ aluminium; glass ≠ resin/polycarbonate**. Applies to housing/body, lens/cover, and gasket/diffuser where the spec names one. Fires in any category the moment a material is named. |
| **Water type + corrosion grade** *(underwater)* | match / ≥ grade | Material/corrosion grade must suit the chemistry — fresh vs chlorinated pool vs salt. Wrong grade = disqualified. |
| **Submersion depth** *(underwater)* | ≥ | Product rated depth ≥ installation depth. |

### Soft gate — obtainable. Absence flags, it does not silently disqualify.

| Gate | Operator | Rule |
|---|---|---|
| **Certifications / approval marks** | contains-required (per mark) | Present → **Comply**. Absent → **Comply-with-comment** ("under process, X months"). **Deviation → disqualified** only when the supplier confirms it won't be obtained. |

- The **required-mark list is project-specific**, assembled from the spec and the authority having jurisdiction — e.g. **ADQCC** (Abu Dhabi, sometimes outdoor), **ADM**, **RTA** (Dubai roads/transport), **Muscat Municipality**. No universal regional default is baked in.
- **Civil Defence** is the one consistent function-driven mark — required for **emergency / exit fittings** only.
- **EN 60598-2-18** is added whenever the category is **underwater / pool**.
- **DEWA is excluded** (governs electrical distribution boards, not luminaires). **DCL is not used.**
- **Performance test reports (LM-79, LM-80, TM-21, IES) are not pass/fail marks** — they feed **confidence/provenance** (see D), not this gate.

### Conditional gates — fire only when the project flags the constraint as fixed; otherwise scored/flagged.

| Gate | Fires when | Rule |
|---|---|---|
| **Wind load / EPA** | pole/bracket selected | Product EPA ≤ structural allowance, else disqualified (structural/safety). |
| **Dark-sky / BUG** | designated / planning-controlled zone | Uplight ≤ consent limit, else disqualified (authority rejects regardless). |
| **Bend plane / radius** *(flexible)* | fixed minimum radius set | Right bend plane AND min radius ≤ tightest curve, else disqualified (the flex physically can't make the curve). |

### Gate interactions
- **Strip profile availability → mounting gate** (no compatible profile = mounting fail).
- **Strip cut-end sealing, and underwater cable/gland sealing → IP gate** (an IP-rated product cut or sealed wrong loses its rating).
- **Missing value on a gate attribute → "gate not verifiable"** — the engine flags rather than silently passing, and confidence drops harder (see D).

---

## B. Scored attributes

Per-attribute score: **Comply = 1.0 · Comply-with-comment = 0.7 · Deviation = 0**. Weights: **high = 3 · medium = 2 · low = 1** (half-steps for med-high = 2.5, low-med = 1.5). Only **applicable** attributes count; N/A attributes are excluded.

### Core

| Attribute | Operator | Comply → Comment → Deviation | Weight | Relevance |
|---|---|---|---|---|
| **CRI (Ra)** | ≥ | ≥ required → within 2 pts below → >2 below | high | interior; critical retail/hospitality/gallery/premium residential |
| **CCT** | match-target | at target (or tunable covers) → within ±100 K → >100 K off | high | all interior + architectural exterior |
| **SDCM** | ≤ | ≤ specified → *(none)* → looser than specified | medium | premium interior |
| **Lumen output** | match-target-lumen | ±2% → comply; undershoot −2% to −10% → comment; undershoot >10% → deviation; overshoot: if watts within spec and dimmable → up to +20% comment; if non-dimmable/unknown → up to +10% comment; if watts over spec → deviation regardless | high | all |
| **Power / wattage** | ≤ (electrical engineer's designed value) | ≤ designed → within 5% over → >5% over | medium | all (electrical-design constraint, not energy budget) |
| **Efficacy (lm/W)** | ≥ | ≥ required → within 5% below → >5% below | medium | all, where specified |
| **Beam angle / optic** | match-target (angle) + match-type (distribution) | angle ±10% & type matches → beyond ±10% to nearest optic step → >one step OR wrong distribution type | medium | all; sharpest accent/retail/façade/wall-wash |
| **R9** | ≥ | ≥ required → within 5 pts below → >5 below | medium | retail (food/fashion)/hospitality/gallery/healthcare/premium residential |
| **Physical fit / cutout** | match-target (cutout) + ≤ (recess depth) | within ±2 mm & depth fits → smaller than aperture (trim/adapter) → larger than fixed aperture OR depth exceeds plenum | high | recessed families only (downlight, recessed linear/modular, troffer) |
| **Dimensions** | ≤ envelope / match-target module / informational | within envelope or matches module ±few mm → outside indicative but workable → exceeds hard max OR won't fit fixed module | med-to-high (architectural/visible), lower concealed | linear runs, grid modules, visible pieces |
| **L70 lifetime** | ≥ hours at spec's grade (L70/L80/L90) | ≥ at grade (stricter grade satisfies looser spec) → within 10% below → >10% below OR looser grade than specified | low-med | all; heavier where access is hard. Read at application ta. |
| **Warranty** | ≥ years + coverage (parts < parts+labour < on-site) | years ≥ & coverage ≥ → *(none)* → fewer years OR weaker coverage (note may flag commercial extension) | high | all |
| **UGR** | ≤ | ≤ maximum → *(none)* → over by anything | high | interior workplaces (offices/education/healthcare/labs/control) |
| **IK** | ≥ | ≥ required → *(none)* → below | high (where specified) | vandal/sports/public/exterior/tunnels/car parks/industrial |
| **Colour mode / tunability** | contains-required | supports required mode → over-capable not like-for-like (RGBW for static white; wider tunable range) → can't produce required mode | high | circadian (tunable white), hospitality/residential (dim-to-warm), feature (RGB/RGBW) |
| **Addressability** | contains-required | supports required addressability & resolution → *(none)* → broadcast-only where individual required OR coarser pixel resolution | high (where specified) | control-rich interiors, façade/media, addressable emergency |

Notes: **tunable-white and dim-to-warm are not interchangeable** (wrong one = deviation). **Wall washer and wall grazer are strict separate optic types** (a grazer against a washer spec = deviation). When a spec names an optic type with no degrees, the match is **type-only** (exact type = Comply, any different type = Deviation, no comment band). Both depend on a **controlled distribution-type tag** + spec-parser mapping.

### Emergency — life-safety; **all high weight, binary, no comment bands.** Emergency/exit fittings only.

| Attribute | Operator | Comply → Deviation |
|---|---|---|
| **Autonomy / duration** | ≥ | rated ≥ required (3h covers 1h) → below |
| **Self-test / monitoring** | contains-required | supports required mode or better (addressable DALI-emergency satisfies auto self-test) → lesser |
| **Maintained / non-maintained** | match | matches, or switchable M/NM → fixed in wrong mode |
| **Emergency lumen output** | ≥ | flagged to the **emergency lux calc** rather than hard-scored |

### Street & landscape *(exterior)*

| Attribute | Operator | Comply → Deviation | Weight |
|---|---|---|---|
| **Surge protection (SPD)** | ≥ kV | rating ≥ required → below | high |
| **Vibration** | ≥ rating | ≥ required (e.g. 3G bridge) → below | high (road/bridge) |
| **Corrosion grade** | ≥ category | meets (e.g. C5-M marine) → below | high (coastal) |
| **CLO (constant output)** | present if required | has CLO → absent | low-med |
| **Control socket (NEMA / Zhaga)** | contains-required | correct standard → absent/wrong | high (smart-city) |
| **Road class + distribution** | match class + optic | meets EN 13201 class & distribution → fails/wrong | high (roadway) |
| **PC-amber / animal-friendly** | contains-required | wildlife spectrum present → standard white | high (eco zones) — **scored, not gated** |

*(Wind load/EPA and dark-sky/BUG are conditional gates — section A.)*

### Flexible / tape

| Attribute | Operator | Comply → Comment → Deviation | Weight |
|---|---|---|---|
| **Per-metre output (lm/m)** | match-target-lumen | same asymmetric rule as lumen output (see Core table). Operator: `match_target_lumen`. Dimmable attribute must be set on product; watts evaluated first. | high |
| **Per-metre power (W/m)** | ≤ designed | same as power: ≤ · 5% over · >5% over | medium |
| **Cut interval** | ≤ required | fine enough → coarser (length rounds to nearest cut point) → can't make the run | low-med |
| **Max run length** | ≥ | single-feed ≥ required → needs re-injection/extra feeds → unachievable / install can't take a mid-run feed | medium |
| **LED construction (COB vs SMD)** | contains-required / match-type | matches → *(none)* → SMD where COB/dotless required | high direct-view, low behind diffuser |
| **Density (LEDs/m)** | ≥ | ≥ required → *(none)* → below (spotty); engine flags diffuser depth, which can mask low density | med-high direct-view, lower behind diffuser |

**Profiles & accessories** (these *are* the mounting and IP for strips):

| Sub-attribute | Operator | Comply → Deviation | Weight |
|---|---|---|---|
| Compatible profiles (mounting) | contains-required | required mounting style available → named code missing but equivalent exists (comment) → **no compatible profile = mounting gate fail** | high |
| Cover / diffuser | match-type | required type available (opal for dot-free) → only clear where opal needed | med-high |
| Fixing method | contains-required | required fixing available (clips/brackets/VHB/clips-per-metre) → adhesive-only where mechanical needed | low-med |
| End caps / joints / sealing | contains-required | accessories for geometry & cut ends available → no corner joint for L-run; **no cut-end sealing on wet strip = IP gate fail** | med (high if IP/wet) |
| Recommended substrate | contains-required / info | substrate matches install surface → different needs alt fixing (comment) → genuinely incompatible | low |

Colour: single-colour · tunable white · RGB · RGBW/RGBWW · **RGBIC/addressable** — RGBIC is a **distinct tier above RGB** (independent segments, simultaneous multi-colour) and carries the segment-addressability requirement. Plain RGB against an RGBIC spec = Deviation; RGBIC against a plain RGB spec = Comply (over-capable). Tunable white is a separate axis (can't satisfy a colour spec, and vice versa). Handled via the colour-mode + addressability + CCT rules above.

### Underwater

Mostly gate-driven (IP68, depth, water-type+corrosion, material, SELV — section A; EN 60598-2-18 — cert gate). Scored/flagged additions:

| Attribute | Operator | Comply → Deviation | Weight |
|---|---|---|---|
| **Maintenance access / serviceability** | contains-required | serviceable module when required → sealed-for-life where serviceable required | low-med (higher where lifecycle maintenance is stated) |
| **Driver type (CV vs CC)** | match | matches the fitting → mismatch | (compatibility) |
| **UV resistance** *(near-surface)* | contains-required | gaskets/lenses/cables UV-rated → not, where near the waterline | (environment) |

Flags: **driver located outside the wet zone** (install); **cable & gland sealing → IP68 gate**; **operating temp read against water temp, with derating** applied to output/L70.

**Minor enrichments folded in:** voltage gate checks AC vs DC type · beam handles dual-axis asymmetric (e.g. 45°×35°) · current draw rides with power as the electrical-design output (informational).

---

## C. Overall fit-score method

1. **Gates filter first (pass/fail).** Every applicable gate runs. A hard-gate miss removes the candidate entirely — it never reaches scoring. A soft cert "under process" passes with a comment; only a confirmed won't-obtain disqualifies. Conditional gates fire only when the project flags the constraint fixed. What survives is the pool of technically-eligible products.

2. **Scored attributes roll up by weight.** Each applicable scored attribute is classified and scored (Comply 1.0 / Comment 0.7 / Deviation 0), then weighted (high 3 / medium 2 / low 1, with half-steps). Over **applicable attributes only**:

   **fit = Σ(weight × score) / Σ(weight)** → a 0–100% organic technical fit, with every attribute's contribution visible.

3. **Deviations stay visible and cap the headline.**
   - The result always carries a **deviation profile** beside the score (e.g. "88%, 1 high-weight deviation (warranty), 2 comments").
   - Any **high-weight Deviation caps the headline fit at 80%**, so a serious miss can never read as a top-tier clean match.

4. **Organic score stays separate.** This result is the organic technical score (gates + attributes only). Preferred/do-not-use, boost/exclude and any future commercial weighting apply as a **separate layer on top**, shown distinctly, never folded in. The audit shows the organic score first, then any adjustment.

*Tunable: the 0.7 comment score, the 80% cap, the 3/2/1 weights.*

---

## D. Confidence model

Separate from fit and **shown side by side** — fit = how well the product matches; confidence = how much to trust that assessment. Both inputs are mechanical.

- **Completeness** — of the applicable attributes, how many actually have a value to compare. Gaps pull it down.
- **Provenance** — how each value is sourced:
  - Test-report-backed (LM-79, LM-80, TM-21) or manufacturer-confirmed = **1.0**
  - Human-confirmed = **0.9**
  - Extracted (datasheet / AI) = **0.6**
  - Missing = **0**

**confidence = average provenance across all applicable attributes** (missing scores 0, N/A excluded). Surfaced as a band — **High / Medium / Low** — with the % underneath.

Wirings:
- **Test reports lift provenance** of exactly the values they substantiate (LM-79 → lumens; LM-80/TM-21 → L70) — that's how they feed in, rather than acting as pass/fail marks.
- A **missing value on a gate attribute** flags "**gate not verifiable**" rather than silently passing, and drops confidence harder — no confident pass on an IP or voltage gate that couldn't be checked.

*Tunable: the 0.9 / 0.6 provenance values; the High/Medium/Low band thresholds (not yet set).*

---

## E. Open questions / deferred

- **Confidence band thresholds** (High/Medium/Low cut-offs) — not yet set; needs numbers.
- **Tunable parameters** to confirm in build: comment score 0.7, fit cap 80%, weights 3/2/1, provenance 0.9/0.6.
- **Uniformity** (spacing, floor/wall illuminance & uniformity) — **out of scope for matching**; it's a layout calculation, flagged to the lighting calc alongside emergency lumen output.
- **Catalogued vs configurable** resolved as: certifications are judged on the obtainable/configurable basis (under-process acceptable); **mounting, control/dimming and colour mode are judged as catalogued** (hard, not "we could order a variant").
- **Schema dependencies for the build:**
  - Controlled **distribution-type tag** vocabulary (symmetric, asymmetric, wall wash, wall graze, batwing, elliptical/oval, spot, narrow/medium/wide flood) + spec-parser mapping from the consultant's words.
  - Product **"approvals held"** list and requirement **"approvals required"** list (project-specific), matched contains-required.
  - **Lumen-maintenance grade** (L70/L80/L90) stored with the L70 hours.
  - **Provenance state** per value (test-report-backed / manufacturer-confirmed / human-confirmed / extracted / missing) to drive confidence.
