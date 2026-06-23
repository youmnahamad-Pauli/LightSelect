/**
 * LLM interaction layer for catalogue ingestion.
 *
 * Single-pass: sends the full catalogue PDF to Claude once and asks it to:
 *   1. Identify every distinct product.
 *   2. Extract all standard attributes for each product.
 *
 * Brand-agnostic — no manufacturer-specific layout assumptions.
 * Uses the same @anthropic-ai/sdk and ANTHROPIC_API_KEY/.env patterns
 * as the existing per-datasheet extraction service.
 */

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { CatalogueDetectionResponse, DetectedProduct } from './types';

// ─── Attribute schema ───────────────────────────────────────────────────────
// Mirrors STANDARD_ATTRIBUTES in apps/web and apps/api/src/lib/extraction/claude.ts.
// Add new attributes here when the schema grows.

const ATTRIBUTE_DEFINITIONS = [
  { name: 'manufacturer',      label: 'Manufacturer',                    group: 'Identity'    },
  { name: 'family_name',       label: 'Product Family',                  group: 'Identity'    },
  { name: 'model_number',      label: 'Model Number / Order Code',       group: 'Identity'    },
  { name: 'description',       label: 'Description',                     group: 'Identity'    },
  { name: 'application',       label: 'Application',                     group: 'Identity'    },
  { name: 'mounting',          label: 'Mounting Type',                   group: 'Physical'    },
  { name: 'dimensions',        label: 'Dimensions',                      group: 'Physical'    },
  { name: 'weight',            label: 'Weight',                          group: 'Physical'    },
  { name: 'material',          label: 'Housing Material',                group: 'Physical'    },
  { name: 'finish',            label: 'Finish / Color',                  group: 'Physical'    },
  { name: 'lumens',            label: 'Lumens (lm)',                     group: 'Photometric' },
  { name: 'watts',             label: 'Wattage (W)',                     group: 'Photometric' },
  { name: 'efficacy',          label: 'Efficacy (lm/W)',                 group: 'Photometric' },
  { name: 'cct',               label: 'CCT (K)',                         group: 'Photometric' },
  { name: 'cri',               label: 'CRI',                             group: 'Photometric' },
  { name: 'beam_angle',        label: 'Beam Angle / Optic',              group: 'Photometric' },
  { name: 'ip_rating',         label: 'IP Rating',                       group: 'Compliance'  },
  { name: 'ik_rating',         label: 'IK Rating',                       group: 'Compliance'  },
  { name: 'certifications',    label: 'Certifications',                  group: 'Compliance'  },
  { name: 'voltage',           label: 'Input Voltage',                   group: 'Electrical'  },
  { name: 'dimming',           label: 'Dimming / Driver',                group: 'Electrical'  },
  { name: 'operating_temp',    label: 'Operating Temperature',           group: 'Electrical'  },
  { name: 'lifetime_hours',    label: 'Lifetime (hours)',                group: 'Performance' },
  { name: 'warranty',          label: 'Warranty',                        group: 'Performance' },
  { name: 'accessories',       label: 'Accessories',                     group: 'Performance' },
  { name: 'notes',             label: 'Notes',                           group: 'Performance' },
  // v3 flexible-strip attributes
  { name: 'watts_per_metre',   label: 'Wattage per metre (W/m)',         group: 'Flexible'    },
  { name: 'lumens_per_metre',  label: 'Lumens per metre (lm/m)',         group: 'Flexible'    },
  { name: 'led_per_metre',     label: 'LED density (LED/m)',             group: 'Flexible'    },
  { name: 'cut_interval',      label: 'Cut interval',                    group: 'Flexible'    },
  { name: 'max_run',           label: 'Max run length',                  group: 'Flexible'    },
  { name: 'bend_plane',        label: 'Bend plane',                      group: 'Flexible'    },
  { name: 'min_bend_radius',   label: 'Min bend radius',                 group: 'Flexible'    },
  { name: 'colour_mode',       label: 'Colour mode',                     group: 'Electrical'  },
  { name: 'addressability',    label: 'Addressability (static/pixel)',   group: 'Electrical'  },
  { name: 'pixel_protocol',    label: 'Pixel protocol (SPI/DMX)',        group: 'Electrical'  },
  { name: 'wash_optic',           label: 'Wash / graze / flood optic',                 group: 'Photometric' },
  { name: 'high_temp_variant',    label: 'High-temp variant',                          group: 'Performance' },
  // Informational only — NEVER read by the matching engine
  { name: 'series_cct_options',   label: 'Series available CCTs (informational list)', group: 'Informational' },
] as const;

export const VALID_ATTRIBUTE_NAMES = new Set<string>(ATTRIBUTE_DEFINITIONS.map((a) => a.name));

const ATTRIBUTE_LIST = ATTRIBUTE_DEFINITIONS
  .map((a) => `  - ${a.name} (${a.group}): ${a.label}`)
  .join('\n');

// ─── Prompt ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a technical data extraction specialist for lighting product catalogues.

Analyse the provided lighting catalogue PDF and identify every distinct product SKU.

Return ONLY a valid JSON object — no markdown fences, no prose, no comments.
The object must have exactly one key "products" containing an array.
Each element represents one distinct SKU and must have exactly these fields:

{
  "manufacturer":  string   — brand or manufacturer name as printed in the catalogue,
  "model_code":    string|null — the primary order code or model number; null if not present,
  "product_name":  string   — short descriptive name for this product,
  "pages":         [number, number] — 1-indexed first and last page where this product appears,
  "attributes":    object   — mapping of attribute_name → {
                                "value":             string,
                                "source_locator":    string|null,
                                "resolution_method": "table_read"|"legend_decoded"|"inferred_flagged",
                                "needs_review":      boolean,
                                "confidence":        number
                              }
}

For "attributes":
- Include ONLY attributes whose values you can locate in this document. Do not use training knowledge to fill in values.
- "value": the extracted value as a string.
- "source_locator": a precise pointer to where in the document you read this value.
    Examples: "page 4, specification table, row WKL 3020, column CCT"
              "page 2, order-code key: '30 = 3000K'"
              "page 1, document header"
    Use null only for document-level fields (e.g. manufacturer name on cover page).
- "resolution_method": how the value was determined:
    "table_read"        — read verbatim from an explicit table cell, row, or labelled spec entry in this document.
    "legend_decoded"    — decoded from a model-code legend THAT IS PRINTED IN THIS DOCUMENT and
                          whose relevant entry you can quote exactly in source_locator.
    "inferred_flagged"  — you have a plausible value but cannot point to an explicit source in this
                          document. Set needs_review: true. Use sparingly — prefer omitting the attribute.
- "needs_review": true when resolution_method is "inferred_flagged"; false otherwise.
- "confidence": 0.0 (uncertain) to 1.0 (verbatim, unambiguous). Set ≤ 0.5 when needs_review is true.
- Omit an attribute entirely when you cannot locate it in the document — do not emit it as inferred_flagged
  unless you have a plausible value worth flagging for human review.
- If a per-metre value is given (e.g. for LED strips), use watts_per_metre and lumens_per_metre rather than watts and lumens.
- Do not invent attribute names. Only use the names listed below.

CRITICAL RULE — cct (colour temperature of THIS specific SKU):
  A single SKU has exactly ONE colour temperature. You MUST resolve cct to a single integer in Kelvin.
  Resolution order (use the first that applies):
    1. The specification table or datasheet row for this exact SKU lists a single CCT → use that number.
       Set resolution_method = "table_read". Set source_locator to the exact table reference, e.g.
       "page 4, specification table, row WKL 3020, column CCT".
    2. This catalogue prints an order-code legend or key AND that legend entry is visible in this
       document (e.g. a row "30 = 3000K" or key "3020 = 3000K, 20W") → decode the CCT from THIS
       SKU's model code using ONLY that printed legend. Quote the exact legend entry in source_locator.
       Set resolution_method = "legend_decoded".
    3. If neither applies — DO NOT emit a cct value at all. Do not use training knowledge of
       naming conventions or common order-code patterns. Omit cct rather than guess.
  NEVER assign the product family's full list of available CCTs to an individual SKU's cct attribute.
  That list belongs in series_cct_options (informational only — see below).
  Output format for cct: a plain integer or integer string, e.g. "3000" not "3000K" not "2700K, 3000K".

CRITICAL RULE — series_cct_options (informational, NOT read by matching):
  Use this attribute to record the family's full available-CCT menu as a comma-separated list.
  e.g. "2700, 3000, 4000" or "2700K, 3000K, 4000K, 5000K". This is for browsing/reference only.

CRITICAL RULE — lumens_per_metre (output of THIS specific SKU):
  Extract THIS SKU's own lm/m from its specific row in the specification table.
  If the SKU's own row gives a single figure, use that. If it gives a genuine binning tolerance
  for that one SKU (e.g. "2050–2150 lm/m"), use that tight range.
  Do NOT record a span that mixes different SKUs (e.g. "1500–3500 lm/m" across the whole range).
  If you cannot determine this SKU's own lm/m separately from the family range, omit the attribute.

Valid attribute names:
${ATTRIBUTE_LIST}

Products to detect: every item that has its own model code, order code, or distinct specification row.
Different CCT or wattage options with separate model codes must each be a separate product entry.`;

// ─── LLM client ────────────────────────────────────────────────────────────

interface RawProductItem {
  manufacturer: unknown;
  model_code: unknown;
  product_name: unknown;
  pages: unknown;
  attributes: unknown;
}

function coerceProduct(raw: RawProductItem): DetectedProduct | null {
  if (
    typeof raw.manufacturer !== 'string' ||
    typeof raw.product_name !== 'string' ||
    !Array.isArray(raw.pages) || raw.pages.length < 2
  ) {
    return null;
  }

  const rawAttrs = typeof raw.attributes === 'object' && raw.attributes !== null
    ? raw.attributes as Record<string, unknown>
    : {};

  const VALID_METHODS = ['table_read', 'legend_decoded', 'inferred_flagged'] as const;
  type ResolutionMethod = (typeof VALID_METHODS)[number];

  const attributes: DetectedProduct['attributes'] = {};
  for (const [key, val] of Object.entries(rawAttrs)) {
    if (!VALID_ATTRIBUTE_NAMES.has(key)) continue;
    if (typeof val !== 'object' || val === null) continue;
    const v = val as Record<string, unknown>;
    if (typeof v.value !== 'string' || typeof v.confidence !== 'number') continue;
    const resolution_method: ResolutionMethod =
      typeof v.resolution_method === 'string' &&
      (VALID_METHODS as readonly string[]).includes(v.resolution_method)
        ? (v.resolution_method as ResolutionMethod)
        : 'table_read';
    attributes[key] = {
      value: v.value,
      confidence: Math.min(1, Math.max(0, v.confidence)),
      source_locator: typeof v.source_locator === 'string' ? v.source_locator : null,
      resolution_method,
      needs_review: resolution_method === 'inferred_flagged' || v.needs_review === true,
    };
  }

  return {
    manufacturer: raw.manufacturer,
    model_code: typeof raw.model_code === 'string' ? raw.model_code : null,
    product_name: raw.product_name,
    pages: [Number(raw.pages[0]), Number(raw.pages[1])],
    attributes,
  };
}

export async function detectAndExtractFromCatalogue(params: {
  pdfPath: string;
  model: string;
  modelFilter?: string[];
}): Promise<CatalogueDetectionResponse> {
  const { pdfPath, model, modelFilter } = params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to apps/api/.env.');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Catalogue PDF not found: ${pdfPath}`);
  }

  const pdfData = fs.readFileSync(pdfPath).toString('base64');

  const client = new Anthropic({ apiKey });
  const startMs = Date.now();

  const filterInstruction = modelFilter && modelFilter.length > 0
    ? ` Restrict extraction to products whose model code contains any of: ${modelFilter.map((f) => `"${f}"`).join(', ')}. Skip all other products.`
    : '';

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfData,
            },
          } as Anthropic.DocumentBlockParam,
          {
            type: 'text',
            text: `Extract all products and their attributes from this lighting catalogue. Return only the JSON object.${filterInstruction}`,
          },
        ],
      },
    ],
  });

  const elapsed_ms = Date.now() - startMs;

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) {
    throw new Error(`No text block in Anthropic response (stop_reason: ${response.stop_reason})`);
  }

  let parsed: unknown;
  try {
    // Strip markdown fences if the model included them despite instructions
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from Anthropic response: ${(err as Error).message}. ` +
      `First 800 chars: ${textBlock.text.slice(0, 800)}`,
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).products)
  ) {
    throw new Error('Expected { products: [...] } from model');
  }

  const rawProducts = (parsed as { products: unknown[] }).products;
  let products: DetectedProduct[] = rawProducts
    .map((p) => coerceProduct(p as RawProductItem))
    .filter((p): p is DetectedProduct => p !== null);

  // Apply model filter if provided
  if (modelFilter && modelFilter.length > 0) {
    const filters = modelFilter.map((f) => f.toLowerCase());
    products = products.filter((p) =>
      p.model_code !== null &&
      filters.some((f) => p.model_code!.toLowerCase().includes(f)),
    );
  }

  return {
    products,
    meta: {
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      elapsed_ms,
    },
  };
}
