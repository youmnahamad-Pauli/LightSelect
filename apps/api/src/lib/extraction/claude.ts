import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractionService, ExtractionResult, ExtractedAttribute } from './service';

// Mirrors STANDARD_ATTRIBUTES in apps/web/src/components/products/AttributeEditor.tsx
const ATTRIBUTE_DEFINITIONS = [
  { name: 'manufacturer',   label: 'Manufacturer',           group: 'Identity'    },
  { name: 'family_name',    label: 'Product Family',         group: 'Identity'    },
  { name: 'model_number',   label: 'Model Number',           group: 'Identity'    },
  { name: 'description',    label: 'Description',            group: 'Identity'    },
  { name: 'application',    label: 'Application',            group: 'Identity'    },
  { name: 'mounting',       label: 'Mounting Type',          group: 'Physical'    },
  { name: 'dimensions',     label: 'Dimensions',             group: 'Physical'    },
  { name: 'weight',         label: 'Weight',                 group: 'Physical'    },
  { name: 'material',       label: 'Housing Material',       group: 'Physical'    },
  { name: 'finish',         label: 'Finish / Color',         group: 'Physical'    },
  { name: 'lumens',         label: 'Lumens (lm)',            group: 'Photometric' },
  { name: 'watts',          label: 'Wattage (W)',            group: 'Photometric' },
  { name: 'efficacy',       label: 'Efficacy (lm/W)',        group: 'Photometric' },
  { name: 'cct',            label: 'CCT (K)',                group: 'Photometric' },
  { name: 'cri',            label: 'CRI',                    group: 'Photometric' },
  { name: 'beam_angle',     label: 'Beam Angle / Optic',     group: 'Photometric' },
  { name: 'ip_rating',      label: 'IP Rating',              group: 'Compliance'  },
  { name: 'ik_rating',      label: 'IK Rating',              group: 'Compliance'  },
  { name: 'certifications', label: 'Certifications',         group: 'Compliance'  },
  { name: 'voltage',        label: 'Input Voltage',          group: 'Electrical'  },
  { name: 'dimming',        label: 'Dimming / Driver',       group: 'Electrical'  },
  { name: 'operating_temp', label: 'Operating Temperature',  group: 'Electrical'  },
  { name: 'lifetime_hours',    label: 'Lifetime (hours)',               group: 'Performance' },
  { name: 'warranty',          label: 'Warranty',                       group: 'Performance' },
  { name: 'accessories',       label: 'Accessories',                    group: 'Performance' },
  { name: 'notes',             label: 'Notes',                          group: 'Performance' },
  // v3 additions
  { name: 'watts_per_metre',   label: 'Wattage per metre (W/m)',        group: 'Flexible'    },
  { name: 'lumens_per_metre',  label: 'Lumens per metre (lm/m)',        group: 'Flexible'    },
  { name: 'led_per_metre',     label: 'LED density (LED/m)',            group: 'Flexible'    },
  { name: 'cut_interval',      label: 'Cut interval',                   group: 'Flexible'    },
  { name: 'max_run',           label: 'Max run length',                 group: 'Flexible'    },
  { name: 'bend_plane',        label: 'Bend plane',                     group: 'Flexible'    },
  { name: 'min_bend_radius',   label: 'Min bend radius',                group: 'Flexible'    },
  { name: 'colour_mode',       label: 'Colour mode',                    group: 'Electrical'  },
  { name: 'addressability',    label: 'Addressability (static/pixel)',  group: 'Electrical'  },
  { name: 'pixel_protocol',    label: 'Pixel protocol (SPI/DMX)',       group: 'Electrical'  },
  { name: 'wash_optic',        label: 'Wash / graze / flood optic',     group: 'Photometric' },
  { name: 'high_temp_variant', label: 'High-temp variant',              group: 'Performance' },
] as const;

type AttributeName = (typeof ATTRIBUTE_DEFINITIONS)[number]['name'];
const VALID_NAMES = new Set<string>(ATTRIBUTE_DEFINITIONS.map((a) => a.name));

const ATTRIBUTE_LIST = ATTRIBUTE_DEFINITIONS.map(
  (a) => `- ${a.name} (${a.group}): ${a.label}`,
).join('\n');

const SYSTEM_PROMPT = `You are a technical data extraction specialist for lighting products.
Extract attribute values from the provided manufacturer datasheet PDF.

Return ONLY a valid JSON array — no markdown fences, no prose, no other text.
Each element must have exactly three fields:
  "attribute_name"  — one of the exact names listed below
  "attribute_value" — the extracted value as a string (include units where present, e.g. "4000 K", "IP66", "100 W")
  "confidence"      — a number from 0.0 (uncertain) to 1.0 (clearly and unambiguously stated)

Rules:
- OMIT any attribute that is not explicitly stated in the document. Do not infer or guess.
- Do not invent attribute names. Only use the names listed below.
- If the same attribute appears multiple times (e.g. multiple lumen variants), use the primary / headline value.

Attributes to extract (use the exact attribute_name string):
${ATTRIBUTE_LIST}

Example output format (your output must be ONLY this array, nothing else):
[
  {"attribute_name": "manufacturer", "attribute_value": "Acme Lighting", "confidence": 0.98},
  {"attribute_name": "lumens", "attribute_value": "5000 lm", "confidence": 0.95}
]`;

interface RawItem {
  attribute_name: string;
  attribute_value: string;
  confidence: number;
}

export class ClaudeExtractionService implements ExtractionService {
  readonly name = 'claude';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required when EXTRACTION_ENGINE=claude. ' +
        'Add it to apps/api/.env.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.EXTRACTION_MODEL ?? 'claude-sonnet-4-6';
  }

  async extract(params: {
    fileId: string;
    filePath: string | null;
    mimeType: string | null;
  }): Promise<ExtractionResult> {
    const { fileId, filePath, mimeType } = params;

    if (!filePath) {
      throw new Error(
        'Claude extraction requires a local file path. ' +
        'S3-stored files are not yet supported — use STORAGE_DRIVER=local, ' +
        'or download the file before triggering extraction.',
      );
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on disk: ${filePath}`);
    }

    const pdfData = fs.readFileSync(filePath).toString('base64');
    const startMs = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            // PDF document block — GA, no beta header required
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
              text: 'Extract the lighting product attributes from this datasheet and return only the JSON array.',
            },
          ],
        },
      ],
    });

    const elapsedMs = Date.now() - startMs;

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      throw new Error(
        `Anthropic API returned no text content (stop_reason: ${response.stop_reason})`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text.trim());
    } catch (err) {
      throw new Error(
        `Failed to parse JSON from Anthropic response: ${(err as Error).message}. ` +
        `First 500 chars: ${textBlock.text.slice(0, 500)}`,
      );
    }

    if (!Array.isArray(raw)) {
      throw new Error(`Expected JSON array from model, got ${typeof raw}`);
    }

    const attributes: ExtractedAttribute[] = [];
    const rawFields: Record<string, unknown> = {};

    for (const item of raw as RawItem[]) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.attribute_name !== 'string' ||
        typeof item.attribute_value !== 'string' ||
        typeof item.confidence !== 'number'
      ) {
        continue;
      }

      if (!VALID_NAMES.has(item.attribute_name)) {
        continue; // model hallucinated an unknown attribute name — skip
      }

      const confidence = Math.min(1, Math.max(0, item.confidence));

      attributes.push({
        attribute_name: item.attribute_name as AttributeName,
        attribute_value: item.attribute_value,
        confidence_score: parseFloat(confidence.toFixed(3)),
      });

      rawFields[item.attribute_name] = {
        value: item.attribute_value,
        confidence: item.confidence,
      };
    }

    return {
      attributes,
      raw_output: {
        parser: 'claude',
        model: this.model,
        file_id: fileId,
        mime_type: mimeType,
        fields: rawFields,
        extraction_time_ms: elapsedMs,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
