/**
 * Matching API — Phase 3.
 *
 * GET  /matching/requirements?org_id=<uuid>          — list requirements
 * POST /matching/requirements                         — create requirement
 * GET  /matching/requirements/:id/run                 — run (no persist)
 * POST /matching/requirements/:id/run                 — run + persist
 * GET  /matching/decisions?requirement_id=<uuid>      — list decisions for a requirement
 * GET  /matching/decisions/:id                        — decision + evidence detail
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { db } from '../db/client';
import {
  matching_requirements, matching_requirement_attrs,
  match_decisions, match_evidence,
  type MatchingOperator,
} from '../db/schema/matching';
import { canonical_products, product_attribute_values } from '../db/schema/registry';
import {
  loadRequirement, loadCandidates, runEvaluation, persistResults,
} from '../lib/matching/engine';
import { success } from '../lib/response';

export const matchingRouter = Router();

// ── List requirements ─────────────────────────────────────────────────────────

matchingRouter.get('/requirements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
    if (!orgId) return res.status(400).json({ error: 'org_id required' });
    const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : null;

    const conditions = [eq(matching_requirements.org_id, orgId)];
    if (projectId) conditions.push(eq(matching_requirements.project_id, projectId));

    const reqs = await db
      .select()
      .from(matching_requirements)
      .where(and(...conditions));

    return success(res, { count: reqs.length, requirements: reqs });
  } catch (err) { return next(err); }
});

// ── Create requirement ────────────────────────────────────────────────────────

matchingRouter.post('/requirements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      org_id: string;
      name: string;
      luminaire_type: string;
      description?: string;
      attrs: {
        attribute_key: string;
        operator: string;
        target_value: string;
        target_unit?: string;
        tolerance_tight_pct?: number;
        tolerance_outer_pct?: number;
        gate_type?: string;
        weight?: number;
        notes?: string;
      }[];
    };

    if (!body.org_id || !body.name || !body.luminaire_type) {
      return res.status(400).json({ error: 'org_id, name, luminaire_type required' });
    }

    const [newReq] = await db
      .insert(matching_requirements)
      .values({
        org_id:        body.org_id,
        name:          body.name,
        luminaire_type: body.luminaire_type,
        description:   body.description,
      })
      .returning();

    if (body.attrs?.length) {
      await db.insert(matching_requirement_attrs).values(
        body.attrs.map((a) => ({
          ...a,
          operator: a.operator as MatchingOperator,
          gate_type: a.gate_type as 'hard' | 'soft' | 'conditional' | undefined,
          requirement_id: newReq.id,
        })),
      );
    }

    return success(res, newReq, 201);
  } catch (err) { return next(err); }
});

// ── Run evaluation (GET = preview, POST = persist) ───────────────────────────

async function handleRun(req: Request, res: Response, next: NextFunction, persist: boolean) {
  try {
    const requirementId = req.params.id;
    const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
    const pgDb = drizzle(sqlClient);

    const requirement = await loadRequirement(pgDb, requirementId);
    if (!requirement) {
      await sqlClient.end();
      return res.status(404).json({ error: 'Requirement not found' });
    }

    const candidates = await loadCandidates(pgDb, requirement.org_id);
    const evaluations = runEvaluation(requirement, candidates);

    if (persist) {
      await persistResults(pgDb, evaluations as any);
    }

    await sqlClient.end();

    const scored = evaluations.filter((e) => !e.excluded && e.passed_all_hard_gates);
    const disqualified = evaluations.filter((e) => !e.excluded && !e.passed_all_hard_gates);
    const excluded = evaluations.filter((e) => e.excluded);

    return success(res, {
      requirement_id: requirementId,
      persisted: persist,
      summary: {
        total_candidates: evaluations.length,
        scored: scored.length,
        disqualified: disqualified.length,
        excluded: excluded.length,
      },
      ranked: scored
        .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
        .map((e) => ({
          rank: (e as any).rank,
          canonical_product_id: e.candidate.canonical_product_id,
          display_name: e.candidate.display_name,
          fit_score: e.fit_score,
          is_fit_capped: e.is_fit_capped,
          confidence_score: e.confidence_score,
          confidence_band: e.confidence_band,
          deviations_high_weight: e.deviations_high_weight,
          comments_count: e.comments_count,
        })),
      disqualified: disqualified.map((e) => ({
        canonical_product_id: e.candidate.canonical_product_id,
        display_name: e.candidate.display_name,
        gate_failures: e.gate_failures,
      })),
    });
  } catch (err) { return next(err); }
}

matchingRouter.get('/requirements/:id/run', (req, res, next) => handleRun(req, res, next, false));
matchingRouter.post('/requirements/:id/run', (req, res, next) => handleRun(req, res, next, true));

// ── List decisions for a requirement ─────────────────────────────────────────

matchingRouter.get('/decisions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reqId = typeof req.query.requirement_id === 'string' ? req.query.requirement_id : null;
    if (!reqId) return res.status(400).json({ error: 'requirement_id required' });

    const decisions = await db
      .select({
        id:                     match_decisions.id,
        canonical_product_id:   match_decisions.canonical_product_id,
        display_name:           canonical_products.display_name,
        luminaire_type:         canonical_products.luminaire_type,
        status:                 match_decisions.status,
        passed_all_hard_gates:  match_decisions.passed_all_hard_gates,
        fit_score:              match_decisions.fit_score,
        is_fit_capped:          match_decisions.is_fit_capped,
        fit_cap_reason:         match_decisions.fit_cap_reason,
        confidence_score:       match_decisions.confidence_score,
        confidence_band:        match_decisions.confidence_band,
        rank:                   match_decisions.rank,
        deviations_high_weight:   match_decisions.deviations_high_weight,
        deviations_medium_weight: match_decisions.deviations_medium_weight,
        deviations_low_weight:    match_decisions.deviations_low_weight,
        comments_count:           match_decisions.comments_count,
        gate_failures:          match_decisions.gate_failures,
        soft_gate_comments:     match_decisions.soft_gate_comments,
        evaluated_at:           match_decisions.evaluated_at,
      })
      .from(match_decisions)
      .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
      .where(eq(match_decisions.requirement_id, reqId))
      .orderBy(match_decisions.rank);

    return success(res, { count: decisions.length, decisions });
  } catch (err) { return next(err); }
});

// ── Decision detail + evidence ────────────────────────────────────────────────

matchingRouter.get('/decisions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [decision] = await db
      .select()
      .from(match_decisions)
      .where(eq(match_decisions.id, req.params.id))
      .limit(1);

    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    const product = await db
      .select({ display_name: canonical_products.display_name, luminaire_type: canonical_products.luminaire_type })
      .from(canonical_products)
      .where(eq(canonical_products.id, decision.canonical_product_id))
      .limit(1);

    const evidence = await db
      .select()
      .from(match_evidence)
      .where(eq(match_evidence.match_decision_id, decision.id));

    return success(res, {
      ...decision,
      display_name: product[0]?.display_name ?? null,
      luminaire_type: product[0]?.luminaire_type ?? null,
      evidence,
    });
  } catch (err) { return next(err); }
});

// ── Confirm attribute value (set human_confirmed) + re-run ───────────────────

matchingRouter.post('/decisions/:id/confirm-attr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decisionId = req.params.id;
    const { attribute_key } = req.body as { attribute_key: string };
    if (!attribute_key) return res.status(400).json({ error: 'attribute_key required' });

    // Load the decision to get canonical_product_id and requirement_id
    const [decision] = await db
      .select({
        id: match_decisions.id,
        requirement_id: match_decisions.requirement_id,
        canonical_product_id: match_decisions.canonical_product_id,
      })
      .from(match_decisions)
      .where(eq(match_decisions.id, decisionId))
      .limit(1);

    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    // Update provenance on the product_attribute_values row
    await db
      .update(product_attribute_values)
      .set({ provenance_state: 'human_confirmed', updated_at: new Date() })
      .where(
        and(
          eq(product_attribute_values.canonical_product_id, decision.canonical_product_id),
          eq(product_attribute_values.attribute_key, attribute_key),
        ),
      );

    // Re-run the full matching evaluation for this requirement
    const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
    const pgDb = drizzle(sqlClient);

    const requirement = await loadRequirement(pgDb, decision.requirement_id);
    if (!requirement) {
      await sqlClient.end();
      return res.status(404).json({ error: 'Requirement not found' });
    }

    const [reqRow] = await db
      .select({ org_id: matching_requirements.org_id })
      .from(matching_requirements)
      .where(eq(matching_requirements.id, decision.requirement_id))
      .limit(1);

    const candidates = await loadCandidates(pgDb, reqRow?.org_id ?? requirement.org_id);
    const evaluations = runEvaluation(requirement, candidates);
    await persistResults(pgDb, evaluations as any);
    await sqlClient.end();

    // Return the updated decision + evidence
    const [updatedDecision] = await db
      .select()
      .from(match_decisions)
      .where(eq(match_decisions.id, decisionId))
      .limit(1);

    const product = await db
      .select({ display_name: canonical_products.display_name, luminaire_type: canonical_products.luminaire_type })
      .from(canonical_products)
      .where(eq(canonical_products.id, decision.canonical_product_id))
      .limit(1);

    const updatedEvidence = await db
      .select()
      .from(match_evidence)
      .where(eq(match_evidence.match_decision_id, decisionId));

    return success(res, {
      ...updatedDecision,
      display_name: product[0]?.display_name ?? null,
      luminaire_type: product[0]?.luminaire_type ?? null,
      evidence: updatedEvidence,
    });
  } catch (err) { return next(err); }
});
