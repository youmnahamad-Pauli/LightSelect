/**
 * Catalogue ingestion pipeline — orchestration layer.
 *
 * Flow:
 *   1. Detect all products + attributes from the catalogue PDF (single LLM call).
 *   2. For each product, apply dedup and write to canonical_products +
 *      product_attribute_values (Phase 1 registry tables).
 *
 * The pipeline is generic and brand-agnostic. It works with any lighting
 * catalogue that lists products with an identifiable name/model code and
 * standard photometric/electrical data.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { detectAndExtractFromCatalogue } from './catalogue-llm';
import { writeProductToRegistry } from './registry-writer';
import type { CatalogueIngestionResult, IngestionOptions } from './types';

export async function runCatalogueIngestion(
  opts: IngestionOptions,
): Promise<CatalogueIngestionResult> {
  const { pdfPath, orgId, modelFilter, model } = opts;
  const resolvedModel = model ?? process.env.EXTRACTION_MODEL ?? 'claude-sonnet-4-6';

  // ── Step 1: LLM — detect products + extract attributes ───────────────────

  console.log(`[ingestion] Sending ${pdfPath} to ${resolvedModel}…`);
  const detection = await detectAndExtractFromCatalogue({
    pdfPath,
    model: resolvedModel,
    modelFilter,
  });

  console.log(
    `[ingestion] Detected ${detection.products.length} product(s). ` +
    `Tokens: in=${detection.meta.input_tokens} out=${detection.meta.output_tokens} ` +
    `(${detection.meta.elapsed_ms}ms)`,
  );

  if (detection.products.length === 0) {
    return {
      source_file: pdfPath,
      ingested_at: new Date().toISOString(),
      org_id: orgId,
      products_detected: 0,
      products_written: 0,
      total_attribute_values: 0,
      products: [],
      llm_meta: detection.meta,
    };
  }

  // ── Step 2: Write each product to the registry ───────────────────────────

  const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sqlClient);

  const results = [];
  for (const product of detection.products) {
    console.log(`[ingestion]   writing: ${product.manufacturer} / ${product.model_code ?? '(no model)'} — ${Object.keys(product.attributes).length} attrs`);
    const result = await writeProductToRegistry({ db, product, orgId, sourceFile: pdfPath });
    results.push(result);
  }

  await sqlClient.end();

  const totalAttrs = results.reduce((s, r) => s + r.attributes_written, 0);

  console.log(
    `[ingestion] Done. ${results.length} product(s) written, ` +
    `${totalAttrs} attribute value(s) stored.`,
  );

  return {
    source_file: pdfPath,
    ingested_at: new Date().toISOString(),
    org_id: orgId,
    products_detected: detection.products.length,
    products_written: results.length,
    total_attribute_values: totalAttrs,
    products: results,
    llm_meta: detection.meta,
  };
}
