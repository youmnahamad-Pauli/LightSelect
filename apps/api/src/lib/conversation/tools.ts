/**
 * Conversational capstone — tool layer.
 *
 * Seven read/produce-only tools wrapping existing platform operations.
 * Every tool executor receives the session's projectId in context and
 * enforces project scoping before accessing any data.
 *
 * NO mutation tools. Tools may not select products, override, upload,
 * delete, or edit any project state.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { matching_requirements, match_decisions, match_evidence, matching_requirement_attrs } from '../../db/schema/matching';
import { canonical_products, product_attribute_values } from '../../db/schema/registry';
import { delivery_combos } from '../../db/schema/delivery-combos';
import { project_documents, projects } from '../../db/schema/projects';
import { buildSubmittalCompleteness } from '../../services/submittal-completeness';
import { buildPackageManifest } from '../../services/submittal-package';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  projectId: string;
  orgId: string;
}

export interface ToolExecutor {
  schema: Anthropic.Tool;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

// ─── Helper: data quality for a canonical product ─────────────────────────────

async function getDataQuality(
  canonicalProductId: string | null,
): Promise<'verified' | 'estimated_placeholder'> {
  if (!canonicalProductId) return 'verified';
  const [row] = await db
    .select({ attribute_value: product_attribute_values.attribute_value })
    .from(product_attribute_values)
    .where(and(
      eq(product_attribute_values.canonical_product_id, canonicalProductId),
      eq(product_attribute_values.attribute_key, 'transmission_provenance'),
    ))
    .limit(1);
  return row?.attribute_value === 'estimated' ? 'estimated_placeholder' : 'verified';
}

// ─── Tool 1: list_schedule_items ──────────────────────────────────────────────

const listScheduleItems: ToolExecutor = {
  schema: {
    name: 'list_schedule_items',
    description:
      'List all lighting schedule items (matching requirements) for this project, ' +
      'including their selection mode, resolved proposed product, fit score, rank, ' +
      'and data quality flags (placeholder, needs_review, override).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  async execute(_args, ctx) {
    const reqs = await db
      .select({
        id: matching_requirements.id,
        name: matching_requirements.name,
        item_code: matching_requirements.item_code,
        luminaire_type: matching_requirements.luminaire_type,
        description: matching_requirements.description,
        selected_candidate_type: matching_requirements.selected_candidate_type,
        selected_candidate_id: matching_requirements.selected_candidate_id,
        selection_is_override: matching_requirements.selection_is_override,
        selection_needs_review: matching_requirements.selection_needs_review,
      })
      .from(matching_requirements)
      .where(eq(matching_requirements.project_id, ctx.projectId));

    if (reqs.length === 0) return { count: 0, items: [] };

    const reqIds = reqs.map((r) => r.id);

    const decisions = await db
      .select({
        requirement_id: match_decisions.requirement_id,
        canonical_product_id: match_decisions.canonical_product_id,
        display_name: canonical_products.display_name,
        status: match_decisions.status,
        rank: match_decisions.rank,
        fit_score: match_decisions.fit_score,
      })
      .from(match_decisions)
      .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
      .where(inArray(match_decisions.requirement_id, reqIds));

    const comboIds = reqs
      .filter((r) => r.selected_candidate_type === 'combo' && r.selected_candidate_id)
      .map((r) => r.selected_candidate_id!);

    const comboMap = new Map<string, string>();
    if (comboIds.length > 0) {
      const combos = await db
        .select({ id: delivery_combos.id, canonical_product_id: delivery_combos.canonical_product_id })
        .from(delivery_combos)
        .where(inArray(delivery_combos.id, comboIds));
      for (const c of combos) if (c.canonical_product_id) comboMap.set(c.id, c.canonical_product_id);
    }

    // Group decisions by requirement
    const decsByReq = new Map<string, typeof decisions>();
    for (const d of decisions) {
      if (!decsByReq.has(d.requirement_id)) decsByReq.set(d.requirement_id, []);
      decsByReq.get(d.requirement_id)!.push(d);
    }

    // Determine resolved canonical product IDs for data-quality batch lookup
    const resolvedIds: string[] = [];
    for (const req of reqs) {
      const reqDecs = decsByReq.get(req.id) ?? [];
      const auto = reqDecs
        .filter((d) => d.status === 'evaluated' && d.rank !== null)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0] ?? null;

      let resolvedId: string | null = null;
      if (!req.selected_candidate_type) {
        resolvedId = auto?.canonical_product_id ?? null;
      } else {
        resolvedId = req.selected_candidate_type === 'product'
          ? req.selected_candidate_id
          : (comboMap.get(req.selected_candidate_id!) ?? null);
        if (!resolvedId) resolvedId = auto?.canonical_product_id ?? null;
      }
      if (resolvedId) resolvedIds.push(resolvedId);
    }

    const provMap = new Map<string, string>();
    if (resolvedIds.length > 0) {
      const provRows = await db
        .select({
          canonical_product_id: product_attribute_values.canonical_product_id,
          attribute_value: product_attribute_values.attribute_value,
        })
        .from(product_attribute_values)
        .where(and(
          inArray(product_attribute_values.canonical_product_id, resolvedIds),
          eq(product_attribute_values.attribute_key, 'transmission_provenance'),
        ));
      for (const p of provRows) if (p.attribute_value) provMap.set(p.canonical_product_id, p.attribute_value);
    }

    const items = reqs.map((req) => {
      const reqDecs = decsByReq.get(req.id) ?? [];
      const auto = reqDecs
        .filter((d) => d.status === 'evaluated' && d.rank !== null)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0] ?? null;

      let mode: string;
      let resolvedId: string | null;
      let resolvedDec: typeof auto | null = null;
      let needsReview = false;

      if (!req.selected_candidate_type) {
        mode = auto ? 'auto' : 'no_candidates';
        resolvedId = auto?.canonical_product_id ?? null;
        resolvedDec = auto;
      } else {
        const selectedId = req.selected_candidate_type === 'product'
          ? req.selected_candidate_id
          : (comboMap.get(req.selected_candidate_id!) ?? null);

        if (!selectedId) {
          mode = 'needs_review';
          resolvedId = auto?.canonical_product_id ?? null;
          resolvedDec = auto;
          needsReview = true;
        } else {
          mode = req.selection_is_override ? 'override' : 'manual';
          resolvedId = selectedId;
          resolvedDec = reqDecs.find((d) => d.canonical_product_id === selectedId) ?? null;
          needsReview =
            req.selection_needs_review ||
            !resolvedDec ||
            (resolvedDec.status !== 'evaluated' && !req.selection_is_override);
        }
      }

      const dataQuality =
        resolvedId && provMap.get(resolvedId) === 'estimated'
          ? 'estimated_placeholder'
          : 'verified';

      return {
        requirement_id: req.id,
        item_code: req.item_code,
        name: req.name,
        luminaire_type: req.luminaire_type,
        description: req.description,
        mode,
        needs_review: needsReview,
        is_placeholder: dataQuality === 'estimated_placeholder',
        data_quality: dataQuality,
        is_override: req.selection_is_override,
        resolved_display_name: resolvedDec?.display_name ?? null,
        resolved_fit_score: resolvedDec?.fit_score ?? null,
        resolved_rank: resolvedDec?.rank ?? null,
        resolved_status: resolvedDec?.status ?? null,
      };
    });

    return { count: items.length, items };
  },
};

// ─── Tool 2: get_item_match_results ──────────────────────────────────────────

const getItemMatchResults: ToolExecutor = {
  schema: {
    name: 'get_item_match_results',
    description:
      'Get full match decision results for a specific schedule item: all candidate products ' +
      'evaluated, their statuses, fit scores, gate failures, and per-attribute evidence. ' +
      'Use requirement_id from list_schedule_items.',
    input_schema: {
      type: 'object',
      properties: {
        requirement_id: {
          type: 'string',
          description: 'UUID of the matching requirement.',
        },
      },
      required: ['requirement_id'],
    },
  },

  async execute(args, ctx) {
    const requirementId = args.requirement_id as string;

    const [req] = await db
      .select({
        id: matching_requirements.id,
        name: matching_requirements.name,
        item_code: matching_requirements.item_code,
        luminaire_type: matching_requirements.luminaire_type,
        description: matching_requirements.description,
        project_id: matching_requirements.project_id,
      })
      .from(matching_requirements)
      .where(and(
        eq(matching_requirements.id, requirementId),
        eq(matching_requirements.project_id, ctx.projectId),
      ))
      .limit(1);

    if (!req) return { error: 'Requirement not found in this project.' };

    const attrs = await db
      .select({
        attribute_key: matching_requirement_attrs.attribute_key,
        operator: matching_requirement_attrs.operator,
        target_value: matching_requirement_attrs.target_value,
        gate_type: matching_requirement_attrs.gate_type,
        weight: matching_requirement_attrs.weight,
      })
      .from(matching_requirement_attrs)
      .where(eq(matching_requirement_attrs.requirement_id, requirementId));

    const decisions = await db
      .select({
        id: match_decisions.id,
        canonical_product_id: match_decisions.canonical_product_id,
        display_name: canonical_products.display_name,
        status: match_decisions.status,
        rank: match_decisions.rank,
        fit_score: match_decisions.fit_score,
        confidence_score: match_decisions.confidence_score,
        confidence_band: match_decisions.confidence_band,
        passed_all_hard_gates: match_decisions.passed_all_hard_gates,
        gate_failures: match_decisions.gate_failures,
        is_fit_capped: match_decisions.is_fit_capped,
        fit_cap_reason: match_decisions.fit_cap_reason,
      })
      .from(match_decisions)
      .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
      .where(eq(match_decisions.requirement_id, requirementId));

    const decisionIds = decisions.map((d) => d.id);
    const evidenceRows =
      decisionIds.length > 0
        ? await db
            .select({
              match_decision_id: match_evidence.match_decision_id,
              attribute_key: match_evidence.attribute_key,
              required_value: match_evidence.required_value,
              required_operator: match_evidence.required_operator,
              product_value: match_evidence.product_value,
              provenance: match_evidence.provenance,
              verdict: match_evidence.verdict,
              is_gate: match_evidence.is_gate,
              gate_type: match_evidence.gate_type,
              score: match_evidence.score,
              weighted_score: match_evidence.weighted_score,
              evidence_note: match_evidence.evidence_note,
            })
            .from(match_evidence)
            .where(inArray(match_evidence.match_decision_id, decisionIds))
        : [];

    const evidenceByDecision = new Map<string, typeof evidenceRows>();
    for (const e of evidenceRows) {
      if (!evidenceByDecision.has(e.match_decision_id)) {
        evidenceByDecision.set(e.match_decision_id, []);
      }
      evidenceByDecision.get(e.match_decision_id)!.push(e);
    }

    const enrichedDecisions = decisions.map((d) => ({
      ...d,
      evidence: evidenceByDecision.get(d.id) ?? [],
    }));

    return {
      requirement: { ...req, attrs },
      decision_count: decisions.length,
      decisions: enrichedDecisions,
    };
  },
};

// ─── Tool 3: get_project_completeness ────────────────────────────────────────

const getProjectCompleteness: ToolExecutor = {
  schema: {
    name: 'get_project_completeness',
    description:
      'Get submittal completeness status for this project: which checklist items are ' +
      'satisfied or missing, override and stub counts, and whether the project is ' +
      'ready to export.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  async execute(_args, ctx) {
    return buildSubmittalCompleteness(ctx.projectId);
  },
};

// ─── Tool 4: export_item_compliance ──────────────────────────────────────────

const exportItemCompliance: ToolExecutor = {
  schema: {
    name: 'export_item_compliance',
    description:
      'Get the AECOM compliance statement export reference for a schedule item. ' +
      'Returns the download path plus metadata about placeholder/override/needs-review status. ' +
      'Use requirement_id from list_schedule_items.',
    input_schema: {
      type: 'object',
      properties: {
        requirement_id: {
          type: 'string',
          description: 'UUID of the matching requirement.',
        },
      },
      required: ['requirement_id'],
    },
  },

  async execute(args, ctx) {
    const requirementId = args.requirement_id as string;

    const [req] = await db
      .select({
        id: matching_requirements.id,
        name: matching_requirements.name,
        item_code: matching_requirements.item_code,
        project_id: matching_requirements.project_id,
        selected_candidate_type: matching_requirements.selected_candidate_type,
        selected_candidate_id: matching_requirements.selected_candidate_id,
        selection_is_override: matching_requirements.selection_is_override,
        selection_needs_review: matching_requirements.selection_needs_review,
      })
      .from(matching_requirements)
      .where(and(
        eq(matching_requirements.id, requirementId),
        eq(matching_requirements.project_id, ctx.projectId),
      ))
      .limit(1);

    if (!req) return { error: 'Requirement not found in this project.' };

    // Resolve the current selection state to get quality flags
    let mode = 'no_candidates';
    let isPlaceholder = false;
    let needsReview = req.selection_needs_review;
    let resolvedDisplay: string | null = null;

    if (!req.selected_candidate_type) {
      const [auto] = await db
        .select({ canonical_product_id: match_decisions.canonical_product_id, display_name: canonical_products.display_name })
        .from(match_decisions)
        .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
        .where(and(
          eq(match_decisions.requirement_id, requirementId),
          eq(match_decisions.status, 'evaluated'),
          isNotNull(match_decisions.rank),
        ))
        .orderBy(match_decisions.rank)
        .limit(1);

      if (auto) {
        mode = 'auto';
        resolvedDisplay = auto.display_name ?? null;
        const dq = await getDataQuality(auto.canonical_product_id);
        isPlaceholder = dq === 'estimated_placeholder';
      }
    } else {
      let canonicalId: string | null = null;
      if (req.selected_candidate_type === 'product') {
        canonicalId = req.selected_candidate_id;
      } else if (req.selected_candidate_id) {
        const [combo] = await db
          .select({ canonical_product_id: delivery_combos.canonical_product_id })
          .from(delivery_combos)
          .where(eq(delivery_combos.id, req.selected_candidate_id))
          .limit(1);
        canonicalId = combo?.canonical_product_id ?? null;
      }

      if (canonicalId) {
        mode = req.selection_is_override ? 'override' : 'manual';
        const dq = await getDataQuality(canonicalId);
        isPlaceholder = dq === 'estimated_placeholder';
        const [dec] = await db
          .select({ display_name: canonical_products.display_name })
          .from(match_decisions)
          .leftJoin(canonical_products, eq(match_decisions.canonical_product_id, canonical_products.id))
          .where(and(
            eq(match_decisions.requirement_id, requirementId),
            eq(match_decisions.canonical_product_id, canonicalId),
          ))
          .limit(1);
        resolvedDisplay = dec?.display_name ?? null;
      } else {
        mode = 'needs_review';
        needsReview = true;
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const itemSlug = (req.item_code ?? requirementId.slice(0, 8))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const filename = `aecom-${itemSlug}-${dateStr}.xlsx`;

    return {
      requirement_id: requirementId,
      item_code: req.item_code,
      name: req.name,
      mode,
      needs_review: needsReview,
      is_placeholder: isPlaceholder,
      is_override: req.selection_is_override,
      resolved_display_name: resolvedDisplay,
      filename,
      download_ref: `/matching/requirements/${requirementId}/export/aecom`,
      note: isPlaceholder
        ? 'PLACEHOLDER DATA: delivered lumen output is indicative only. Verify before use.'
        : mode === 'no_candidates'
        ? 'No assessed candidates. Export will produce a stub (unmatched) sheet.'
        : mode === 'needs_review'
        ? 'Selection requires review. Export may not reflect final proposed product.'
        : null,
    };
  },
};

// ─── Tool 5: export_project_package ──────────────────────────────────────────

const exportProjectPackage: ToolExecutor = {
  schema: {
    name: 'export_project_package',
    description:
      'Preview the submittal package manifest for this project: what documents are present, ' +
      'generated, or missing; whether the package gate is ready, blocked, or override-applied. ' +
      'Returns the manifest and a reference to the generate endpoint.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  async execute(_args, ctx) {
    // Verify project exists and belongs to org
    const [project] = await db
      .select({ id: projects.id, project_name: projects.project_name })
      .from(projects)
      .where(and(
        eq(projects.id, ctx.projectId),
        eq(projects.organization_id, ctx.orgId),
      ))
      .limit(1);

    if (!project) return { error: 'Project not found.' };

    const manifest = await buildPackageManifest(ctx.projectId);

    return {
      manifest,
      generate_ref: `/projects/${ctx.projectId}/submittal-package/generate`,
      note:
        manifest.gate_state === 'blocked'
          ? 'Package is blocked: required items are missing. Resolve missing items before generating.'
          : manifest.gate_state === 'override_applied'
          ? 'Package was generated with an override: some required items were missing at generation time.'
          : 'Package is ready to generate.',
    };
  },
};

// ─── Tool 6: list_project_documents ──────────────────────────────────────────

const listProjectDocuments: ToolExecutor = {
  schema: {
    name: 'list_project_documents',
    description:
      'List all uploaded documents for this project, including their type, filename, ' +
      'size, upload date, and any linked schedule item.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  async execute(_args, ctx) {
    const docs = await db
      .select({
        id: project_documents.id,
        original_filename: project_documents.original_filename,
        document_type: project_documents.document_type,
        mime_type: project_documents.mime_type,
        file_size_bytes: project_documents.file_size_bytes,
        item_id: project_documents.item_id,
        uploaded_at: project_documents.uploaded_at,
      })
      .from(project_documents)
      .where(and(
        eq(project_documents.project_id, ctx.projectId),
        eq(project_documents.organization_id, ctx.orgId),
      ));

    return {
      count: docs.length,
      documents: docs.map((d) => ({
        ...d,
        download_ref: `/project-documents/${d.id}/download`,
      })),
    };
  },
};

// ─── Tool 7: get_document ────────────────────────────────────────────────────

const getDocument: ToolExecutor = {
  schema: {
    name: 'get_document',
    description:
      'Get details and a download reference for a specific project document. ' +
      'Use document_id from list_project_documents.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'UUID of the project document.',
        },
      },
      required: ['document_id'],
    },
  },

  async execute(args, ctx) {
    const documentId = args.document_id as string;

    const [doc] = await db
      .select({
        id: project_documents.id,
        original_filename: project_documents.original_filename,
        document_type: project_documents.document_type,
        mime_type: project_documents.mime_type,
        file_size_bytes: project_documents.file_size_bytes,
        item_id: project_documents.item_id,
        uploaded_at: project_documents.uploaded_at,
      })
      .from(project_documents)
      .where(and(
        eq(project_documents.id, documentId),
        eq(project_documents.project_id, ctx.projectId),
        eq(project_documents.organization_id, ctx.orgId),
      ))
      .limit(1);

    if (!doc) return { error: 'Document not found in this project.' };

    return {
      ...doc,
      download_ref: `/project-documents/${doc.id}/download`,
    };
  },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const ALL_TOOLS: ToolExecutor[] = [
  listScheduleItems,
  getItemMatchResults,
  getProjectCompleteness,
  exportItemCompliance,
  exportProjectPackage,
  listProjectDocuments,
  getDocument,
];

export const TOOL_MAP = new Map<string, ToolExecutor>(
  ALL_TOOLS.map((t) => [t.schema.name, t]),
);
