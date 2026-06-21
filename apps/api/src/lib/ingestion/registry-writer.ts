/**
 * Writes ingestion results to the Phase 1 canonical registry tables.
 *
 * Uses upsert semantics — safe to re-run on the same catalogue.
 *
 * Provenance strategy (no schema changes):
 *   canonical_products.review_notes  → "Ingested from: {filename}, pages {n}-{m}"
 *   product_attribute_values (conflict_notes field) → "Source: {filename}:p{page}"
 *
 * merge_type = 'manual' is used for source records from catalogue ingestion
 * (the closest existing enum value; no schema modification needed).
 */

import path from 'path';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  canonical_products,
  canonical_product_sources,
  product_attribute_values,
} from '../../db/schema/registry';
import type { IngestionProductResult } from './types';
import type { DetectedProduct } from './types';
import { buildDedupKey, buildDisplayName, buildSoftHint, normalizeForKey } from './normalise';
import { VALID_ATTRIBUTE_NAMES } from './catalogue-llm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeProductToRegistry(params: {
  db: NodePgDatabase<any>;
  product: DetectedProduct;
  orgId: string;
  sourceFile: string; // absolute or relative path to the catalogue PDF
}): Promise<IngestionProductResult> {
  const { db, product, orgId, sourceFile } = params;
  const filename = path.basename(sourceFile);
  const pageRef = `${filename}:p${product.pages[0]}${product.pages[0] !== product.pages[1] ? `-${product.pages[1]}` : ''}`;

  const displayName = buildDisplayName(product.manufacturer, product.model_code, product.product_name);
  const dedupKey = product.model_code
    ? buildDedupKey(product.manufacturer, product.model_code)
    : null;
  const softHint = !dedupKey
    ? buildSoftHint(product.manufacturer, product.product_name, product.attributes)
    : null;
  const reviewStatus = dedupKey ? 'auto_merged' : 'needs_review';
  const reviewNotes = `Ingested from: ${pageRef}`;

  // ── Upsert canonical_product ──────────────────────────────────────────────

  let canonicalId: string;
  let mergedIntoExisting = false;

  if (dedupKey) {
    // Check if a record with this dedup_key already exists for this org
    const [existing] = await db
      .select({ id: canonical_products.id })
      .from(canonical_products)
      .where(
        and(
          eq(canonical_products.org_id, orgId),
          eq(canonical_products.dedup_key, dedupKey),
        ),
      )
      .limit(1);

    if (existing) {
      canonicalId = existing.id;
      mergedIntoExisting = true;
    } else {
      const [inserted] = await db
        .insert(canonical_products)
        .values({
          org_id: orgId,
          canonical_manufacturer: normalizeForKey(product.manufacturer),
          canonical_model_code: normalizeForKey(product.model_code!),
          dedup_key: dedupKey,
          display_name: displayName,
          review_status: reviewStatus,
          review_notes: reviewNotes,
        })
        .returning({ id: canonical_products.id });
      canonicalId = inserted.id;
    }
  } else {
    // No model code — always create a new record (one per source product)
    const [inserted] = await db
      .insert(canonical_products)
      .values({
        org_id: orgId,
        canonical_manufacturer: normalizeForKey(product.manufacturer),
        canonical_model_code: null,
        dedup_key: null,
        display_name: displayName,
        review_status: reviewStatus,
        review_notes: reviewNotes,
        soft_match_hint: softHint,
      })
      .returning({ id: canonical_products.id });
    canonicalId = inserted.id;
  }

  // ── Insert canonical_product_sources record ───────────────────────────────
  // source_product_id = null (no products table row exists for catalogue ingestion)
  // merge_type = 'manual' (closest available value; flagged in review output)
  if (!mergedIntoExisting) {
    await db.insert(canonical_product_sources).values({
      canonical_product_id: canonicalId,
      source_product_id: null,
      merge_type: 'manual',
    });
  }

  // ── Upsert product_attribute_values ──────────────────────────────────────

  let attributesWritten = 0;
  let attributesSkipped = 0;

  for (const [attrKey, attrData] of Object.entries(product.attributes)) {
    if (!VALID_ATTRIBUTE_NAMES.has(attrKey)) {
      attributesSkipped++;
      continue;
    }

    const existing = await db
      .select({ id: product_attribute_values.id, value_state: product_attribute_values.value_state })
      .from(product_attribute_values)
      .where(
        and(
          eq(product_attribute_values.canonical_product_id, canonicalId),
          eq(product_attribute_values.attribute_key, attrKey),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Never overwrite a confirmed value with an extracted one
      if (existing[0].value_state === 'confirmed') {
        attributesSkipped++;
        continue;
      }
      // Update extracted value with new extraction
      await db
        .update(product_attribute_values)
        .set({
          attribute_value: attrData.value,
          value_state: 'extracted',
          confidence_score: parseFloat(attrData.confidence.toFixed(3)),
          source_product_id: null,
          conflict_notes: `Source: ${pageRef}`,
          updated_at: new Date(),
        })
        .where(eq(product_attribute_values.id, existing[0].id));
    } else {
      await db.insert(product_attribute_values).values({
        canonical_product_id: canonicalId,
        attribute_key: attrKey,
        attribute_value: attrData.value,
        value_state: 'extracted',
        source_product_id: null,
        confidence_score: parseFloat(attrData.confidence.toFixed(3)),
        conflict_notes: `Source: ${pageRef}`,
      });
    }
    attributesWritten++;
  }

  return {
    canonical_product_id: canonicalId,
    manufacturer: product.manufacturer,
    model_code: product.model_code,
    display_name: displayName,
    review_status: reviewStatus,
    pages: product.pages,
    attributes_written: attributesWritten,
    attributes_skipped: attributesSkipped,
    merged_into_existing: mergedIntoExisting,
  };
}
