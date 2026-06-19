/**
 * Export snapshot service.
 * Computes immutable snapshots at export generation time and
 * inserts export_package_items / export_package_boq_items rows.
 */
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { projects } from '../db/schema/projects';
import { consultant_template_sections } from '../db/schema/templates';
import { project_files } from '../db/schema/project-files';
import { files } from '../db/schema/files';
import { categories, document_types } from '../db/schema/categories';
import { project_spec_documents } from '../db/schema/spec';
import { boq_items } from '../db/schema/boq';
import { checklist_items } from '../db/schema/checklist';
import {
  export_package_items,
  export_package_boq_items,
} from '../db/schema/exports';
import { buildChecklist } from './checklist';

// ─── Snapshot types (stored as JSONB) ─────────────────────────────────────

export interface ChecklistSnapshot {
  total_required: number;
  complete_count: number;
  missing_count: number;
  waived_count: number;
  is_export_ready: boolean;
  template_name: string | null;
  blocking_items: { item_label: string; source_rule: string }[];
}

export interface BoqSnapshot {
  total_items: number;
  total_quantity: number;
  total_price: number | null;
  currency: string | null;
  items_with_product: number;
  compliance_bands: {
    fully_compliant: number;
    mostly_compliant: number;
    partially_compliant: number;
    poor_or_missing: number;
  };
}

// ─── Checklist snapshot ────────────────────────────────────────────────────

export async function buildChecklistSnapshot(
  projectId: string,
): Promise<{ snapshot: ChecklistSnapshot; is_export_ready: boolean }> {
  const result = await buildChecklist(projectId);

  const blockingItems = [
    ...result.section_items,
    ...result.category_items,
  ]
    .filter((i) => i.is_required && i.status === 'missing')
    .map((i) => ({
      item_label: 'section_name' in i ? i.section_name : `${'category_name' in i ? i.category_name : ''} — ${'document_type_name' in i ? i.document_type_name : ''}`,
      source_rule: i.source_rule,
    }));

  const snapshot: ChecklistSnapshot = {
    total_required: result.total_required,
    complete_count: result.complete_count,
    missing_count: result.blocking_count,
    waived_count: result.waived_count,
    is_export_ready: result.is_export_ready,
    template_name: result.template_name,
    blocking_items: blockingItems,
  };

  return { snapshot, is_export_ready: result.is_export_ready };
}

// ─── BOQ snapshot ──────────────────────────────────────────────────────────

export async function buildBoqSnapshot(projectId: string): Promise<BoqSnapshot> {
  const items = await db
    .select()
    .from(boq_items)
    .where(eq(boq_items.project_id, projectId));

  if (items.length === 0) {
    return {
      total_items: 0,
      total_quantity: 0,
      total_price: null,
      currency: null,
      items_with_product: 0,
      compliance_bands: { fully_compliant: 0, mostly_compliant: 0, partially_compliant: 0, poor_or_missing: 0 },
    };
  }

  const total_quantity = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const total_price = items.some((i) => i.total_price != null)
    ? items.reduce((s, i) => s + (i.total_price ?? 0), 0)
    : null;
  const currency = items[0]?.currency ?? null;
  const items_with_product = items.filter((i) => i.product_id).length;

  const bands = { fully_compliant: 0, mostly_compliant: 0, partially_compliant: 0, poor_or_missing: 0 };
  for (const item of items) {
    const s = item.compliance_score ?? 0;
    if (s >= 1.0) bands.fully_compliant++;
    else if (s >= 0.8) bands.mostly_compliant++;
    else if (s >= 0.5) bands.partially_compliant++;
    else bands.poor_or_missing++;
  }

  return { total_items: items.length, total_quantity, total_price, currency, items_with_product, compliance_bands: bands };
}

// ─── Package items (section ↔ file) ───────────────────────────────────────

export async function buildAndInsertPackageItems(
  projectId: string,
  exportPackageId: string,
): Promise<void> {
  // Load all active project files joined with their section and file metadata
  const rows = await db
    .select({
      section_id: consultant_template_sections.id,
      section_name: consultant_template_sections.section_name,
      section_code: consultant_template_sections.section_code,
      section_order: consultant_template_sections.section_order,
      is_section_required: consultant_template_sections.is_required,
      project_file_id: project_files.id,
      file_id: project_files.file_id,
      file_name: files.original_file_name,
      category_name: categories.name,
      document_type_name: document_types.name,
    })
    .from(project_files)
    .innerJoin(
      consultant_template_sections,
      eq(project_files.consultant_template_section_id, consultant_template_sections.id),
    )
    .innerJoin(files, eq(project_files.file_id, files.id))
    .innerJoin(categories, eq(project_files.category_id, categories.id))
    .innerJoin(document_types, eq(project_files.document_type_id, document_types.id))
    .where(and(eq(project_files.project_id, projectId), eq(project_files.is_active, true)))
    .orderBy(
      asc(consultant_template_sections.section_order),
      asc(project_files.created_at),
    );

  if (rows.length === 0) return;

  await db.insert(export_package_items).values(
    rows.map((r, i) => ({
      export_package_id: exportPackageId,
      section_id: r.section_id,
      section_name: r.section_name,
      section_code: r.section_code,
      section_order: r.section_order,
      is_section_required: r.is_section_required,
      project_file_id: r.project_file_id,
      file_id: r.file_id,
      file_name: r.file_name,
      category_name: r.category_name,
      document_type_name: r.document_type_name,
      sort_order: i,
    })),
  );
}

// ─── BOQ items snapshot ────────────────────────────────────────────────────

export async function buildAndInsertBoqItems(
  projectId: string,
  exportPackageId: string,
): Promise<void> {
  const items = await db
    .select()
    .from(boq_items)
    .where(eq(boq_items.project_id, projectId))
    .orderBy(asc(boq_items.sort_order), asc(boq_items.created_at));

  if (items.length === 0) return;

  await db.insert(export_package_boq_items).values(
    items.map((item, i) => {
      const candidates = (item.candidate_product_ids as any[]) ?? [];
      const selected = item.product_id
        ? candidates.find((c) => c.product_id === item.product_id) ?? candidates[0]
        : candidates[0];

      return {
        export_package_id: exportPackageId,
        boq_item_id: item.id,
        description: item.description,
        category_name: item.category_id ? undefined : null,
        quantity: item.quantity,
        unit: item.unit,
        product_name: selected?.product_label ?? null,
        manufacturer: selected?.manufacturer ?? null,
        model_code: selected?.model_number ?? null,
        compliance_score: item.compliance_score,
        unit_price: item.unit_price,
        total_price: item.total_price,
        currency: item.currency,
        sort_order: i,
      };
    }),
  );
}

// ─── Active spec document ──────────────────────────────────────────────────

export async function getActiveSpecDocumentId(projectId: string): Promise<string | null> {
  const [doc] = await db
    .select({ id: project_spec_documents.id })
    .from(project_spec_documents)
    .where(
      and(
        eq(project_spec_documents.project_id, projectId),
        eq(project_spec_documents.is_active, true),
      ),
    )
    .limit(1);
  return doc?.id ?? null;
}
