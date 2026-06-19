import type { ExtractionService, ExtractionResult, ExtractedAttribute } from './service';

/**
 * StubExtractionService — deterministic mock extraction for development.
 *
 * Simulates a real PDF attribute parser by:
 * - Returning realistic lighting product attribute values
 * - Varying which attributes are "found" per file (~70% coverage)
 * - Varying confidence scores per attribute type
 * - Being fully deterministic given the same fileId
 *
 * Replace with a real parser by swapping the factory in extraction/index.ts.
 */

// ─── Mock value tables ─────────────────────────────────────────────────────

type MockEntry = { value: string; confidence: number };

const MOCK_VALUES: Record<string, MockEntry[]> = {
  manufacturer: [
    { value: 'Signify', confidence: 0.95 },
    { value: 'Feilo Sylvania', confidence: 0.92 },
    { value: 'Thorn Lighting', confidence: 0.90 },
    { value: 'Disano', confidence: 0.88 },
    { value: 'Ansell Lighting', confidence: 0.86 },
  ],
  family_name: [
    { value: 'GreenVision Xceed', confidence: 0.85 },
    { value: 'Coreline', confidence: 0.82 },
    { value: 'SportStar', confidence: 0.80 },
    { value: 'BrightDrive', confidence: 0.78 },
  ],
  model_number: [
    { value: 'BRP381 LED140/NW', confidence: 0.92 },
    { value: 'RC127V W60L60', confidence: 0.88 },
    { value: 'WT120C LED40S/840', confidence: 0.90 },
    { value: 'BY471P LED300S/840', confidence: 0.85 },
  ],
  lumens: [
    { value: '7000 lm', confidence: 0.90 },
    { value: '10000 lm', confidence: 0.88 },
    { value: '4500 lm', confidence: 0.85 },
    { value: '15000 lm', confidence: 0.87 },
    { value: '3200 lm', confidence: 0.82 },
  ],
  watts: [
    { value: '65 W', confidence: 0.92 },
    { value: '100 W', confidence: 0.90 },
    { value: '42 W', confidence: 0.88 },
    { value: '150 W', confidence: 0.85 },
    { value: '28 W', confidence: 0.91 },
  ],
  efficacy: [
    { value: '107 lm/W', confidence: 0.72 },
    { value: '130 lm/W', confidence: 0.70 },
    { value: '95 lm/W', confidence: 0.68 },
  ],
  cct: [
    { value: '4000 K', confidence: 0.92 },
    { value: '3000 K', confidence: 0.90 },
    { value: '5700 K', confidence: 0.88 },
    { value: '2700 K', confidence: 0.85 },
  ],
  cri: [
    { value: 'Ra ≥ 70', confidence: 0.82 },
    { value: 'Ra ≥ 80', confidence: 0.85 },
    { value: 'Ra 70', confidence: 0.78 },
    { value: 'Ra 80', confidence: 0.80 },
  ],
  ip_rating: [
    { value: 'IP66', confidence: 0.96 },
    { value: 'IP65', confidence: 0.94 },
    { value: 'IP67', confidence: 0.92 },
    { value: 'IP20', confidence: 0.95 },
    { value: 'IP44', confidence: 0.90 },
  ],
  ik_rating: [
    { value: 'IK08', confidence: 0.78 },
    { value: 'IK10', confidence: 0.80 },
    { value: 'IK06', confidence: 0.75 },
  ],
  voltage: [
    { value: '220–240 V AC, 50/60 Hz', confidence: 0.90 },
    { value: '100–277 V', confidence: 0.88 },
    { value: '240 V AC', confidence: 0.85 },
  ],
  dimming: [
    { value: 'DALI', confidence: 0.82 },
    { value: '1–10 V', confidence: 0.78 },
    { value: 'PWM', confidence: 0.72 },
    { value: 'Non-dimmable', confidence: 0.88 },
    { value: 'DALI-2', confidence: 0.80 },
  ],
  mounting: [
    { value: 'Surface mount', confidence: 0.78 },
    { value: 'Recessed', confidence: 0.80 },
    { value: 'Post top', confidence: 0.75 },
    { value: 'Pendant', confidence: 0.82 },
    { value: 'Wall bracket', confidence: 0.76 },
  ],
  dimensions: [
    { value: '395 × 395 × 88 mm', confidence: 0.70 },
    { value: 'Ø 250 mm, H 100 mm', confidence: 0.68 },
    { value: '600 × 600 mm', confidence: 0.75 },
  ],
  material: [
    { value: 'Die-cast aluminium', confidence: 0.72 },
    { value: 'Polycarbonate', confidence: 0.75 },
    { value: 'Powder-coated steel', confidence: 0.68 },
  ],
  operating_temp: [
    { value: '-40 °C to +50 °C', confidence: 0.85 },
    { value: '-20 °C to +40 °C', confidence: 0.82 },
    { value: '0 °C to +35 °C', confidence: 0.80 },
  ],
  lifetime_hours: [
    { value: '100 000 h (L80B10)', confidence: 0.88 },
    { value: '50 000 h (L70B50)', confidence: 0.85 },
    { value: '75 000 h (L80B10)', confidence: 0.82 },
  ],
  certifications: [
    { value: 'CE, ENEC, RoHS', confidence: 0.80 },
    { value: 'CE, RoHS', confidence: 0.82 },
    { value: 'CE, CB, RoHS', confidence: 0.78 },
  ],
  application: [
    { value: 'Street lighting, urban roads', confidence: 0.72 },
    { value: 'Office and commercial', confidence: 0.75 },
    { value: 'Industrial high bay', confidence: 0.70 },
    { value: 'Sports lighting', confidence: 0.68 },
  ],
  beam_angle: [
    { value: '60°', confidence: 0.75 },
    { value: '90° × 90°', confidence: 0.72 },
    { value: '120°', confidence: 0.78 },
    { value: 'Type II Medium', confidence: 0.65 },
  ],
  description: [
    { value: 'LED street luminaire for urban roads and collector streets', confidence: 0.60 },
    { value: 'Surface-mounted LED panel for office and commercial environments', confidence: 0.58 },
    { value: 'High-bay LED luminaire for industrial applications', confidence: 0.62 },
  ],
};

// Attributes that are almost never extracted from PDFs (user must enter manually)
const RARELY_EXTRACTED = new Set(['warranty', 'accessories', 'notes', 'finish', 'weight']);

// Attributes that are sometimes missed depending on the document quality
const SOMETIMES_MISSED = new Set([
  'efficacy', 'ik_rating', 'description', 'application',
  'beam_angle', 'dimensions', 'material',
]);

// ─── Deterministic pseudo-random helper ────────────────────────────────────

function drng(seed: string, salt: number): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = (Math.imul(31, h) + salt) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

// ─── StubExtractionService ─────────────────────────────────────────────────

export class StubExtractionService implements ExtractionService {
  readonly name = 'stub';

  async extract(params: {
    fileId: string;
    filePath: string | null;
    mimeType: string | null;
  }): Promise<{ attributes: ExtractedAttribute[]; raw_output: Record<string, unknown> }> {
    const { fileId, mimeType } = params;

    // PDF files get better extraction quality
    const isPdf = mimeType === 'application/pdf' || mimeType?.includes('pdf');
    const extractionQuality = isPdf ? 0.85 : 0.65;

    const attributes: ExtractedAttribute[] = [];
    const rawFields: Record<string, unknown> = {};

    let salt = 0;
    for (const name of Object.keys(MOCK_VALUES)) {
      salt++;
      const rand = drng(fileId, salt);

      // Skip rarely-extracted fields entirely
      if (RARELY_EXTRACTED.has(name)) continue;

      // Sometimes-missed fields: skip ~40% of the time
      if (SOMETIMES_MISSED.has(name) && rand < 0.4) continue;

      // Low-quality extraction misses more fields
      if (rand > extractionQuality + drng(fileId, salt + 1000) * 0.2) continue;

      // Pick a value from the mock table
      const options = MOCK_VALUES[name];
      if (!options || options.length === 0) continue;
      const idx = Math.floor(drng(fileId, salt + 2000) * options.length);
      const entry = options[idx];

      // Add a small noise to confidence to avoid all values being identical
      const noise = (drng(fileId, salt + 3000) - 0.5) * 0.06;
      const confidence = Math.min(1, Math.max(0.5, entry.confidence + noise));

      attributes.push({
        attribute_name: name,
        attribute_value: entry.value,
        confidence_score: parseFloat(confidence.toFixed(3)),
      });

      rawFields[name] = {
        raw_text: `[Parsed from PDF page ${Math.ceil(drng(fileId, salt + 4000) * 8)}]`,
        value: entry.value,
        confidence: confidence,
      };
    }

    return {
      attributes,
      raw_output: {
        parser: 'stub',
        file_id: fileId,
        mime_type: mimeType,
        fields: rawFields,
        total_pages: Math.ceil(drng(fileId, 9999) * 8 + 2),
        extraction_time_ms: Math.round(drng(fileId, 8888) * 800 + 200),
      },
    };
  }
}
