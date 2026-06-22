/**
 * Writes mapped spec items to matching_requirements + matching_requirement_attrs.
 *
 * Each spec line item becomes one matching_requirements row.
 * Matchable attributes become matching_requirement_attrs rows.
 * Informational attributes are stored in matching_requirements.informational_attrs JSONB.
 *
 * Idempotent: if a requirement with the same (org_id, item_code) already exists,
 * it is deleted and recreated so re-runs produce a clean state.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import { matching_requirements, matching_requirement_attrs } from '../../db/schema/matching';
import type { MatchingOperator, GateType } from '../../db/schema/matching';
import type { MappedSpecItem, SpecItemWriteResult } from './types';

export async function writeSpecItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PostgresJsDatabase<any>,
  item: MappedSpecItem,
  orgId: string,
): Promise<SpecItemWriteResult> {
  // Delete any existing requirement for this org + item_code (cascade deletes attrs + decisions)
  if (item.item_code) {
    const existing = await db
      .select({ id: matching_requirements.id })
      .from(matching_requirements)
      .where(and(
        eq(matching_requirements.org_id, orgId),
        eq(matching_requirements.item_code, item.item_code),
      ));
    for (const r of existing) {
      await db.delete(matching_requirements).where(eq(matching_requirements.id, r.id));
    }
  }

  const needsReview =
    !item.luminaire_type ||
    item.luminaire_type_confidence < 0.8 ||
    item.unknown_keys.length > 0 ||
    item.low_confidence_flags.length > 0;

  const luminaireType = item.luminaire_type ?? 'unknown';

  const [newReq] = await db
    .insert(matching_requirements)
    .values({
      org_id: orgId,
      name: `${item.item_code} — ${item.description.slice(0, 100)}`,
      luminaire_type: luminaireType,
      description: item.description,
      item_code: item.item_code || null,
      informational_attrs: item.informational_attrs.length > 0 ? item.informational_attrs : null,
      flag_wind_load: false,
      flag_dark_sky: false,
      flag_bend_radius: false,
    })
    .returning({ id: matching_requirements.id });

  const requirementId = newReq.id;

  if (item.matchable_attrs.length > 0) {
    await db.insert(matching_requirement_attrs).values(
      item.matchable_attrs.map((a) => ({
        requirement_id: requirementId,
        attribute_key: a.attribute_key,
        operator: a.operator as MatchingOperator,
        target_value: a.target_value,
        target_unit: a.target_unit ?? undefined,
        gate_type: (a.gate_type ?? undefined) as GateType | undefined,
        weight: a.weight ?? undefined,
        notes: a.notes || undefined,
      })),
    );
  }

  return {
    requirement_id: requirementId,
    item_code: item.item_code,
    luminaire_type: item.luminaire_type,
    luminaire_type_confidence: item.luminaire_type_confidence,
    matchable_attrs_written: item.matchable_attrs.length,
    informational_attrs_count: item.informational_attrs.length,
    unknown_keys: item.unknown_keys,
    low_confidence_flags: item.low_confidence_flags,
    needs_review: needsReview,
  };
}
