/**
 * Matching API — Phase 3 + Workflow Increment 2.
 *
 * GET    /matching/requirements?org_id=<uuid>            — list requirements
 * POST   /matching/requirements                           — create requirement
 * GET    /matching/requirements/:id/run                   — run (no persist)
 * POST   /matching/requirements/:id/run                   — run + persist
 * PUT    /matching/requirements/:id/selection             — set proposed product
 * DELETE /matching/requirements/:id/selection             — clear selection
 * GET    /matching/requirements/:id/selection             — resolve selection state
 * POST   /matching/requirements/resolve-selections        — batch resolve selection state
 * GET    /matching/requirements/:id/export/aecom          — download AECOM XLSX
 * GET    /matching/decisions?requirement_id=<uuid>        — list decisions for a requirement
 * GET    /matching/decisions/:id                          — decision + evidence detail
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { db } from '../db/client';
import {
  matching_requirements, matching_requirement_attrs,
  match_decisions, match_evidence,
  type MatchingOperator,
} from '../db/schema/matching';
import { canonical_products, product_attribute_values } from '../db/schema/registry';
import { delivery_combos } from '../db/schema/delivery-combos';
import {
  loadRequirement, loadCandidates, runEvaluation, persistResults,
} from '../lib/matching/engine';
import { MatchDecisionExportSource } from '../lib/exports/spine';
import { renderStatement } from '../lib/exports/templates/registry';
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

// ── Selection helpers ─────────────────────────────────────────────────────────

/**
 * Given a canonical_product_id and the associated match decision status,
 * determine the stable candidate reference to store.
 *
 * For configured products (delivery combos), look up the delivery_combo row
 * and return its own ID as the stable reference.
 * For plain canonical products, the canonical_product_id IS the stable id.
 */
async function resolveSelectionRef(
  canonicalProductId: string,
): Promise<{ type: 'product' | 'combo'; id: string }> {
  const [combo] = await db
    .select({ id: delivery_combos.id })
    .from(delivery_combos)
    .where(eq(delivery_combos.canonical_product_id, canonicalProductId))
    .limit(1);
  if (combo) return { type: 'combo', id: combo.id };
  return { type: 'product', id: canonicalProductId };
}

/**
 * Given stored selection fields, resolve back to the canonical_product_id
 * that match_decisions uses (needed to look up the decision + for the spine).
 */
async function resolveToCanonicalProductId(
  type: 'product' | 'combo',
  id: string,
): Promise<string | null> {
  if (type === 'product') return id;
  const [combo] = await db
    .select({ canonical_product_id: delivery_combos.canonical_product_id })
    .from(delivery_combos)
    .where(eq(delivery_combos.id, id))
    .limit(1);
  return combo?.canonical_product_id ?? null;
}

/**
 * Resolve the full selection state for a requirement.
 * Returns the auto top-ranked candidate when no manual selection is stored.
 */
async function resolveSelectionState(requirementId: string) {
  const [req] = await db
    .select({
      id: matching_requirements.id,
      selected_candidate_type: matching_requirements.selected_candidate_type,
      selected_candidate_id: matching_requirements.selected_candidate_id,
      selection_is_override: matching_requirements.selection_is_override,
      selected_at: matching_requirements.selected_at,
      selection_needs_review: matching_requirements.selection_needs_review,
    })
    .from(matching_requirements)
    .where(eq(matching_requirements.id, requirementId))
    .limit(1);

  if (!req) return null;

  const decisions = await db
    .select({
      id: match_decisions.id,
      canonical_product_id: match_decisions.canonical_product_id,
      display_name: canonical_products.display_name,
      status: match_decisions.status,
      rank: match_decisions.rank,
      fit_score: match_decisions.fit_score,
    })
    .from(match_decisions)
    .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
    .where(eq(match_decisions.requirement_id, requirementId));

  // Auto: rank-1 assessed candidate
  const autoDecision = decisions
    .filter((d) => d.status === 'evaluated' && d.rank !== null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0] ?? null;

  if (!req.selected_candidate_type || !req.selected_candidate_id) {
    // No selection stored → auto mode
    return {
      mode: autoDecision ? 'auto' : 'no_candidates' as const,
      needs_review: false,
      needs_review_reason: null as string | null,
      selected_canonical_product_id: null as string | null,
      resolved_canonical_product_id: autoDecision?.canonical_product_id ?? null,
      resolved_display_name: autoDecision?.display_name ?? null,
      resolved_fit_score: autoDecision?.fit_score ?? null,
      resolved_rank: autoDecision?.rank ?? null,
      resolved_status: (autoDecision?.status ?? null) as string | null,
      is_override: false,
    };
  }

  // Manual selection stored — resolve back to canonical_product_id
  const selectedCanonicalId = await resolveToCanonicalProductId(
    req.selected_candidate_type,
    req.selected_candidate_id,
  );

  if (!selectedCanonicalId) {
    return {
      mode: 'needs_review' as const,
      needs_review: true,
      needs_review_reason: 'Selected candidate no longer found in catalogue',
      selected_canonical_product_id: null,
      resolved_canonical_product_id: autoDecision?.canonical_product_id ?? null,
      resolved_display_name: autoDecision?.display_name ?? null,
      resolved_fit_score: autoDecision?.fit_score ?? null,
      resolved_rank: autoDecision?.rank ?? null,
      resolved_status: (autoDecision?.status ?? null) as string | null,
      is_override: req.selection_is_override,
    };
  }

  const selectedDecision = decisions.find(
    (d) => d.canonical_product_id === selectedCanonicalId,
  ) ?? null;

  const needsReview =
    req.selection_needs_review ||
    !selectedDecision ||
    (selectedDecision.status !== 'evaluated' && !req.selection_is_override);

  const needsReviewReason = needsReview
    ? (req.selection_needs_review
        ? 'Selected candidate recovered with changed evidence — re-confirm selection to proceed'
        : (!selectedDecision
            ? 'Selected candidate is no longer in match decisions — re-run matching'
            : `Selected candidate is now ${selectedDecision.status} — review required`))
    : null;

  return {
    mode: (req.selection_is_override ? 'override' : 'manual') as 'manual' | 'override',
    needs_review: needsReview,
    needs_review_reason: needsReviewReason,
    selected_canonical_product_id: selectedCanonicalId,
    resolved_canonical_product_id: selectedCanonicalId,
    resolved_display_name: selectedDecision?.display_name ?? null,
    resolved_fit_score: selectedDecision?.fit_score ?? null,
    resolved_rank: selectedDecision?.rank ?? null,
    resolved_status: (selectedDecision?.status ?? null) as string | null,
    is_override: req.selection_is_override,
  };
}

// ── Evidence-change helpers (DECISION 1) ─────────────────────────────────────

function evidenceSignature(rows: Array<{
  attribute_key: string;
  verdict: string;
  product_value: string | null;
  score: number | null;
  weighted_score: number | null;
}>): string {
  return rows
    .map((r) =>
      `${r.attribute_key}|${r.verdict}|${r.product_value ?? ''}|${r.score ?? ''}|${r.weighted_score ?? ''}`,
    )
    .sort()
    .join('\n');
}

/**
 * Snapshot the pre-run state of the currently selected candidate:
 * its canonical_product_id, its decision status, and a normalised
 * evidence signature. Called BEFORE persistResults so we can detect
 * whether evidence changed on the next run.
 */
async function capturePreRunSelectionState(requirementId: string): Promise<{
  selectedCanonicalId: string | null;
  oldStatus: string | null;
  oldSignature: string | null;
}> {
  const [req] = await db
    .select({
      selected_candidate_type: matching_requirements.selected_candidate_type,
      selected_candidate_id:   matching_requirements.selected_candidate_id,
    })
    .from(matching_requirements)
    .where(eq(matching_requirements.id, requirementId))
    .limit(1);

  if (!req?.selected_candidate_type || !req?.selected_candidate_id) {
    return { selectedCanonicalId: null, oldStatus: null, oldSignature: null };
  }

  const selectedCanonicalId = await resolveToCanonicalProductId(
    req.selected_candidate_type,
    req.selected_candidate_id,
  );

  if (!selectedCanonicalId) {
    return { selectedCanonicalId: null, oldStatus: null, oldSignature: null };
  }

  const [existingDecision] = await db
    .select({ id: match_decisions.id, status: match_decisions.status })
    .from(match_decisions)
    .where(and(
      eq(match_decisions.requirement_id, requirementId),
      eq(match_decisions.canonical_product_id, selectedCanonicalId),
    ))
    .limit(1);

  if (!existingDecision) {
    return { selectedCanonicalId, oldStatus: null, oldSignature: null };
  }

  if (existingDecision.status !== 'evaluated') {
    // No evaluated evidence to compare against
    return { selectedCanonicalId, oldStatus: existingDecision.status, oldSignature: null };
  }

  const evidenceRows = await db
    .select({
      attribute_key:  match_evidence.attribute_key,
      verdict:        match_evidence.verdict,
      product_value:  match_evidence.product_value,
      score:          match_evidence.score,
      weighted_score: match_evidence.weighted_score,
    })
    .from(match_evidence)
    .where(eq(match_evidence.match_decision_id, existingDecision.id));

  return {
    selectedCanonicalId,
    oldStatus: existingDecision.status,
    oldSignature: evidenceSignature(evidenceRows),
  };
}

/**
 * After persistResults, compare old vs new evidence for the selected
 * candidate. Clears selection_needs_review on a true no-op recovery;
 * sets it when evidence changed (data-change recovery).
 *
 * Decision rules (DECISION 1):
 *   - If candidate absent or not evaluated after run → skip (dynamic
 *     resolveSelectionState handles the needs_review signal).
 *   - If old status was not evaluated (recovering from disqualified/pending)
 *     and new status is evaluated → clean recovery, clear the flag.
 *   - If old+new both evaluated and evidence identical → no-op, clear.
 *   - If old+new both evaluated and evidence differs → data-change, set flag.
 */
async function maybeAutoClearNeedsReview(
  requirementId: string,
  preRunState: { selectedCanonicalId: string | null; oldStatus: string | null; oldSignature: string | null },
): Promise<void> {
  const { selectedCanonicalId, oldStatus, oldSignature } = preRunState;
  if (!selectedCanonicalId) return;

  const [newDecision] = await db
    .select({ id: match_decisions.id, status: match_decisions.status })
    .from(match_decisions)
    .where(and(
      eq(match_decisions.requirement_id, requirementId),
      eq(match_decisions.canonical_product_id, selectedCanonicalId),
    ))
    .limit(1);

  if (!newDecision || newDecision.status !== 'evaluated') return;

  if (oldStatus !== 'evaluated' || oldSignature === null) {
    // Recovering from non-evaluated state → clean recovery → clear flag
    await db
      .update(matching_requirements)
      .set({ selection_needs_review: false, updated_at: new Date() })
      .where(eq(matching_requirements.id, requirementId));
    return;
  }

  const newEvidenceRows = await db
    .select({
      attribute_key:  match_evidence.attribute_key,
      verdict:        match_evidence.verdict,
      product_value:  match_evidence.product_value,
      score:          match_evidence.score,
      weighted_score: match_evidence.weighted_score,
    })
    .from(match_evidence)
    .where(eq(match_evidence.match_decision_id, newDecision.id));

  const newSignature = evidenceSignature(newEvidenceRows);

  await db
    .update(matching_requirements)
    .set({
      selection_needs_review: newSignature !== oldSignature,
      updated_at: new Date(),
    })
    .where(eq(matching_requirements.id, requirementId));
}

// ── PUT /matching/requirements/:id/selection — set proposed product ───────────

matchingRouter.put('/requirements/:id/selection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirementId = req.params.id;
    const { canonical_product_id, is_override = false } = req.body as {
      canonical_product_id: string;
      is_override?: boolean;
    };

    if (!canonical_product_id) {
      return res.status(400).json({ error: 'canonical_product_id required' });
    }

    // Verify the requirement exists
    const [reqRow] = await db
      .select({ id: matching_requirements.id })
      .from(matching_requirements)
      .where(eq(matching_requirements.id, requirementId))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: 'Requirement not found' });

    // Verify a match decision exists for this candidate
    const [decision] = await db
      .select({ id: match_decisions.id, status: match_decisions.status })
      .from(match_decisions)
      .where(and(
        eq(match_decisions.requirement_id, requirementId),
        eq(match_decisions.canonical_product_id, canonical_product_id),
      ))
      .limit(1);

    if (!decision) {
      return res.status(404).json({
        error: 'No match decision found for this candidate. Run matching first.',
      });
    }

    // Excluded candidates are never selectable
    if (decision.status === 'excluded') {
      return res.status(422).json({
        error: 'Excluded candidates (luminaire type mismatch) cannot be selected as proposed.',
      });
    }

    // Disqualified/pending require explicit override confirmation
    if (
      (decision.status === 'disqualified' || decision.status === 'pending_characterisation') &&
      !is_override
    ) {
      return res.status(409).json({
        error: `Candidate status is "${decision.status}". Set is_override=true to confirm selection with override warning.`,
        code: 'REQUIRES_OVERRIDE',
        candidate_status: decision.status,
      });
    }

    const selectionRef = await resolveSelectionRef(canonical_product_id);

    const [updated] = await db
      .update(matching_requirements)
      .set({
        selected_candidate_type: selectionRef.type,
        selected_candidate_id:   selectionRef.id,
        selection_is_override:   is_override,
        selected_at:             new Date(),
        selection_needs_review:  false,
        updated_at:              new Date(),
      })
      .where(eq(matching_requirements.id, requirementId))
      .returning();

    const state = await resolveSelectionState(requirementId);
    return success(res, { requirement: updated, selection: state });
  } catch (err) { return next(err); }
});

// ── DELETE /matching/requirements/:id/selection — clear selection ─────────────

matchingRouter.delete('/requirements/:id/selection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirementId = req.params.id;

    const [reqRow] = await db
      .select({ id: matching_requirements.id })
      .from(matching_requirements)
      .where(eq(matching_requirements.id, requirementId))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: 'Requirement not found' });

    const [updated] = await db
      .update(matching_requirements)
      .set({
        selected_candidate_type: null,
        selected_candidate_id:   null,
        selection_is_override:   false,
        selected_at:             null,
        selection_needs_review:  false,
        updated_at:              new Date(),
      })
      .where(eq(matching_requirements.id, requirementId))
      .returning();

    const state = await resolveSelectionState(requirementId);
    return success(res, { requirement: updated, selection: state });
  } catch (err) { return next(err); }
});

// ── GET /matching/requirements/:id/selection — resolve selection state ────────

matchingRouter.get('/requirements/:id/selection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await resolveSelectionState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Requirement not found' });
    return success(res, state);
  } catch (err) { return next(err); }
});

// ── POST /matching/requirements/resolve-selections — batch resolve ────────────

matchingRouter.post('/requirements/resolve-selections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requirement_ids } = req.body as { requirement_ids: string[] };
    if (!Array.isArray(requirement_ids) || requirement_ids.length === 0) {
      return res.status(400).json({ error: 'requirement_ids array required' });
    }
    const resolutions: Record<string, Awaited<ReturnType<typeof resolveSelectionState>>> = {};
    await Promise.all(
      requirement_ids.map(async (id) => {
        resolutions[id] = await resolveSelectionState(id);
      }),
    );
    return success(res, { resolutions });
  } catch (err) { return next(err); }
});

// ── GET /matching/requirements/:id/export/aecom — download AECOM XLSX ────────

matchingRouter.get('/requirements/:id/export/aecom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirementId = req.params.id;

    const [reqRow] = await db
      .select({
        id:           matching_requirements.id,
        item_code:    matching_requirements.item_code,
        name:         matching_requirements.name,
        description:  matching_requirements.description,
      })
      .from(matching_requirements)
      .where(eq(matching_requirements.id, requirementId))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: 'Requirement not found' });

    // Resolve the proposed candidate (selected or auto)
    const selectionState = await resolveSelectionState(requirementId);
    const resolvedCanonicalProductId = selectionState?.resolved_canonical_product_id ?? null;

    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    const itemSlug = (reqRow.item_code ?? requirementId.slice(0, 8))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `aecom-${itemSlug}-${dateStr}.xlsx`;

    // No assessable candidate: stub sheet instead of 422 (DECISION 3)
    if (!resolvedCanonicalProductId) {
      const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
      const pgDb = drizzle(sqlClient);
      try {
        const statement = await MatchDecisionExportSource.resolveStub(pgDb, requirementId, {
          date:     today,
          revision: 'Rev A',
          item_code: reqRow.item_code ?? undefined,
          item_type: reqRow.name,
        });
        const buffer = await renderStatement(statement, 'aecom');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Selection-Mode', 'no_candidates');
        res.setHeader('X-Unmatched', 'true');
        return res.send(buffer);
      } finally {
        await sqlClient.end();
      }
    }

    // Build spine using a fresh postgres connection (same pattern as the run endpoint)
    const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1 });
    const pgDb = drizzle(sqlClient);

    try {
      const statement = await MatchDecisionExportSource.resolve(
        pgDb,
        requirementId,
        resolvedCanonicalProductId,
        {
          date:       today,
          revision:   'Rev A',
          item_code:  reqRow.item_code ?? undefined,
          item_type:  reqRow.name,
          is_override: selectionState?.is_override ?? false,
        },
      );

      const buffer = await renderStatement(statement, 'aecom');

      const isOverride = selectionState?.is_override ?? false;
      const mode = selectionState?.mode ?? 'auto';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Selection-Mode', mode);
      res.setHeader('X-Selection-Override', String(isOverride));
      return res.send(buffer);
    } finally {
      await sqlClient.end();
    }
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
      const preRunState = await capturePreRunSelectionState(requirementId);
      await persistResults(pgDb, evaluations as any);
      await sqlClient.end();
      await maybeAutoClearNeedsReview(requirementId, preRunState);
    } else {
      await sqlClient.end();
    }

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

    // Snapshot selection state before re-run so we can detect evidence changes
    const preRunState = await capturePreRunSelectionState(decision.requirement_id);

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

    await maybeAutoClearNeedsReview(decision.requirement_id, preRunState);

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
