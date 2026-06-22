/**
 * Luminaire type taxonomy for the spec parser.
 *
 * Canonical type strings must match exactly what is stored in
 * canonical_products.luminaire_type and matching_requirements.luminaire_type.
 * The LLM is given this list and asked to classify each spec item into one
 * of these types. Unknown types get a null classification and are flagged.
 */

export interface LuminaireTypeDef {
  /** Canonical type string used in the DB. */
  type: string;
  /** Human-readable label for review output. */
  label: string;
  /** Synonyms / aliases to help the LLM classify. */
  aliases: string[];
}

export const LUMINAIRE_TYPES: LuminaireTypeDef[] = [
  {
    type: 'downlight',
    label: 'Recessed Downlight',
    aliases: [
      'downlight', 'recessed downlight', 'pot light', 'can light',
      'recessed luminaire', 'recessed fitting', 'recessed spotlight',
      'trimless downlight', 'trimmed downlight',
    ],
  },
  {
    type: 'flexible_tape',
    label: 'Flexible LED Tape / Strip',
    aliases: [
      'flexible tape', 'flexible led tape', 'led tape', 'led strip', 'flex',
      'cove lighting', 'perimeter tape', 'led ribbon', 'flexible strip',
      'linear tape',
    ],
  },
  {
    type: 'linear',
    label: 'Linear Luminaire (Surface / Pendant / Recessed)',
    aliases: [
      'linear', 'linear luminaire', 'linear pendant', 'surface linear',
      'recessed linear', 'linear surface', 'batten', 'troffer', 'linear led',
      'pendant linear', 'suspended linear', 'surface-mount linear',
    ],
  },
  {
    type: 'profile',
    label: 'LED Profile / Extrusion',
    aliases: [
      'profile', 'led profile', 'aluminium profile', 'extrusion', 'channel',
      'led channel', 'extrusion profile', 'strip profile',
    ],
  },
  {
    type: 'wall_washer',
    label: 'Wall Washer / Grazer',
    aliases: [
      'wall washer', 'wall grazer', 'wall wash', 'grazer', 'facade washer',
      'facade grazer', 'recessed wall washer', 'surface wall washer',
    ],
  },
  {
    type: 'floodlight',
    label: 'Floodlight / Projector',
    aliases: [
      'floodlight', 'flood', 'projector', 'spotlight', 'exterior flood',
      'ground-mounted flood', 'facade floodlight', 'facade projector',
      'exterior projector', 'uplighter', 'exterior uplighter', 'floor-mounted uplighter',
    ],
  },
  {
    type: 'streetlight',
    label: 'Street / Road Luminaire',
    aliases: [
      'streetlight', 'street light', 'road light', 'road luminaire',
      'street luminaire', 'urban light', 'column head', 'lantern',
    ],
  },
  {
    type: 'pendant',
    label: 'Pendant / Suspension',
    aliases: [
      'pendant', 'suspension', 'hanging light', 'suspension luminaire',
      'hanging luminaire', 'decorative pendant',
    ],
  },
  {
    type: 'surface',
    label: 'Surface-Mount (Non-Linear)',
    aliases: [
      'surface mount', 'surface-mounted', 'bulkhead', 'oyster', 'surface luminaire',
      'surface fitting', 'ceiling surface', 'wall-mounted surface',
    ],
  },
  {
    type: 'track',
    label: 'Track Luminaire',
    aliases: [
      'track', 'track luminaire', 'track fitting', 'track head', 'track spot',
      'track system', 'monorail', 'two-circuit track', 'three-circuit track',
    ],
  },
  {
    type: 'underwater',
    label: 'Underwater / Pool Luminaire',
    aliases: [
      'underwater', 'pool light', 'submersible', 'pool luminaire',
      'underwater luminaire', 'fountain light', 'spa light',
    ],
  },
];

/** Map from any alias (lower-cased) to canonical type. */
const ALIAS_MAP = new Map<string, string>();
for (const def of LUMINAIRE_TYPES) {
  for (const alias of def.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), def.type);
  }
  ALIAS_MAP.set(def.type.toLowerCase(), def.type);
}

/** All valid canonical type strings as a flat list (for LLM prompt). */
export const CANONICAL_TYPE_LIST = LUMINAIRE_TYPES.map((t) => t.type);

/** Look up a raw classifier string → canonical type or null. */
export function resolveType(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  return ALIAS_MAP.get(lower) ?? null;
}

/** Formatted type list for inclusion in the LLM prompt. */
export const LUMINAIRE_TYPE_PROMPT_LIST = LUMINAIRE_TYPES
  .map((t) => `  - "${t.type}" — ${t.label} (e.g. ${t.aliases.slice(0, 3).join(', ')})`)
  .join('\n');
