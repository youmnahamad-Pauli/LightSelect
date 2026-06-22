/**
 * Maps LLM-extracted spec items through the locked ATTR_CONFIG to produce
 * MappedSpecItem objects ready for DB write.
 *
 * What this module does:
 *   - Validates each extracted attribute_key against ATTR_CONFIG.
 *   - Separates matchable attrs from informational attrs.
 *   - Applies operator / gate_type / weight from the locked config.
 *   - Flags low-confidence values and unknown keys (never infers or silently drops).
 *   - Resolves the luminaire_type through LUMINAIRE_TYPES.
 *
 * What this module does NOT do:
 *   - Infer missing values.
 *   - Change operators or weights.
 *   - Re-classify luminaire types beyond the LLM output.
 */

import { ATTR_CONFIG } from './attr-config';
import { CANONICAL_TYPE_LIST } from './luminaire-types';
import type {
  ExtractedSpecItem, ExtractedSpecDocument,
  MappedSpecItem, MappedAttr, InformationalAttr,
} from './types';

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function mapSpecItem(item: ExtractedSpecItem): MappedSpecItem {
  const matchableAttrs: MappedAttr[] = [];
  const informationalAttrs: InformationalAttr[] = [];
  const unknownKeys: string[] = [];
  const lowConfidenceFlags: string[] = [];

  for (const rawAttr of item.attributes) {
    const config = ATTR_CONFIG[rawAttr.attribute_key];

    if (!config) {
      unknownKeys.push(rawAttr.attribute_key);
      continue;
    }

    if (rawAttr.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidenceFlags.push(`${rawAttr.attribute_key} (conf=${rawAttr.confidence.toFixed(2)})`);
      // Still process the value but flag it
    }

    const provenanceNote = rawAttr.confidence < LOW_CONFIDENCE_THRESHOLD
      ? `[LOW CONFIDENCE ${rawAttr.confidence.toFixed(2)}] `
      : '';
    const sourceNote = rawAttr.source_reference ? ` Source: ${rawAttr.source_reference}.` : '';
    const notes = `${provenanceNote}extracted from spec.${sourceNote}`;

    if (config.informational) {
      informationalAttrs.push({
        key: config.key,
        label: config.label,
        value: rawAttr.value,
      });
    } else {
      matchableAttrs.push({
        attribute_key: config.key,
        operator: config.operator,
        target_value: rawAttr.value,
        target_unit: config.target_unit,
        gate_type: config.gate_type,
        weight: config.weight,
        notes,
      });
    }
  }

  // Validate luminaire_type against canonical list
  const canonicalType = item.luminaire_type && CANONICAL_TYPE_LIST.includes(item.luminaire_type)
    ? item.luminaire_type
    : null;

  if (item.luminaire_type && !canonicalType) {
    // LLM returned an unrecognised type string
    unknownKeys.push(`luminaire_type:${item.luminaire_type}`);
  }

  return {
    item_code: item.item_code,
    description: item.description,
    luminaire_type: canonicalType,
    luminaire_type_confidence: item.luminaire_type_confidence,
    luminaire_type_note: item.luminaire_type_note,
    source_reference: item.source_reference,
    matchable_attrs: matchableAttrs,
    informational_attrs: informationalAttrs,
    unknown_keys: unknownKeys,
    low_confidence_flags: lowConfidenceFlags,
  };
}

export function mapSpecDocument(doc: ExtractedSpecDocument): MappedSpecItem[] {
  return doc.items.map(mapSpecItem);
}
