/**
 * Assembles per-luminaire compliance blocks for the export.
 *
 * For each BOQ item that has a product assigned:
 *   1. Prefers stored spec_comparison_results (respects manual overrides).
 *   2. Falls back to a live compareProductToSpec() call using the BOQ item's
 *      required_spec_profile snapshot when no stored run exists.
 *
 * Reuses lib/spec/comparator.ts — no comparison logic is duplicated here.
 */
import { eq, and, desc, asc, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { boq_items } from '../db/schema/boq';
import { products, product_attributes } from '../db/schema/products';
import {
  spec_comparison_runs,
  spec_comparison_results,
  project_spec_requirements,
} from '../db/schema/spec';
import { compareProductToSpec } from '../lib/spec/comparator';
import type { ComparisonResultStatus } from '../db/schema/spec';
import type { SpecProfileItem } from '../db/schema/boq';

// ─── Public types ──────────────────────────────────────────────────────────

export type ComplianceVerdict = 'comply' | 'comply_with_comment' | 'deviation' | 'missing';

export interface ComplianceRow {
  attribute_key: string;
  attribute_label: string;
  requirement_group: string | null;
  priority: 'mandatory' | 'preferred' | 'optional';
  /** Human-readable spec: e.g. "≥ 5000 lm" */
  specified_display: string;
  proposed_value: string | null;
  verdict: ComplianceVerdict;
  deviation_reason: string | null;
  is_overridden: boolean;
  override_notes: string | null;
  confidence_score: number | null;
}

export interface LuminaireComplianceBlock {
  boq_item_id: string;
  description: string;
  quantity: number;
  unit: string;
  sort_order: number;
  manufacturer: string | null;
  model_number: string | null;
  family_name: string | null;
  product_label: string;
  rows: ComplianceRow[];
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
  source: 'comparison_run' | 'live_calculation' | 'no_spec';
}

// ─── Internal helpers ──────────────────────────────────────────────────────

const OP_SYMBOLS: Record<string, string> = {
  eq: '=', gte: '≥', lte: '≤', gt: '>', lt: '<',
  contains: 'contains', range: 'between', any: 'any',
};

function specDisplay(op: string, value: string, unit: string | null): string {
  if (op === 'any') return 'Any non-empty value';
  const sym = OP_SYMBOLS[op] ?? op;
  return unit ? `${sym} ${value} ${unit}` : `${sym} ${value}`;
}

function toVerdict(status: ComparisonResultStatus): ComplianceVerdict {
  switch (status) {
    case 'compliant':     return 'comply';
    case 'review_needed': return 'comply_with_comment';
    case 'deviated':      return 'deviation';
    case 'missing':       return 'missing';
  }
}

/** Converts the SpecProfileItem[] snapshot stored on a BOQ row into the
 *  SpecRequirement shape expected by compareProductToSpec(). */
function profileToSpecReqs(profile: SpecProfileItem[]) {
  return profile.map((item, i) => ({
    id: `profile-${i}`,
    spec_document_id: '',
    section_name: null,
    requirement_group: null,
    attribute_key: item.attribute_key,
    attribute_label: item.attribute_label,
    operator: item.operator as 'eq' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'range' | 'any',
    target_value: item.target_value,
    target_unit: item.target_unit,
    tolerance_value: null,
    tolerance_unit: null,
    priority: item.priority,
    status: 'reviewed' as const,
    source_reference: null,
    notes: null,
    sort_order: i,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function buildComplianceBlocks(
  projectId: string,
  activeSpecDocumentId: string | null,
): Promise<LuminaireComplianceBlock[]> {
  const boqRows = await db
    .select({
      id: boq_items.id,
      description: boq_items.description,
      quantity: boq_items.quantity,
      unit: boq_items.unit,
      sort_order: boq_items.sort_order,
      product_id: boq_items.product_id,
      required_spec_profile: boq_items.required_spec_profile,
      spec_document_id: boq_items.spec_document_id,
    })
    .from(boq_items)
    .where(and(eq(boq_items.project_id, projectId), isNotNull(boq_items.product_id)))
    .orderBy(asc(boq_items.sort_order), asc(boq_items.created_at));

  if (boqRows.length === 0) return [];

  const blocks: LuminaireComplianceBlock[] = [];

  for (const item of boqRows) {
    const productId = item.product_id!;

    const [product] = await db
      .select({
        manufacturer: products.manufacturer,
        model_number: products.model_number,
        family_name: products.family_name,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) continue;

    const productLabel =
      [product.manufacturer, product.model_number, product.family_name]
        .filter(Boolean).join(' — ') || 'Unnamed product';

    // Prefer the active spec doc; fall back to the one linked on the BOQ item
    const specDocId = activeSpecDocumentId ?? item.spec_document_id;
    let rows: ComplianceRow[] = [];
    let source: LuminaireComplianceBlock['source'] = 'no_spec';

    // ── Path 1: stored comparison run (respects overrides) ────────────────
    if (specDocId) {
      const [run] = await db
        .select({ id: spec_comparison_runs.id })
        .from(spec_comparison_runs)
        .where(and(
          eq(spec_comparison_runs.spec_document_id, specDocId),
          eq(spec_comparison_runs.target_id, productId),
          eq(spec_comparison_runs.target_type, 'product'),
        ))
        .orderBy(desc(spec_comparison_runs.compared_at))
        .limit(1);

      if (run) {
        const resultRows = await db
          .select({
            attribute_key: spec_comparison_results.attribute_key,
            compared_value: spec_comparison_results.compared_value,
            comparison_status: spec_comparison_results.comparison_status,
            deviation_reason: spec_comparison_results.deviation_reason,
            confidence_score: spec_comparison_results.confidence_score,
            override_status: spec_comparison_results.override_status,
            override_notes: spec_comparison_results.override_notes,
            attribute_label: project_spec_requirements.attribute_label,
            operator: project_spec_requirements.operator,
            target_value: project_spec_requirements.target_value,
            target_unit: project_spec_requirements.target_unit,
            priority: project_spec_requirements.priority,
            requirement_group: project_spec_requirements.requirement_group,
          })
          .from(spec_comparison_results)
          .innerJoin(
            project_spec_requirements,
            eq(spec_comparison_results.spec_requirement_id, project_spec_requirements.id),
          )
          .where(eq(spec_comparison_results.comparison_run_id, run.id))
          .orderBy(asc(project_spec_requirements.sort_order));

        rows = resultRows.map((r) => {
          const effective = (r.override_status ?? r.comparison_status) as ComparisonResultStatus;
          return {
            attribute_key: r.attribute_key,
            attribute_label: r.attribute_label,
            requirement_group: r.requirement_group,
            priority: r.priority as 'mandatory' | 'preferred' | 'optional',
            specified_display: specDisplay(r.operator, r.target_value, r.target_unit),
            proposed_value: r.compared_value,
            verdict: toVerdict(effective),
            deviation_reason: r.deviation_reason,
            is_overridden: r.override_status != null,
            override_notes: r.override_notes ?? null,
            confidence_score: r.confidence_score,
          };
        });
        source = 'comparison_run';
      }
    }

    // ── Path 2: live comparison from BOQ required_spec_profile snapshot ───
    if (rows.length === 0) {
      const profile = item.required_spec_profile as SpecProfileItem[] | null;
      if (profile && profile.length > 0) {
        const attrs = await db
          .select()
          .from(product_attributes)
          .where(eq(product_attributes.product_id, productId));

        const reqs = profileToSpecReqs(profile);
        const reqByKey = new Map(reqs.map((r) => [r.attribute_key, r]));
        const { results } = compareProductToSpec(reqs, attrs);

        rows = results.map((r) => {
          const req = reqByKey.get(r.attribute_key);
          return {
            attribute_key: r.attribute_key,
            attribute_label: req?.attribute_label ?? r.attribute_key,
            requirement_group: null,
            priority: (req?.priority ?? 'mandatory') as 'mandatory' | 'preferred' | 'optional',
            specified_display: specDisplay(
              req?.operator ?? 'eq',
              req?.target_value ?? '',
              req?.target_unit ?? null,
            ),
            proposed_value: r.compared_value,
            verdict: toVerdict(r.comparison_status),
            deviation_reason: r.deviation_reason,
            is_overridden: false,
            override_notes: null,
            confidence_score: r.confidence_score,
          };
        });
        source = 'live_calculation';
      }
    }

    blocks.push({
      boq_item_id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      sort_order: item.sort_order,
      manufacturer: product.manufacturer,
      model_number: product.model_number,
      family_name: product.family_name,
      product_label: productLabel,
      rows,
      compliant_count:    rows.filter((r) => r.verdict === 'comply').length,
      deviated_count:     rows.filter((r) => r.verdict === 'deviation').length,
      missing_count:      rows.filter((r) => r.verdict === 'missing').length,
      review_needed_count: rows.filter((r) => r.verdict === 'comply_with_comment').length,
      source,
    });
  }

  return blocks;
}
