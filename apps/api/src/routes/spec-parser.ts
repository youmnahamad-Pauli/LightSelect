/**
 * Spec parser review API.
 *
 * GET /api/spec-parser/review
 *   Returns all matching_requirements that were created by the spec parser,
 *   with their extracted attrs and informational fields.
 *
 *   Query params:
 *     org_id     (required) — filter to this org
 *     item_code  (optional) — filter to a specific item code
 *
 * GET /api/spec-parser/review/:requirementId
 *   Returns a single requirement with all attrs and informational fields.
 *
 * No authentication required for reviewer workflow access during testing.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, like } from 'drizzle-orm';
import { db } from '../db/client';
import { matching_requirements, matching_requirement_attrs, match_decisions } from '../db/schema/matching';
import { success } from '../lib/response';

export const specParserRouter = Router();

specParserRouter.get('/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
    const itemCode = typeof req.query.item_code === 'string' ? req.query.item_code : null;

    if (!orgId) {
      return res.status(400).json({ error: 'org_id query parameter is required' });
    }

    const conditions = [eq(matching_requirements.org_id, orgId)];
    if (itemCode) {
      conditions.push(like(matching_requirements.item_code, `%${itemCode}%`));
    } else {
      // Only return requirements that have an item_code (i.e. were written by the spec parser)
      // Null item_code requirements are hand-seeded ones (matching-seed.ts)
    }

    const requirements = await db
      .select({
        id: matching_requirements.id,
        name: matching_requirements.name,
        item_code: matching_requirements.item_code,
        luminaire_type: matching_requirements.luminaire_type,
        description: matching_requirements.description,
        informational_attrs: matching_requirements.informational_attrs,
        flag_wind_load: matching_requirements.flag_wind_load,
        flag_dark_sky: matching_requirements.flag_dark_sky,
        flag_bend_radius: matching_requirements.flag_bend_radius,
        created_at: matching_requirements.created_at,
      })
      .from(matching_requirements)
      .where(and(...conditions))
      .orderBy(asc(matching_requirements.item_code));

    const withAttrs = await Promise.all(
      requirements.map(async (r) => {
        const attrs = await db
          .select({
            id: matching_requirement_attrs.id,
            attribute_key: matching_requirement_attrs.attribute_key,
            operator: matching_requirement_attrs.operator,
            target_value: matching_requirement_attrs.target_value,
            target_unit: matching_requirement_attrs.target_unit,
            gate_type: matching_requirement_attrs.gate_type,
            weight: matching_requirement_attrs.weight,
            notes: matching_requirement_attrs.notes,
          })
          .from(matching_requirement_attrs)
          .where(eq(matching_requirement_attrs.requirement_id, r.id))
          .orderBy(asc(matching_requirement_attrs.attribute_key));

        // Count match decisions for this requirement
        const decisions = await db
          .select({ id: match_decisions.id, status: match_decisions.status })
          .from(match_decisions)
          .where(eq(match_decisions.requirement_id, r.id));

        const decisionSummary = {
          evaluated: decisions.filter((d) => d.status === 'evaluated').length,
          pending_characterisation: decisions.filter((d) => d.status === 'pending_characterisation').length,
          disqualified: decisions.filter((d) => d.status === 'disqualified').length,
          excluded: decisions.filter((d) => d.status === 'excluded').length,
        };

        return { ...r, attrs, decision_summary: decisionSummary };
      }),
    );

    return success(res, { count: withAttrs.length, requirements: withAttrs });
  } catch (err) {
    return next(err);
  }
});

specParserRouter.get('/review/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [req_row] = await db
      .select()
      .from(matching_requirements)
      .where(eq(matching_requirements.id, req.params.id))
      .limit(1);

    if (!req_row) {
      return res.status(404).json({ error: 'Requirement not found' });
    }

    const attrs = await db
      .select()
      .from(matching_requirement_attrs)
      .where(eq(matching_requirement_attrs.requirement_id, req_row.id))
      .orderBy(asc(matching_requirement_attrs.attribute_key));

    const decisions = await db
      .select()
      .from(match_decisions)
      .where(eq(match_decisions.requirement_id, req_row.id))
      .orderBy(asc(match_decisions.rank));

    return success(res, { ...req_row, attrs, decisions });
  } catch (err) {
    return next(err);
  }
});
