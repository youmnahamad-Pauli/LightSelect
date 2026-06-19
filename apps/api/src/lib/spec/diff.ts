/**
 * Spec version diff — computes structured diff between two sets of requirements.
 */
import type { SpecRequirement } from '../../db/schema/spec';

interface ReqSummary {
  attribute_key: string;
  attribute_label: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  priority: string;
}

export interface AddedDiffItem extends ReqSummary {}
export interface RemovedDiffItem extends ReqSummary {}
export interface ChangedDiffItem {
  attribute_key: string;
  attribute_label: string;
  from: { operator: string; target_value: string; target_unit: string | null; priority: string };
  to: { operator: string; target_value: string; target_unit: string | null; priority: string };
}

export interface DiffSummary {
  added: AddedDiffItem[];
  removed: RemovedDiffItem[];
  changed: ChangedDiffItem[];
  counts: {
    added: number;
    removed: number;
    changed: number;
    total_from: number;
    total_to: number;
  };
}

function toSummary(r: SpecRequirement): ReqSummary {
  return {
    attribute_key: r.attribute_key,
    attribute_label: r.attribute_label,
    operator: r.operator,
    target_value: r.target_value,
    target_unit: r.target_unit,
    priority: r.priority,
  };
}

function reqsEqual(a: SpecRequirement, b: SpecRequirement): boolean {
  return (
    a.operator === b.operator &&
    a.target_value === b.target_value &&
    a.target_unit === b.target_unit &&
    a.priority === b.priority
  );
}

export function computeDiff(
  fromReqs: SpecRequirement[],
  toReqs: SpecRequirement[],
): DiffSummary {
  const fromByKey = new Map(fromReqs.map((r) => [r.attribute_key, r]));
  const toByKey = new Map(toReqs.map((r) => [r.attribute_key, r]));

  const added: AddedDiffItem[] = [];
  const removed: RemovedDiffItem[] = [];
  const changed: ChangedDiffItem[] = [];

  for (const toReq of toReqs) {
    const fromReq = fromByKey.get(toReq.attribute_key);
    if (!fromReq) {
      added.push(toSummary(toReq));
    } else if (!reqsEqual(fromReq, toReq)) {
      changed.push({
        attribute_key: toReq.attribute_key,
        attribute_label: toReq.attribute_label,
        from: {
          operator: fromReq.operator,
          target_value: fromReq.target_value,
          target_unit: fromReq.target_unit,
          priority: fromReq.priority,
        },
        to: {
          operator: toReq.operator,
          target_value: toReq.target_value,
          target_unit: toReq.target_unit,
          priority: toReq.priority,
        },
      });
    }
  }

  for (const fromReq of fromReqs) {
    if (!toByKey.has(fromReq.attribute_key)) {
      removed.push(toSummary(fromReq));
    }
  }

  return {
    added,
    removed,
    changed,
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      total_from: fromReqs.length,
      total_to: toReqs.length,
    },
  };
}
