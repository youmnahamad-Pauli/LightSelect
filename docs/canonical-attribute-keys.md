# Canonical Attribute Key List

Attribute keys used in `product_attribute_values` and `matching_requirement_attrs`.
All keys are lowercase snake_case. When ingesting or seeding, use these exact strings.

## Electrical

| Key | Description | Example values |
|-----|-------------|----------------|
| `voltage` | Supply voltage and current type | `24V DC`, `12V DC`, `240V AC` |
| `watts_per_metre` | Power consumption per metre | `14.4W/m`, `9.6W/m` |

> **Not** `input_voltage`, `input_voltage_dc`, `power_per_metre`.

## Photometric

| Key | Description | Example values |
|-----|-------------|----------------|
| `lumens_per_metre` | Output (intended: delivered) per metre | `1850-2000 lm/m`, `2064-2368 lm/m` |
| `cct` | Correlated colour temperature — comma-separated list or range | `2700K, 3000K, 4000K`, `2700K-6500K` |
| `cri` | Colour Rendering Index | `90`, `>95`, `>80` |
| `beam_angle` | Half-angle or full beam angle | `120°` |

> **Not** `lm_per_metre`, `lumens`, `colour_temperature`.

## LED density

| Key | Description | Example values |
|-----|-------------|----------------|
| `led_per_metre` | LED count per metre | `160 LED/m`, `240 LED/m` |

> **Not** `leds_per_metre`, `led_density`, `leds/m`.

## Protection & installation

| Key | Description | Example values |
|-----|-------------|----------------|
| `ip_rating` | Ingress protection rating | `IP20`, `IP65`, `IP68` |
| `cut_interval` | Minimum cut pitch | `0.5 cm`, `3.3 cm`, `5 cm` |
| `operating_temp` | Operating temperature range | `-10 to +35°C` |
| `application` | Indoor / outdoor / industrial | `Indoor`, `Outdoor` |
| `dimming` | Dimming capability | `Dimmable`, `0-10V`, `DALI` |

## Colour family (matching gate)

| Key | Description | Controlled vocabulary |
|-----|-------------|----------------------|
| `colour_family` | Output colour classification used as a hard gate in the matching engine | `white` · `tunable_white` · `dim_to_warm` · `rgb` · `rgbw` · `rgbww` · `rgbic` |

Set by the seed script from `family_name` (ILTI) or by human review.
White axis (eligible for white requirements): `white`, `tunable_white`, `dim_to_warm`.
Colour axis (eligible for colour requirements): `rgb`, `rgbw`, `rgbww`, `rgbic`.
RGBIC is over-capable for RGB specs and still complies.

## Physical

| Key | Description | Example values |
|-----|-------------|----------------|
| `dimensions` | Reel or unit dimensions (extracted, not normalised) | `1000 x 1 x 0.2 cm (reel)` |

## Lifecycle & warranty

| Key | Description | Example values |
|-----|-------------|----------------|
| `lifetime_hours` | Rated lifetime | `>L70B50 >50000hrs` |
| `warranty` | Manufacturer warranty period | `3 years` |

## Informational (not matched)

| Key | Description |
|-----|-------------|
| `family_name` | Manufacturer internal family code (ILTI: N10, N17, N19 …) |
| `description` | Free-text product description from catalogue |
| `notes` | Extracted installation / compatibility notes |

---

## Keys removed / never use

| Wrong key | Correct key | Reason |
|-----------|-------------|--------|
| `input_voltage` | `voltage` | Fixed in Phase 3 — ILTI data always uses `voltage` |
| `leds_per_metre` | `led_per_metre` | Fixed in Phase 3 — ILTI data uses `led_per_metre` |
| `colour_mode` | `colour_family` | `colour_mode` is raw extraction artefact; `colour_family` is the gate-ready controlled value |
