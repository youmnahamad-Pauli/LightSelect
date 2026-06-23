/**
 * Ingestion review API.
 *
 * GET /api/ingestion/review
 *   Returns all canonical products that were ingested from a catalogue
 *   (review_notes starts with "Ingested from:"), with their extracted
 *   attribute values and confidence scores.
 *
 *   Query params:
 *     org_id  (required) — filter to this org
 *     source  (optional) — filter by source filename substring
 *
 * GET /api/ingestion/review/:canonicalProductId
 *   Returns a single canonical product with all its attribute values.
 *
 * This endpoint does NOT require authentication so the reviewer workflow
 * can be accessed without a login during the Phase 2 test run.
 * Add authenticate middleware before exposing publicly.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { like, eq, and, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { canonical_products, product_attribute_values } from '../db/schema/registry';
import { success } from '../lib/response';

export const ingestionRouter = Router();

ingestionRouter.get('/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
    const source = typeof req.query.source === 'string' ? req.query.source : null;

    if (!orgId) {
      return res.status(400).json({ error: 'org_id query parameter is required' });
    }

    const conditions = [
      eq(canonical_products.org_id, orgId),
      like(canonical_products.review_notes, 'Ingested from:%'),
    ];
    if (source) {
      conditions.push(like(canonical_products.review_notes, `Ingested from: %${source}%`));
    }

    const products = await db
      .select({
        id: canonical_products.id,
        display_name: canonical_products.display_name,
        canonical_manufacturer: canonical_products.canonical_manufacturer,
        canonical_model_code: canonical_products.canonical_model_code,
        review_status: canonical_products.review_status,
        review_notes: canonical_products.review_notes,
        soft_match_hint: canonical_products.soft_match_hint,
        created_at: canonical_products.created_at,
      })
      .from(canonical_products)
      .where(and(...conditions))
      .orderBy(asc(canonical_products.canonical_manufacturer), asc(canonical_products.canonical_model_code));

    // Attach attribute values
    const withAttrs = await Promise.all(
      products.map(async (p) => {
        const attrs = await db
          .select({
            attribute_key: product_attribute_values.attribute_key,
            attribute_value: product_attribute_values.attribute_value,
            value_state: product_attribute_values.value_state,
            confidence_score: product_attribute_values.confidence_score,
            conflict_notes: product_attribute_values.conflict_notes,
            source_locator: product_attribute_values.source_locator,
            resolution_method: product_attribute_values.resolution_method,
          })
          .from(product_attribute_values)
          .where(eq(product_attribute_values.canonical_product_id, p.id))
          .orderBy(asc(product_attribute_values.attribute_key));
        return { ...p, attributes: attrs };
      }),
    );

    return success(res, {
      count: withAttrs.length,
      products: withAttrs,
    });
  } catch (err) {
    return next(err);
  }
});

ingestionRouter.get('/review/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [product] = await db
      .select()
      .from(canonical_products)
      .where(eq(canonical_products.id, req.params.id))
      .limit(1);

    if (!product) {
      return res.status(404).json({ error: 'Canonical product not found' });
    }

    const attrs = await db
      .select()
      .from(product_attribute_values)
      .where(eq(product_attribute_values.canonical_product_id, product.id))
      .orderBy(asc(product_attribute_values.attribute_key));

    return success(res, { ...product, attributes: attrs });
  } catch (err) {
    return next(err);
  }
});
