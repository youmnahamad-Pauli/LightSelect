/**
 * Submittal completeness engine — INCREMENT 3.
 *
 * Computes which items in the assigned submittal_template are satisfied for a
 * given project, without touching matching/scoring/ingestion logic.
 *
 * Satisfaction rules:
 *   project scope → at least one project_document of that document_type exists
 *                   for the project (item_id may be null).
 *   per_item scope, non-compliance-statement → at least one project_document of
 *                   that type with item_id = matching_requirement.id.
 *   per_item scope, compliance_statement → the requirement has a resolved proposed
 *                   product (resolved_canonical_product_id !== null); reading from
 *                   matching_requirements selection columns directly.
 */
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { projects } from '../db/schema/projects';
import { submittal_templates, submittal_template_items } from '../db/schema/submittal';
import { project_documents } from '../db/schema/projects';
import { matching_requirements, match_decisions } from '../db/schema/matching';
import { delivery_combos } from '../db/schema/delivery-combos';

// ─── Result types ──────────────────────────────────────────────────────────────

export interface SubmittalProjectScopeItem {
  template_item_id: string;
  document_type: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  /** Number of project_documents of this type for the project. */
  doc_count: number;
}

export interface SubmittalPerItemDetail {
  template_item_id: string;
  document_type: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  /** true when document_type='compliance_statement' — satisfied by selection state */
  is_compliance_statement: boolean;
  /** For compliance_statement items: mode of the resolved selection */
  selection_mode: 'auto' | 'manual' | 'override' | 'needs_review' | 'no_candidates' | null;
  is_override: boolean;
  is_stub: boolean;
  /** For non-compliance-statement items: count of linked project_documents */
  doc_count: number;
}

export interface SubmittalRequirementRow {
  requirement_id: string;
  requirement_name: string;
  item_code: string | null;
  luminaire_type: string;
  items: SubmittalPerItemDetail[];
  all_required_satisfied: boolean;
}

export interface SubmittalCompletenessResult {
  project_id: string;
  template_id: string | null;
  template_name: string | null;
  no_template: boolean;
  is_export_ready: boolean;
  project_scope_items: SubmittalProjectScopeItem[];
  per_item_rows: SubmittalRequirementRow[];
  summary: {
    project_scope_total: number;
    project_scope_satisfied: number;
    per_item_total: number;
    per_item_satisfied: number;
    override_count: number;
    stub_count: number;
    blocking_missing: number;
  };
}

// ─── Selection resolution helper ───────────────────────────────────────────────

interface SelectionSnapshot {
  mode: 'auto' | 'manual' | 'override' | 'needs_review' | 'no_candidates';
  resolved_canonical_product_id: string | null;
  is_override: boolean;
}

async function resolveSelectionForRequirement(req: {
  id: string;
  selected_candidate_type: string | null;
  selected_candidate_id: string | null;
  selection_is_override: boolean;
}): Promise<SelectionSnapshot> {
  if (!req.selected_candidate_type || !req.selected_candidate_id) {
    // Auto mode: find rank-1 evaluated decision
    const [top] = await db
      .select({ canonical_product_id: match_decisions.canonical_product_id })
      .from(match_decisions)
      .where(
        and(
          eq(match_decisions.requirement_id, req.id),
          eq(match_decisions.status, 'evaluated'),
          isNotNull(match_decisions.rank),
        ),
      )
      .orderBy(match_decisions.rank)
      .limit(1);

    return {
      mode: top ? 'auto' : 'no_candidates',
      resolved_canonical_product_id: top?.canonical_product_id ?? null,
      is_override: false,
    };
  }

  // Resolve stored selection back to canonical_product_id
  let canonicalId: string | null = null;
  if (req.selected_candidate_type === 'product') {
    canonicalId = req.selected_candidate_id;
  } else {
    const [combo] = await db
      .select({ canonical_product_id: delivery_combos.canonical_product_id })
      .from(delivery_combos)
      .where(eq(delivery_combos.id, req.selected_candidate_id))
      .limit(1);
    canonicalId = combo?.canonical_product_id ?? null;
  }

  if (!canonicalId) {
    return { mode: 'needs_review', resolved_canonical_product_id: null, is_override: req.selection_is_override };
  }

  const mode = req.selection_is_override ? 'override' : 'manual';
  return { mode, resolved_canonical_product_id: canonicalId, is_override: req.selection_is_override };
}

// ─── Main completeness builder ────────────────────────────────────────────────

export async function buildSubmittalCompleteness(
  projectId: string,
): Promise<SubmittalCompletenessResult> {
  // Load project + template assignment
  const [project] = await db
    .select({
      id: projects.id,
      submittal_template_id: projects.submittal_template_id,
      org_id: projects.organization_id,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return emptyResult(projectId);
  }

  if (!project.submittal_template_id) {
    return emptyResult(projectId);
  }

  // Load template + items
  const [template] = await db
    .select({ id: submittal_templates.id, name: submittal_templates.name })
    .from(submittal_templates)
    .where(eq(submittal_templates.id, project.submittal_template_id))
    .limit(1);

  if (!template) {
    return emptyResult(projectId);
  }

  const templateItems = await db
    .select()
    .from(submittal_template_items)
    .where(eq(submittal_template_items.template_id, template.id))
    .orderBy(submittal_template_items.sort_order);

  const projectScopeItems = templateItems.filter((i) => i.scope === 'project');
  const perItemTemplateItems = templateItems.filter((i) => i.scope === 'per_item');

  // ── Project-scope satisfaction ─────────────────────────────────────────────

  const projectDocs = await db
    .select({ document_type: project_documents.document_type })
    .from(project_documents)
    .where(eq(project_documents.project_id, projectId));

  const docTypeSet = new Set(projectDocs.map((d) => d.document_type));

  const resolvedProjectScope: SubmittalProjectScopeItem[] = projectScopeItems.map((item) => {
    const count = projectDocs.filter((d) => d.document_type === item.document_type).length;
    return {
      template_item_id: item.id,
      document_type:    item.document_type,
      label:            item.label,
      required:         item.required,
      satisfied:        docTypeSet.has(item.document_type),
      doc_count:        count,
    };
  });

  // ── Per-item satisfaction ──────────────────────────────────────────────────

  if (perItemTemplateItems.length === 0) {
    return buildResult(projectId, template, resolvedProjectScope, []);
  }

  // Load all matching requirements for this project
  const reqs = await db
    .select({
      id: matching_requirements.id,
      name: matching_requirements.name,
      item_code: matching_requirements.item_code,
      luminaire_type: matching_requirements.luminaire_type,
      selected_candidate_type: matching_requirements.selected_candidate_type,
      selected_candidate_id: matching_requirements.selected_candidate_id,
      selection_is_override: matching_requirements.selection_is_override,
    })
    .from(matching_requirements)
    .where(eq(matching_requirements.project_id, projectId));

  if (reqs.length === 0) {
    return buildResult(projectId, template, resolvedProjectScope, []);
  }

  // For non-compliance-statement per_item types: load linked docs
  const linkedDocs = await db
    .select({
      item_id: project_documents.item_id,
      document_type: project_documents.document_type,
    })
    .from(project_documents)
    .where(
      and(
        eq(project_documents.project_id, projectId),
        isNotNull(project_documents.item_id),
      ),
    );

  // Group linked docs by item_id + document_type for fast lookup
  const linkedDocMap = new Map<string, Set<string>>();
  for (const doc of linkedDocs) {
    if (!doc.item_id) continue;
    const key = doc.item_id;
    if (!linkedDocMap.has(key)) linkedDocMap.set(key, new Set());
    linkedDocMap.get(key)!.add(doc.document_type);
  }

  // Build per-item rows
  const perItemRows: SubmittalRequirementRow[] = [];

  for (const req of reqs) {
    let selectionSnapshot: SelectionSnapshot | null = null;

    // Lazy-load selection only if there's a compliance_statement template item
    const hasComplianceItem = perItemTemplateItems.some(
      (i) => i.document_type === 'compliance_statement',
    );
    if (hasComplianceItem) {
      selectionSnapshot = await resolveSelectionForRequirement(req);
    }

    const itemDetails: SubmittalPerItemDetail[] = perItemTemplateItems.map((tItem) => {
      const isCS = tItem.document_type === 'compliance_statement';

      if (isCS) {
        const snap = selectionSnapshot!;
        const resolved = snap.resolved_canonical_product_id !== null;
        const isStub = snap.mode === 'no_candidates';
        return {
          template_item_id:      tItem.id,
          document_type:         tItem.document_type,
          label:                 tItem.label,
          required:              tItem.required,
          satisfied:             resolved,
          is_compliance_statement: true,
          selection_mode:        snap.mode,
          is_override:           snap.is_override,
          is_stub:               isStub,
          doc_count:             0,
        };
      }

      const docsForItem = linkedDocMap.get(req.id);
      const docCount = docsForItem?.has(tItem.document_type) ? 1 : 0;
      // Count exact matches across all docs (not just one)
      const exactCount = linkedDocs.filter(
        (d) => d.item_id === req.id && d.document_type === tItem.document_type,
      ).length;

      return {
        template_item_id:      tItem.id,
        document_type:         tItem.document_type,
        label:                 tItem.label,
        required:              tItem.required,
        satisfied:             exactCount > 0,
        is_compliance_statement: false,
        selection_mode:        null,
        is_override:           false,
        is_stub:               false,
        doc_count:             exactCount,
      };
    });

    const allRequiredSatisfied = itemDetails
      .filter((i) => i.required)
      .every((i) => i.satisfied);

    perItemRows.push({
      requirement_id:        req.id,
      requirement_name:      req.name,
      item_code:             req.item_code,
      luminaire_type:        req.luminaire_type,
      items:                 itemDetails,
      all_required_satisfied: allRequiredSatisfied,
    });
  }

  return buildResult(projectId, template, resolvedProjectScope, perItemRows);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResult(
  projectId: string,
  template: { id: string; name: string },
  projectScope: SubmittalProjectScopeItem[],
  perItemRows: SubmittalRequirementRow[],
): SubmittalCompletenessResult {
  const psTotal     = projectScope.filter((i) => i.required).length;
  const psSatisfied = projectScope.filter((i) => i.required && i.satisfied).length;

  let piTotal = 0, piSatisfied = 0, overrideCount = 0, stubCount = 0;
  for (const row of perItemRows) {
    for (const item of row.items) {
      if (!item.required) continue;
      piTotal++;
      if (item.satisfied) piSatisfied++;
      if (item.is_override) overrideCount++;
      if (item.is_stub) stubCount++;
    }
  }

  const blockingMissing =
    projectScope.filter((i) => i.required && !i.satisfied).length +
    perItemRows.reduce(
      (sum, row) => sum + row.items.filter((i) => i.required && !i.satisfied).length,
      0,
    );

  return {
    project_id:         projectId,
    template_id:        template.id,
    template_name:      template.name,
    no_template:        false,
    is_export_ready:    blockingMissing === 0,
    project_scope_items: projectScope,
    per_item_rows:       perItemRows,
    summary: {
      project_scope_total:     psTotal,
      project_scope_satisfied: psSatisfied,
      per_item_total:          piTotal,
      per_item_satisfied:      piSatisfied,
      override_count:          overrideCount,
      stub_count:              stubCount,
      blocking_missing:        blockingMissing,
    },
  };
}

function emptyResult(projectId: string): SubmittalCompletenessResult {
  return {
    project_id:         projectId,
    template_id:        null,
    template_name:      null,
    no_template:        true,
    is_export_ready:    false,
    project_scope_items: [],
    per_item_rows:       [],
    summary: {
      project_scope_total: 0, project_scope_satisfied: 0,
      per_item_total: 0, per_item_satisfied: 0,
      override_count: 0, stub_count: 0, blocking_missing: 0,
    },
  };
}
