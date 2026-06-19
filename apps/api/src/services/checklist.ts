/**
 * Checklist computation service.
 * Computes export readiness from live project data and upserts checklist_items,
 * preserving any existing waived status.
 */
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { projects, consultant_templates } from '../db/schema/projects';
import { consultant_template_sections } from '../db/schema/templates';
import { categories, document_types, category_document_requirements } from '../db/schema/categories';
import { project_files } from '../db/schema/project-files';
import { checklist_items } from '../db/schema/checklist';
import type { ChecklistItemStatus } from '../db/schema/checklist';

// ─── Result types ──────────────────────────────────────────────────────────

export interface ChecklistSectionItem {
  id: string;
  item_key: string;
  section_id: string;
  section_name: string;
  section_code: string | null;
  section_order: number;
  is_required: boolean;
  file_count: number;
  status: ChecklistItemStatus;
  source_rule: 'consultant_requirement';
}

export interface ChecklistCategoryItem {
  id: string;
  item_key: string;
  category_id: string;
  category_name: string;
  document_type_id: string;
  document_type_name: string;
  document_type_code: string | null;
  is_required: boolean;
  file_count: number;
  status: ChecklistItemStatus;
  source_rule: 'category_requirement';
}

export interface ChecklistResult {
  project_id: string;
  template_id: string | null;
  template_name: string | null;
  no_template: boolean;
  is_export_ready: boolean;
  blocking_count: number;
  total_required: number;
  complete_count: number;
  waived_count: number;
  section_items: ChecklistSectionItem[];
  category_items: ChecklistCategoryItem[];
}

// ─── Compute and persist ───────────────────────────────────────────────────

export async function buildChecklist(projectId: string): Promise<ChecklistResult> {
  // Fetch project + template name
  const [project] = await db
    .select({
      consultant_template_id: projects.consultant_template_id,
      template_name: consultant_templates.template_name,
    })
    .from(projects)
    .leftJoin(
      consultant_templates,
      eq(projects.consultant_template_id, consultant_templates.id),
    )
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return emptyResult(projectId, null, null);
  }

  if (!project.consultant_template_id) {
    return emptyResult(projectId, null, null);
  }

  // ── Section completeness ──────────────────────────────────────────────────

  const sectionRows = await db
    .select({
      section_id: consultant_template_sections.id,
      section_name: consultant_template_sections.section_name,
      section_code: consultant_template_sections.section_code,
      section_order: consultant_template_sections.section_order,
      is_required: consultant_template_sections.is_required,
      file_count: sql<number>`count(${project_files.id})::int`.as('file_count'),
    })
    .from(consultant_template_sections)
    .leftJoin(
      project_files,
      and(
        eq(project_files.consultant_template_section_id, consultant_template_sections.id),
        eq(project_files.project_id, projectId),
        eq(project_files.is_active, true),
      ),
    )
    .where(
      eq(
        consultant_template_sections.consultant_template_id,
        project.consultant_template_id,
      ),
    )
    .groupBy(
      consultant_template_sections.id,
      consultant_template_sections.section_name,
      consultant_template_sections.section_code,
      consultant_template_sections.section_order,
      consultant_template_sections.is_required,
    )
    .orderBy(asc(consultant_template_sections.section_order));

  // ── Category requirement completeness ─────────────────────────────────────

  // Categories actively used in this project's mapped files
  const usedCats = await db
    .selectDistinct({ category_id: project_files.category_id })
    .from(project_files)
    .where(and(eq(project_files.project_id, projectId), eq(project_files.is_active, true)));

  const usedCatIds = usedCats.map((r) => r.category_id);

  let categoryReqRows: {
    category_id: string;
    category_name: string;
    document_type_id: string;
    document_type_name: string;
    document_type_code: string | null;
    is_req: boolean;
    file_count: number;
  }[] = [];

  if (usedCatIds.length > 0) {
    categoryReqRows = await db
      .select({
        category_id: categories.id,
        category_name: categories.name,
        document_type_id: document_types.id,
        document_type_name: document_types.name,
        document_type_code: document_types.code,
        is_req: category_document_requirements.is_required,
        file_count: sql<number>`count(${project_files.id})::int`.as('file_count'),
      })
      .from(category_document_requirements)
      .innerJoin(categories, eq(category_document_requirements.category_id, categories.id))
      .innerJoin(
        document_types,
        eq(category_document_requirements.document_type_id, document_types.id),
      )
      .leftJoin(
        project_files,
        and(
          eq(project_files.category_id, category_document_requirements.category_id),
          eq(project_files.document_type_id, category_document_requirements.document_type_id),
          eq(project_files.project_id, projectId),
          eq(project_files.is_active, true),
        ),
      )
      .where(
        and(
          sql`${category_document_requirements.category_id} = ANY(ARRAY[${sql.join(
            usedCatIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .groupBy(
        categories.id,
        categories.name,
        document_types.id,
        document_types.name,
        document_types.code,
        category_document_requirements.is_required,
      );
  }

  // ── Load existing waivers ─────────────────────────────────────────────────

  const existingItems = await db
    .select({ item_key: checklist_items.item_key, status: checklist_items.status })
    .from(checklist_items)
    .where(eq(checklist_items.project_id, projectId));

  const waivedKeys = new Set(
    existingItems.filter((i) => i.status === 'waived').map((i) => i.item_key),
  );

  // ── Build computed items ──────────────────────────────────────────────────

  const sectionInserts = sectionRows.map((r) => {
    const item_key = `section:${r.section_id}`;
    const computed: ChecklistItemStatus = r.file_count > 0 ? 'complete' : 'missing';
    const status: ChecklistItemStatus = waivedKeys.has(item_key) ? 'waived' : computed;
    return {
      item_key,
      item: {
        project_id: projectId,
        consultant_template_section_id: r.section_id,
        item_key,
        item_label: r.section_name,
        source_rule: 'consultant_requirement' as const,
        is_required: r.is_required,
        status,
      },
      view: {
        section_id: r.section_id,
        section_name: r.section_name,
        section_code: r.section_code,
        section_order: r.section_order,
        is_required: r.is_required,
        file_count: r.file_count,
        status,
        item_key,
        source_rule: 'consultant_requirement' as const,
      },
    };
  });

  const categoryInserts = categoryReqRows.map((r) => {
    const item_key = `cat:${r.category_id}:dt:${r.document_type_id}`;
    const computed: ChecklistItemStatus = r.file_count > 0 ? 'complete' : 'missing';
    const status: ChecklistItemStatus = waivedKeys.has(item_key) ? 'waived' : computed;
    return {
      item_key,
      item: {
        project_id: projectId,
        category_id: r.category_id,
        document_type_id: r.document_type_id,
        item_key,
        item_label: `${r.category_name} — ${r.document_type_name}`,
        source_rule: 'category_requirement' as const,
        is_required: r.is_req,
        status,
      },
      view: {
        category_id: r.category_id,
        category_name: r.category_name,
        document_type_id: r.document_type_id,
        document_type_name: r.document_type_name,
        document_type_code: r.document_type_code,
        is_required: r.is_req,
        file_count: r.file_count,
        status,
        item_key,
        source_rule: 'category_requirement' as const,
      },
    };
  });

  // ── Upsert to checklist_items ─────────────────────────────────────────────

  const allInserts = [
    ...sectionInserts.map((i) => i.item),
    ...categoryInserts.map((i) => i.item),
  ];

  if (allInserts.length > 0) {
    for (const row of allInserts) {
      await db
        .insert(checklist_items)
        .values({ ...row, updated_at: new Date() })
        .onConflictDoUpdate({
          target: [checklist_items.project_id, checklist_items.item_key],
          set: {
            // Preserve waived status; otherwise update to computed
            status: sql`CASE WHEN ${checklist_items.status} = 'waived' THEN 'waived'::text ELSE excluded.status END`,
            item_label: sql`excluded.item_label`,
            is_required: sql`excluded.is_required`,
            updated_at: sql`now()`,
          },
        });
    }
  }

  // Re-fetch IDs from DB after upsert
  const persistedItems = await db
    .select({ id: checklist_items.id, item_key: checklist_items.item_key, status: checklist_items.status })
    .from(checklist_items)
    .where(eq(checklist_items.project_id, projectId));

  const idByKey = new Map(persistedItems.map((i) => [i.item_key, i.id]));
  const statusByKey = new Map(persistedItems.map((i) => [i.item_key, i.status]));

  // Build final views using persisted status (which may have been waived)
  const finalSections: ChecklistSectionItem[] = sectionInserts.map((s) => ({
    ...s.view,
    id: idByKey.get(s.item_key) ?? '',
    status: (statusByKey.get(s.item_key) ?? s.view.status) as ChecklistItemStatus,
  }));

  const finalCategories: ChecklistCategoryItem[] = categoryInserts.map((c) => ({
    ...c.view,
    id: idByKey.get(c.item_key) ?? '',
    status: (statusByKey.get(c.item_key) ?? c.view.status) as ChecklistItemStatus,
  }));

  // ── Compute summary ───────────────────────────────────────────────────────

  const allItems = [...finalSections, ...finalCategories];
  const required = allItems.filter((i) => i.is_required);
  const blocking = required.filter((i) => i.status === 'missing');
  const complete = allItems.filter((i) => i.status === 'complete');
  const waived = allItems.filter((i) => i.status === 'waived');

  return {
    project_id: projectId,
    template_id: project.consultant_template_id,
    template_name: project.template_name,
    no_template: false,
    is_export_ready: blocking.length === 0,
    blocking_count: blocking.length,
    total_required: required.length,
    complete_count: complete.length,
    waived_count: waived.length,
    section_items: finalSections,
    category_items: finalCategories,
  };
}

function emptyResult(
  projectId: string,
  templateId: string | null,
  templateName: string | null,
): ChecklistResult {
  return {
    project_id: projectId,
    template_id: templateId,
    template_name: templateName,
    no_template: true,
    is_export_ready: false,
    blocking_count: 0,
    total_required: 0,
    complete_count: 0,
    waived_count: 0,
    section_items: [],
    category_items: [],
  };
}
