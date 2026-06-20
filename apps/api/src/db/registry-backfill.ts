/**
 * Canonical Product Registry — Phase 1 backfill.
 *
 * Reads existing products (READ-ONLY) and populates the three registry tables.
 * Existing product / product_attributes tables are NEVER modified.
 * Safe to re-run — uses upsert logic and checks for existing canonical records.
 *
 * Dedup rules implemented here:
 *
 *   Exact-key merge (has model_number)
 *     key = normalize(manufacturer) + '::' + normalize(model_number)
 *     Same key → single canonical_product (auto_merged).
 *     Attribute merge: confirmed > extracted on conflict; keeps higher-priority
 *     value and records conflict in conflict_notes.
 *
 *   No-model-number products
 *     One canonical_product per source product.
 *     status = needs_review.
 *     soft_match_hint stored for human comparison.
 *
 *   Products with no manufacturer AND no model_number
 *     Skipped (cannot identify).
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, isNotNull, asc } from 'drizzle-orm';
import { products, product_attributes } from './schema/products';
import { projects } from './schema/projects';
import {
  canonical_products,
  canonical_product_sources,
  product_attribute_values,
} from './schema/registry';
import type { AttributeValueState, MergeType } from './schema/registry';

const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sqlClient);

// ─── Normalisation ─────────────────────────────────────────────────────────

function normalizeForKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildDedupKey(manufacturer: string, modelNumber: string): string {
  return `${normalizeForKey(manufacturer)}::${normalizeForKey(modelNumber)}`;
}

function buildSoftHint(
  manufacturer: string,
  familyName: string | null,
  attrs: Map<string, string>,
): string {
  const m  = normalizeForKey(manufacturer);
  const f  = familyName ? normalizeForKey(familyName) : '';
  const cct  = normalizeForKey(attrs.get('cct') ?? '');
  const w    = normalizeForKey(attrs.get('watts') ?? '');
  const lm   = normalizeForKey(attrs.get('lumens') ?? '');
  const ip   = normalizeForKey(attrs.get('ip_rating') ?? '');
  return `soft::${m}::${f}::${cct}:${w}:${lm}:${ip}`;
}

// ─── Attribute merge policy ────────────────────────────────────────────────

/** Maps product_attributes.value_source → AttributeValueState. */
function toValueState(valueSource: string): AttributeValueState {
  if (valueSource === 'manual')    return 'confirmed';
  if (valueSource === 'na')        return 'not_applicable';
  return 'extracted';
}

/**
 * Priority: confirmed (2) > extracted (1) > not_applicable (0).
 * Returns positive if a > b.
 */
function statePriority(s: AttributeValueState): number {
  return s === 'confirmed' ? 2 : s === 'extracted' ? 1 : 0;
}

// ─── Main ──────────────────────────────────────────────────────────────────

interface BackfillStats {
  productsRead: number;
  skipped: number;           // no manufacturer AND no model_number
  exactKeyNew: number;       // new canonical products from exact-key path
  exactKeyMerged: number;    // products merged into existing canonical record
  noModelFlagged: number;    // canonical products created with needs_review
  attributeRows: number;     // total product_attribute_values upserted
  conflicts: number;         // attribute merge conflicts detected
}

export async function runRegistryBackfill(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    productsRead: 0, skipped: 0, exactKeyNew: 0, exactKeyMerged: 0,
    noModelFlagged: 0, attributeRows: 0, conflicts: 0,
  };

  // ── Load all org products (read-only) ───────────────────────────────────
  const orgProducts = await db
    .select({
      id: products.id,
      manufacturer: products.manufacturer,
      family_name: products.family_name,
      model_number: products.model_number,
      category_id: products.category_id,
      source_type: products.source_type,
      org_id: projects.organization_id,
    })
    .from(products)
    .innerJoin(projects, eq(products.project_id, projects.id))
    .orderBy(asc(products.created_at));

  stats.productsRead = orgProducts.length;

  for (const prod of orgProducts) {
    const mfr   = prod.manufacturer?.trim() || null;
    const model = prod.model_number?.trim() || null;

    // Skip products with no identifiers at all
    if (!mfr && !model) {
      stats.skipped++;
      continue;
    }

    // Load this product's attributes (read-only)
    const attrRows = await db
      .select()
      .from(product_attributes)
      .where(eq(product_attributes.product_id, prod.id));

    const attrMap = new Map(attrRows.map(a => [a.attribute_name, a]));
    const attrValMap = new Map(
      attrRows
        .filter(a => a.attribute_value != null)
        .map(a => [a.attribute_name, a.attribute_value!]),
    );

    let canonicalId: string;
    let mergeType: MergeType;

    if (mfr && model) {
      // ── Exact-key path ──────────────────────────────────────────────
      const dedupKey = buildDedupKey(mfr, model);
      const displayName = [mfr, model].filter(Boolean).join(' — ');

      const [existing] = await db
        .select({ id: canonical_products.id, review_status: canonical_products.review_status })
        .from(canonical_products)
        .where(
          and(
            eq(canonical_products.org_id, prod.org_id),
            eq(canonical_products.dedup_key, dedupKey),
          ),
        )
        .limit(1);

      if (existing) {
        canonicalId = existing.id;
        stats.exactKeyMerged++;
      } else {
        const [created] = await db
          .insert(canonical_products)
          .values({
            org_id: prod.org_id,
            canonical_manufacturer: mfr.toLowerCase(),
            canonical_model_code: model.toLowerCase(),
            dedup_key: dedupKey,
            display_name: displayName,
            category_id: prod.category_id,
            review_status: 'auto_merged',
          })
          .returning({ id: canonical_products.id });
        canonicalId = created.id;
        stats.exactKeyNew++;
      }
      mergeType = 'exact_key';

    } else {
      // ── No-model-number path (needs_review) ─────────────────────────
      const displayMfr = mfr ?? '(unknown manufacturer)';
      const displayName = [displayMfr, prod.family_name].filter(Boolean).join(' — ');
      const softHint = buildSoftHint(displayMfr, prod.family_name, attrValMap);

      const [created] = await db
        .insert(canonical_products)
        .values({
          org_id: prod.org_id,
          canonical_manufacturer: normalizeForKey(displayMfr),
          canonical_model_code: null,
          dedup_key: null, // no auto-merge for no-model products
          display_name: displayName,
          category_id: prod.category_id,
          review_status: 'needs_review',
          review_notes: 'No model number — soft match only. Review manually.',
          soft_match_hint: softHint,
        })
        .returning({ id: canonical_products.id });
      canonicalId = created.id;
      mergeType = 'backfill_no_model';
      stats.noModelFlagged++;
    }

    // ── Record source link ────────────────────────────────────────────
    await db
      .insert(canonical_product_sources)
      .values({
        canonical_product_id: canonicalId,
        source_product_id: prod.id,
        merge_type: mergeType,
      })
      .onConflictDoNothing(); // safe re-run: skip if already linked

    // ── Merge attributes ──────────────────────────────────────────────
    for (const [attrKey, attrRow] of attrMap) {
      stats.attributeRows++;

      const incomingState = toValueState(attrRow.value_source);
      const incomingValue = attrRow.attribute_value;

      // Check for existing value on this canonical product
      const [existingVal] = await db
        .select()
        .from(product_attribute_values)
        .where(
          and(
            eq(product_attribute_values.canonical_product_id, canonicalId),
            eq(product_attribute_values.attribute_key, attrKey),
          ),
        )
        .limit(1);

      if (!existingVal) {
        // First value for this attribute on this canonical product
        await db.insert(product_attribute_values).values({
          canonical_product_id: canonicalId,
          attribute_key: attrKey,
          attribute_value: incomingValue,
          value_state: incomingState,
          source_product_id: prod.id,
          confidence_score: attrRow.confidence_score,
        });
      } else {
        // Merge: apply priority rules
        const existingPrio  = statePriority(existingVal.value_state as AttributeValueState);
        const incomingPrio  = statePriority(incomingState);

        const valuesMatch = existingVal.attribute_value === incomingValue;

        if (valuesMatch) {
          // Same value: upgrade state if incoming is higher priority
          if (incomingPrio > existingPrio) {
            await db
              .update(product_attribute_values)
              .set({ value_state: incomingState, updated_at: new Date() })
              .where(eq(product_attribute_values.id, existingVal.id));
          }
          // Otherwise no change needed
        } else {
          // Different values — conflict
          stats.conflicts++;

          const winnerIsExisting = existingPrio >= incomingPrio; // existing wins on tie
          const [winValue, winState, winSource, winConf] = winnerIsExisting
            ? [existingVal.attribute_value, existingVal.value_state, existingVal.source_product_id, existingVal.confidence_score]
            : [incomingValue, incomingState, prod.id, attrRow.confidence_score];
          const [loseValue, loseState, loseSrc] = winnerIsExisting
            ? [incomingValue, incomingState, prod.id]
            : [existingVal.attribute_value, existingVal.value_state, existingVal.source_product_id];

          const conflictNote = `Conflict: kept "${winValue}" (${winState}) from product ${winSource}. ` +
            `Discarded: "${loseValue}" (${loseState}) from product ${loseSrc}.`;

          await db
            .update(product_attribute_values)
            .set({
              attribute_value: winValue,
              value_state: (winState as AttributeValueState),
              source_product_id: winSource,
              confidence_score: winConf,
              conflict_notes: conflictNote,
              updated_at: new Date(),
            })
            .where(eq(product_attribute_values.id, existingVal.id));

          // Flag the canonical product for review when there's a conflict
          await db
            .update(canonical_products)
            .set({
              review_status: 'needs_review',
              review_notes: `Attribute conflicts detected during backfill (attribute: ${attrKey}).`,
              updated_at: new Date(),
            })
            .where(eq(canonical_products.id, canonicalId));
        }
      }
    }
  }

  return stats;
}

// ─── CLI entry point ───────────────────────────────────────────────────────

async function main() {
  console.log('Starting canonical product registry backfill…\n');
  const stats = await runRegistryBackfill();

  console.log('=== Backfill complete ===\n');
  console.log(`Products read (read-only):   ${stats.productsRead}`);
  console.log(`  Skipped (no identifiers):  ${stats.skipped}`);
  console.log(`  Exact-key new:             ${stats.exactKeyNew}`);
  console.log(`  Exact-key merged:          ${stats.exactKeyMerged}`);
  console.log(`  No-model flagged (review): ${stats.noModelFlagged}`);
  console.log(`Attribute value rows:        ${stats.attributeRows}`);
  console.log(`Merge conflicts detected:    ${stats.conflicts}`);

  await sqlClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
