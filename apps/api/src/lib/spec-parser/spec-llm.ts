/**
 * LLM extraction layer for consultant spec parsing.
 *
 * Single-pass: sends the spec document to Claude and asks it to identify
 * every line item, classify its luminaire type, and extract specified
 * attribute values mapped to engine attribute keys.
 *
 * What the LLM does NOT decide:
 *   - operator (gte/lte/eq/match_target_lumen etc.)  → comes from ATTR_CONFIG
 *   - gate_type (hard/soft/scored)                    → comes from ATTR_CONFIG
 *   - weight                                          → comes from ATTR_CONFIG
 *
 * The LLM only extracts VALUES and maps them to attribute keys.
 */

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSpecDocument, ExtractedSpecItem, RawExtractedAttr } from './types';
import { LUMINAIRE_TYPE_PROMPT_LIST } from './luminaire-types';

// ── Attribute key list for the prompt (non-informational + informational) ───

const MATCHING_ATTR_LIST = [
  '  ip_rating        — IP Rating (e.g. "IP44", "IP65", "IP68")',
  '  voltage          — Input voltage (e.g. "230V AC", "24V DC", "12V DC")',
  '  colour_family    — Colour family: "white", "rgb", "rgbw", or "rgbic". Infer from description if explicit.',
  '  cct              — Colour temperature in Kelvin as a plain integer (e.g. "3000", "4000")',
  '  cri              — CRI (Ra) minimum as a plain integer (e.g. "90", "80")',
  '  lumens           — Total delivered lumen output in lm, plain number (e.g. "900"). For POINT sources / luminaires (not per-metre). Use only when per-metre does NOT apply.',
  '  lumens_per_metre — Per-metre delivered lumen output in lm/m (e.g. "2000"). For FLEXIBLE TAPE / strips only.',
  '  watts            — Maximum wattage as plain number (e.g. "12"). For point/linear luminaires.',
  '  watts_per_metre  — Maximum wattage per metre (e.g. "18"). Flexible tape only.',
  '  led_per_metre    — Minimum LED density in LED/m (e.g. "168"). Flexible tape only.',
  '  max_run          — Minimum single-feed run length in metres (e.g. "8"). Flexible tape only.',
  '  beam_angle       — Beam angle in degrees as a plain number (e.g. "38"). Downlights / spots only.',
  '  efficacy         — Minimum luminous efficacy in lm/W (e.g. "80").',
  '  ik_rating        — IK impact rating (e.g. "IK08", "IK10").',
  '  surge_protection — Surge protection rating in kV (e.g. "10").',
  '  certifications   — Required marks as a comma-separated list (e.g. "CE, RoHS, Civil Defence").',
  '  dimming          — Control/dimming protocol when MANDATORY for the product (e.g. "DALI", "0-10V", "DMX"). Use ONLY when the spec requires a specific protocol as a pass/fail gate. Do not use for informational notes — use `control_type` instead.',
].join('\n');

const INFORMATIONAL_ATTR_LIST = [
  '  body_material    — Housing / body material specification (e.g. "die-cast aluminium", "white powder-coat aluminium").',
  '  finish           — Finish or colour specification (e.g. "white RAL 9016", "silver anodized", "dark grey textured").',
  '  country_of_origin — Country of origin if stated.',
  '  dimensions       — Physical dimensions or size (e.g. "1200 mm length", "ø95 mm").',
  '  corrosion_class  — Corrosion class if stated (e.g. "C5-M marine").',
  '  control_type     — Dimming or control method when informational ONLY (not a mandatory gate requirement). If the spec requires a specific protocol, use `dimming` (matching key) instead.',
  '  notes            — Any other specified requirement that does not map to the above keys.',
].join('\n');

const SYSTEM_PROMPT = `You are a technical data extraction specialist for lighting consultant specifications.

Analyse the provided lighting schedule or specification document and identify every distinct line item / luminaire type.

Return ONLY a valid JSON object — no markdown fences, no prose, no comments.
The object must have exactly one key "items" containing an array.
Each element represents one distinct line item and must have exactly these fields:

{
  "item_code":                  string   — the item reference code (e.g. "LCL-015", "TYPE-A", "01"),
  "description":                string   — the short description from the schedule,
  "luminaire_type":             string|null — canonical type from the list below, or null if uncertain,
  "luminaire_type_confidence":  number   — 0.0 to 1.0 confidence of the type classification,
  "luminaire_type_note":        string|null — explanation when type is null or confidence < 0.8,
  "source_reference":           string|null — page or section where this item appears,
  "attributes": [
    {
      "attribute_key":   string — one of the exact keys listed below,
      "value":           string — the extracted target value (see rules),
      "confidence":      number — 0.0 to 1.0,
      "source_reference": string|null
    }
  ]
}

ATTRIBUTE EXTRACTION RULES:
- Extract ONLY values that are explicitly stated in the document. Do NOT infer or guess.
- "value" must be the NUMERIC TARGET (or code) only — no operator symbols (no "≥", "≤", "~", ">", "<").
  Examples: "≥ 900 lm" → value "900"; "3000 K" → value "3000"; "IP44" → value "IP44"; "≤ 18 W/m" → value "18".
- Lumen values labelled "delivered", "after diffuser/lens", "at output" are delivered outputs. Extract the number.
- For CCT: always a plain integer in Kelvin (e.g. "3000" not "3000K").
- For CRI: plain integer minimum (e.g. "90").
- For IP: the full code including prefix (e.g. "IP44", "IP65").
- For IK: the full code (e.g. "IK08").
- For voltage: include type suffix (e.g. "230V AC", "24V DC").
- For lumens vs lumens_per_metre: use lumens_per_metre ONLY for flexible tape / LED strip items; use lumens for all other luminaire types.
- For dimming: if the spec REQUIRES a specific dimming/control protocol (e.g. "DALI-dimmable", "must support 0-10V"), use attribute_key="dimming" with the protocol name as value (e.g. "DALI", "0-10V"). If dimming is only informational, use attribute_key="control_type".
- Omit an attribute entirely if it is not explicitly stated. Do not guess.
- confidence = 1.0: verbatim from a clearly labelled table cell.
  confidence = 0.7–0.9: clearly stated in prose, minor parsing needed.
  confidence < 0.7: inferred or ambiguous.
- Omit attributes with confidence < 0.5 entirely.

LUMINAIRE TYPE CLASSIFICATION:
Map each item to exactly ONE of the following canonical types (use the string exactly as shown):
${LUMINAIRE_TYPE_PROMPT_LIST}
If the item description does not clearly match any type, set luminaire_type to null and explain in luminaire_type_note.

MATCHING ATTRIBUTE KEYS (written to matching engine):
${MATCHING_ATTR_LIST}

INFORMATIONAL ATTRIBUTE KEYS (captured for display, not matched):
${INFORMATIONAL_ATTR_LIST}

Do not invent attribute keys. Use only the exact keys listed above.
`;

// ── Coercion helpers ─────────────────────────────────────────────────────────

function coerceAttr(raw: unknown): RawExtractedAttr | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.attribute_key !== 'string' || typeof r.value !== 'string') return null;
  const confidence = typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5;
  if (confidence < 0.5) return null; // drop very low confidence
  return {
    attribute_key: r.attribute_key,
    value: r.value.trim(),
    confidence,
    source_reference: typeof r.source_reference === 'string' ? r.source_reference : null,
  };
}

function coerceItem(raw: unknown): ExtractedSpecItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.item_code !== 'string' || typeof r.description !== 'string') return null;

  const attrs: RawExtractedAttr[] = [];
  if (Array.isArray(r.attributes)) {
    for (const a of r.attributes) {
      const coerced = coerceAttr(a);
      if (coerced) attrs.push(coerced);
    }
  }

  const lumiType = typeof r.luminaire_type === 'string' ? r.luminaire_type : null;
  const lumiConf = typeof r.luminaire_type_confidence === 'number'
    ? Math.min(1, Math.max(0, r.luminaire_type_confidence))
    : (lumiType ? 0.8 : 0);
  const lumiNote = typeof r.luminaire_type_note === 'string' ? r.luminaire_type_note : null;

  return {
    item_code: r.item_code.trim(),
    description: r.description.trim(),
    luminaire_type: lumiType,
    luminaire_type_confidence: lumiConf,
    luminaire_type_note: lumiNote,
    attributes: attrs,
    source_reference: typeof r.source_reference === 'string' ? r.source_reference : null,
  };
}

// ── LLM call ─────────────────────────────────────────────────────────────────

export async function extractFromSpec(params: {
  filePath: string;
  model: string;
  itemFilter?: string[];
}): Promise<ExtractedSpecDocument> {
  const { filePath, model, itemFilter } = params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  if (!fs.existsSync(filePath)) throw new Error(`Spec file not found: ${filePath}`);

  const client = new Anthropic({ apiKey });
  const startMs = Date.now();

  const ext = filePath.toLowerCase();
  const isPdf = ext.endsWith('.pdf');

  const filterInstruction = itemFilter && itemFilter.length > 0
    ? ` Restrict extraction to items whose item_code contains any of: ${itemFilter.map((f) => `"${f}"`).join(', ')}.`
    : '';

  const userText = `Extract all line items and their specified attribute values from this lighting schedule.${filterInstruction} Return only the JSON object.`;

  type ContentBlock = Anthropic.DocumentBlockParam | Anthropic.TextBlockParam;
  const contentBlocks: ContentBlock[] = [];

  if (isPdf) {
    const pdfData = fs.readFileSync(filePath).toString('base64');
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfData },
    } as Anthropic.DocumentBlockParam);
  } else {
    // Plain text / markdown
    const text = fs.readFileSync(filePath, 'utf8');
    contentBlocks.push({ type: 'text', text: `SPEC DOCUMENT:\n\n${text}` });
  }
  contentBlocks.push({ type: 'text', text: userText });

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const elapsed_ms = Date.now() - startMs;

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error(`No text block in Anthropic response (stop_reason: ${response.stop_reason})`);

  let parsed: unknown;
  try {
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from Anthropic response: ${(err as Error).message}. ` +
      `First 800 chars: ${textBlock.text.slice(0, 800)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).items)) {
    throw new Error('Expected { items: [...] } from model');
  }

  let items: ExtractedSpecItem[] = (parsed as { items: unknown[] }).items
    .map(coerceItem)
    .filter((i): i is ExtractedSpecItem => i !== null);

  // Apply item filter if provided
  if (itemFilter && itemFilter.length > 0) {
    const filters = itemFilter.map((f) => f.toLowerCase());
    items = items.filter((i) => filters.some((f) => i.item_code.toLowerCase().includes(f)));
  }

  return {
    items,
    meta: {
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      elapsed_ms,
    },
  };
}
