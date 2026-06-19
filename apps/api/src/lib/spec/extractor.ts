/**
 * Spec extraction service — extracts structured requirements from a spec document.
 *
 * StubSpecExtractor generates deterministic realistic requirements seeded by spec document ID.
 * Replace with a real parser by swapping the factory in extractor/index.ts.
 */

export interface ExtractedRequirement {
  section_name: string | null;
  requirement_group: string;
  attribute_key: string;
  attribute_label: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  tolerance_value: string | null;
  tolerance_unit: string | null;
  priority: 'mandatory' | 'preferred' | 'optional';
  source_reference: string | null;
  sort_order: number;
}

export interface SpecExtractorService {
  readonly name: string;
  extract(params: {
    specDocumentId: string;
    filePath: string | null;
    mimeType: string | null;
  }): Promise<ExtractedRequirement[]>;
}

// ─── Stub requirement templates ────────────────────────────────────────────

type ReqTemplate = Omit<ExtractedRequirement, 'sort_order' | 'source_reference'> & {
  variants: { target_value: string; target_unit?: string }[];
};

const REQUIREMENT_TEMPLATES: ReqTemplate[] = [
  {
    section_name: 'Section 3 — Luminaire Performance',
    requirement_group: 'Photometric',
    attribute_key: 'lumens',
    attribute_label: 'Minimum Lumen Output',
    operator: 'gte',
    target_value: '',
    target_unit: 'lm',
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '5000' }, { target_value: '7000' }, { target_value: '10000' }, { target_value: '4000' }],
  },
  {
    section_name: 'Section 3 — Luminaire Performance',
    requirement_group: 'Photometric',
    attribute_key: 'efficacy',
    attribute_label: 'Minimum Luminous Efficacy',
    operator: 'gte',
    target_value: '',
    target_unit: 'lm/W',
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '80' }, { target_value: '100' }, { target_value: '90' }, { target_value: '110' }],
  },
  {
    section_name: 'Section 3 — Luminaire Performance',
    requirement_group: 'Photometric',
    attribute_key: 'cct',
    attribute_label: 'Correlated Colour Temperature',
    operator: 'eq',
    target_value: '',
    target_unit: 'K',
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '4000' }, { target_value: '3000' }, { target_value: '5700' }, { target_value: '4000' }],
  },
  {
    section_name: 'Section 3 — Luminaire Performance',
    requirement_group: 'Photometric',
    attribute_key: 'cri',
    attribute_label: 'Colour Rendering Index',
    operator: 'gte',
    target_value: '',
    target_unit: null,
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '80' }, { target_value: '70' }, { target_value: '80' }, { target_value: '90' }],
  },
  {
    section_name: 'Section 4 — Environmental Protection',
    requirement_group: 'Compliance',
    attribute_key: 'ip_rating',
    attribute_label: 'Ingress Protection Rating',
    operator: 'gte',
    target_value: '',
    target_unit: null,
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: 'IP65' }, { target_value: 'IP66' }, { target_value: 'IP67' }, { target_value: 'IP65' }],
  },
  {
    section_name: 'Section 4 — Environmental Protection',
    requirement_group: 'Compliance',
    attribute_key: 'ik_rating',
    attribute_label: 'Impact Protection Rating',
    operator: 'gte',
    target_value: '',
    target_unit: null,
    tolerance_value: null, tolerance_unit: null,
    priority: 'preferred',
    variants: [{ target_value: 'IK08' }, { target_value: 'IK10' }, { target_value: 'IK08' }, { target_value: 'IK09' }],
  },
  {
    section_name: 'Section 5 — Electrical',
    requirement_group: 'Electrical',
    attribute_key: 'voltage',
    attribute_label: 'Supply Voltage',
    operator: 'contains',
    target_value: '',
    target_unit: 'V',
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '220' }, { target_value: '240' }, { target_value: '230' }, { target_value: '220' }],
  },
  {
    section_name: 'Section 5 — Electrical',
    requirement_group: 'Electrical',
    attribute_key: 'dimming',
    attribute_label: 'Dimming Protocol',
    operator: 'contains',
    target_value: '',
    target_unit: null,
    tolerance_value: null, tolerance_unit: null,
    priority: 'preferred',
    variants: [{ target_value: 'DALI' }, { target_value: '1-10V' }, { target_value: 'DALI-2' }, { target_value: 'DALI' }],
  },
  {
    section_name: 'Section 6 — Lifetime and Warranty',
    requirement_group: 'Performance',
    attribute_key: 'lifetime_hours',
    attribute_label: 'Minimum Rated Lifetime',
    operator: 'gte',
    target_value: '',
    target_unit: 'h',
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: '50000' }, { target_value: '75000' }, { target_value: '100000' }, { target_value: '50000' }],
  },
  {
    section_name: 'Section 6 — Lifetime and Warranty',
    requirement_group: 'Performance',
    attribute_key: 'warranty',
    attribute_label: 'Minimum Warranty Period',
    operator: 'gte',
    target_value: '',
    target_unit: 'years',
    tolerance_value: null, tolerance_unit: null,
    priority: 'preferred',
    variants: [{ target_value: '5' }, { target_value: '3' }, { target_value: '5' }, { target_value: '7' }],
  },
  {
    section_name: 'Section 4 — Environmental Protection',
    requirement_group: 'Compliance',
    attribute_key: 'certifications',
    attribute_label: 'Required Certifications',
    operator: 'contains',
    target_value: '',
    target_unit: null,
    tolerance_value: null, tolerance_unit: null,
    priority: 'mandatory',
    variants: [{ target_value: 'CE' }, { target_value: 'CE, RoHS' }, { target_value: 'CE' }, { target_value: 'CE, CB' }],
  },
  {
    section_name: 'Section 5 — Electrical',
    requirement_group: 'Electrical',
    attribute_key: 'operating_temp',
    attribute_label: 'Operating Temperature Range',
    operator: 'contains',
    target_value: '',
    target_unit: '°C',
    tolerance_value: null, tolerance_unit: null,
    priority: 'optional',
    variants: [{ target_value: '-20' }, { target_value: '-40' }, { target_value: '-20' }, { target_value: '-30' }],
  },
];

// ─── Deterministic seed helper ─────────────────────────────────────────────

function drng(seed: string, salt: number): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = (Math.imul(31, h) + salt) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

// ─── StubSpecExtractor ─────────────────────────────────────────────────────

export class StubSpecExtractor implements SpecExtractorService {
  readonly name = 'stub';

  async extract(params: { specDocumentId: string }): Promise<ExtractedRequirement[]> {
    const { specDocumentId } = params;

    const results: ExtractedRequirement[] = [];
    let sortOrder = 0;

    for (let i = 0; i < REQUIREMENT_TEMPLATES.length; i++) {
      const tmpl = REQUIREMENT_TEMPLATES[i];
      const rand = drng(specDocumentId, i + 1);

      // Optional requirements: 60% chance of appearing
      if (tmpl.priority === 'optional' && rand > 0.6) continue;
      // Preferred: 85% chance
      if (tmpl.priority === 'preferred' && rand > 0.85) continue;

      const variantIdx = Math.floor(drng(specDocumentId, i + 100) * tmpl.variants.length);
      const variant = tmpl.variants[variantIdx];

      results.push({
        section_name: tmpl.section_name,
        requirement_group: tmpl.requirement_group,
        attribute_key: tmpl.attribute_key,
        attribute_label: tmpl.attribute_label,
        operator: tmpl.operator,
        target_value: variant.target_value,
        target_unit: variant.target_unit ?? tmpl.target_unit,
        tolerance_value: tmpl.tolerance_value,
        tolerance_unit: tmpl.tolerance_unit,
        priority: tmpl.priority,
        source_reference: `Extracted from page ${Math.ceil(drng(specDocumentId, i + 200) * 12 + 1)}`,
        sort_order: sortOrder++,
      });
    }

    return results;
  }
}

let _extractor: SpecExtractorService | null = null;
export function getSpecExtractor(): SpecExtractorService {
  if (!_extractor) _extractor = new StubSpecExtractor();
  return _extractor;
}
