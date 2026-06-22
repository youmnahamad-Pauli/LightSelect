/**
 * Consultant spec parser pipeline — orchestration layer.
 *
 * Flow:
 *   1. LLM extraction: send spec file to Claude, identify line items + extract attribute values.
 *   2. Attribute mapping: map extracted values through the locked ATTR_CONFIG.
 *   3. DB write: write each item as a matching_requirement with attrs.
 *
 * The pipeline is generic — it works with any consultant spec that lists
 * luminaire types with item codes and specified attributes. No fixture-specific
 * logic is embedded here.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { extractFromSpec } from './spec-llm';
import { mapSpecDocument } from './attr-mapper';
import { writeSpecItem } from './writer';
import type { SpecParseOptions, SpecParseResult } from './types';

export async function runSpecParser(opts: SpecParseOptions): Promise<SpecParseResult> {
  const { filePath, orgId, itemFilter } = opts;
  const model = opts.model ?? process.env.EXTRACTION_MODEL ?? 'claude-sonnet-4-6';

  // ── Step 1: LLM extraction ────────────────────────────────────────────────
  console.log(`[spec-parser] Sending ${filePath} to ${model}…`);
  const extracted = await extractFromSpec({ filePath, model, itemFilter });

  console.log(
    `[spec-parser] Extracted ${extracted.items.length} item(s). ` +
    `Tokens: in=${extracted.meta.input_tokens} out=${extracted.meta.output_tokens} ` +
    `(${extracted.meta.elapsed_ms}ms)`,
  );

  if (extracted.items.length === 0) {
    return {
      source_file: filePath,
      parsed_at: new Date().toISOString(),
      org_id: orgId,
      items_detected: 0,
      items_written: 0,
      items: [],
      llm_meta: extracted.meta,
    };
  }

  // ── Step 2: Attribute mapping ─────────────────────────────────────────────
  const mappedItems = mapSpecDocument(extracted);

  for (const item of mappedItems) {
    const unknownMsg = item.unknown_keys.length > 0
      ? ` UNKNOWN KEYS: ${item.unknown_keys.join(', ')}`
      : '';
    const lowConfMsg = item.low_confidence_flags.length > 0
      ? ` LOW CONF: ${item.low_confidence_flags.join(', ')}`
      : '';
    const typeFlag = !item.luminaire_type ? ' [TYPE UNCLASSIFIED]' : '';
    console.log(
      `[spec-parser]   ${item.item_code} → type=${item.luminaire_type ?? 'null'} ` +
      `(conf=${item.luminaire_type_confidence.toFixed(2)}), ` +
      `${item.matchable_attrs.length} matchable, ${item.informational_attrs.length} informational` +
      `${unknownMsg}${lowConfMsg}${typeFlag}`,
    );
  }

  // ── Step 3: DB write ──────────────────────────────────────────────────────
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  const results = [];
  for (const item of mappedItems) {
    const result = await writeSpecItem(db, item, orgId);
    results.push(result);
    console.log(`[spec-parser]   wrote: ${item.item_code} → req_id=${result.requirement_id}`);
  }

  await sql.end();

  const written = results.length;
  const needsReview = results.filter((r) => r.needs_review).length;

  console.log(
    `[spec-parser] Done. ${written} requirement(s) written, ${needsReview} need human review.`,
  );

  return {
    source_file: filePath,
    parsed_at: new Date().toISOString(),
    org_id: orgId,
    items_detected: extracted.items.length,
    items_written: written,
    items: results,
    llm_meta: extracted.meta,
  };
}
