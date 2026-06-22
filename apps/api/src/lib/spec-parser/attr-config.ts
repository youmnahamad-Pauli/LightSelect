/**
 * Locked attribute config for the spec parser.
 *
 * This file is the authoritative mapping from attribute_key → engine operator,
 * gate_type, and weight. The spec parser extracts VALUES only; all rules come
 * from here. Never edited by the parser or inferred from the spec document.
 *
 * Operators must be members of matchingOperators (matching.ts).
 * Weights must use MATCHING_CONFIG constants (1, 1.5, 2, 2.5, 3).
 */

export interface AttrConfigEntry {
  /** Standard attribute key used in matching_requirement_attrs. */
  key: string;
  /** Human-readable label shown in review output. */
  label: string;
  /** Matching engine operator — must be a valid matchingOperator. */
  operator: string;
  /** Gate type: 'hard' | 'soft' | 'conditional' | null (null = scored attribute). */
  gate_type: 'hard' | 'soft' | 'conditional' | null;
  /** Scoring weight (high=3, med=2, low=1, etc.). Null for gate attrs. */
  weight: number | null;
  /** Target unit hint for the review output and DB storage. */
  target_unit: string | null;
  /** When true: captured in informational_attrs, never written to matching_requirement_attrs. */
  informational: boolean;
}

const H = 3;    // WEIGHT_HIGH
const M = 2;    // WEIGHT_MED
const ML = 1.5; // WEIGHT_MED_LOW
const L = 1;    // WEIGHT_LOW

export const ATTR_CONFIG: Record<string, AttrConfigEntry> = {

  // ── Hard gates ─────────────────────────────────────────────────────────────

  ip_rating: {
    key: 'ip_rating', label: 'IP Rating',
    operator: 'gte', gate_type: 'hard', weight: null, target_unit: null,
    informational: false,
  },
  voltage: {
    key: 'voltage', label: 'Input Voltage',
    operator: 'eq', gate_type: 'hard', weight: null, target_unit: null,
    informational: false,
  },
  colour_family: {
    key: 'colour_family', label: 'Colour Family',
    operator: 'colour_family_gate', gate_type: 'hard', weight: null, target_unit: null,
    informational: false,
  },

  dimming: {
    key: 'dimming', label: 'Control / Dimming Protocol',
    operator: 'contains_value', gate_type: 'hard', weight: null, target_unit: null,
    informational: false,
  },

  // ── Soft gate ──────────────────────────────────────────────────────────────

  certifications: {
    key: 'certifications', label: 'Certifications / Approval Marks',
    operator: 'contains_required_cert', gate_type: 'soft', weight: null, target_unit: null,
    informational: false,
  },

  // ── Scored attributes — core ───────────────────────────────────────────────

  cct: {
    key: 'cct', label: 'CCT',
    operator: 'match_target_cct', gate_type: null, weight: H, target_unit: 'K',
    informational: false,
  },
  cri: {
    key: 'cri', label: 'CRI (Ra)',
    operator: 'gte', gate_type: null, weight: H, target_unit: null,
    informational: false,
  },
  lumens: {
    key: 'lumens', label: 'Delivered Lumen Output',
    operator: 'match_target_lumen', gate_type: null, weight: H, target_unit: 'lm',
    informational: false,
  },
  watts: {
    key: 'watts', label: 'Max Wattage',
    operator: 'lte', gate_type: null, weight: M, target_unit: 'W',
    informational: false,
  },
  efficacy: {
    key: 'efficacy', label: 'Luminous Efficacy',
    operator: 'gte', gate_type: null, weight: M, target_unit: 'lm/W',
    informational: false,
  },
  beam_angle: {
    key: 'beam_angle', label: 'Beam Angle',
    operator: 'match_target', gate_type: null, weight: M, target_unit: '°',
    informational: false,
  },
  ik_rating: {
    key: 'ik_rating', label: 'IK Rating',
    operator: 'gte', gate_type: null, weight: H, target_unit: null,
    informational: false,
  },
  surge_protection: {
    key: 'surge_protection', label: 'Surge Protection (SPD)',
    operator: 'gte', gate_type: null, weight: H, target_unit: 'kV',
    informational: false,
  },

  // ── Scored attributes — flexible tape ─────────────────────────────────────

  lumens_per_metre: {
    key: 'lumens_per_metre', label: 'Delivered Lumen Output (per metre)',
    operator: 'match_target_lumen', gate_type: null, weight: H, target_unit: 'lm/m',
    informational: false,
  },
  watts_per_metre: {
    key: 'watts_per_metre', label: 'Max Power (per metre)',
    operator: 'lte', gate_type: null, weight: M, target_unit: 'W/m',
    informational: false,
  },
  led_per_metre: {
    key: 'led_per_metre', label: 'LED Density',
    operator: 'gte', gate_type: null, weight: M, target_unit: 'LED/m',
    informational: false,
  },
  max_run: {
    key: 'max_run', label: 'Max Single-Feed Run Length',
    operator: 'gte', gate_type: null, weight: ML, target_unit: 'm',
    informational: false,
  },

  // ── Informational only — never written to matching_requirement_attrs ────────

  body_material: {
    key: 'body_material', label: 'Body / Housing Material',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  finish: {
    key: 'finish', label: 'Finish / Colour',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  country_of_origin: {
    key: 'country_of_origin', label: 'Country of Origin',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  dimensions: {
    key: 'dimensions', label: 'Dimensions / Size',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  weight_kg: {
    key: 'weight_kg', label: 'Weight',
    operator: 'eq', gate_type: null, weight: null, target_unit: 'kg',
    informational: true,
  },
  corrosion_class: {
    key: 'corrosion_class', label: 'Corrosion Class',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  control_type: {
    key: 'control_type', label: 'Control / Dimming',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
  notes: {
    key: 'notes', label: 'Notes',
    operator: 'eq', gate_type: null, weight: null, target_unit: null,
    informational: true,
  },
};

/** All attribute keys that are informational (not written to matching_requirement_attrs). */
export const INFORMATIONAL_KEYS = new Set(
  Object.values(ATTR_CONFIG)
    .filter((c) => c.informational)
    .map((c) => c.key),
);

/** All matchable attribute keys (written to matching_requirement_attrs). */
export const MATCHABLE_KEYS = new Set(
  Object.values(ATTR_CONFIG)
    .filter((c) => !c.informational)
    .map((c) => c.key),
);
