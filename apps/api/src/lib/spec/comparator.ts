/**
 * Spec comparator — compares a product's attributes against a spec document's requirements.
 * Reusable by BOQ / candidate-matching modules.
 */
import type { SpecRequirement, ComparisonResultStatus } from '../../db/schema/spec';
import type { ProductAttribute } from '../../db/schema/products';
import { evaluateOperator, normalizeValue } from './normalize';

export interface ComparisonResultRow {
  spec_requirement_id: string;
  attribute_key: string;
  compared_value: string | null;
  compared_unit: string | null;
  comparison_status: ComparisonResultStatus;
  deviation_reason: string | null;
  confidence_score: number;
  source_reference: string | null;
}

export interface ComparisonSummary {
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
}

export function compareProductToSpec(
  requirements: SpecRequirement[],
  attributes: ProductAttribute[],
): { results: ComparisonResultRow[]; summary: ComparisonSummary } {
  const attrByKey = new Map(attributes.map((a) => [a.attribute_name, a]));
  const results: ComparisonResultRow[] = [];

  for (const req of requirements) {
    const attr = attrByKey.get(req.attribute_key);

    if (!attr || !attr.attribute_value) {
      results.push({
        spec_requirement_id: req.id,
        attribute_key: req.attribute_key,
        compared_value: null,
        compared_unit: null,
        comparison_status: 'missing',
        deviation_reason: 'Attribute not found in product data.',
        confidence_score: 1.0,
        source_reference: null,
      });
      continue;
    }

    // If attribute was marked NA, treat as missing
    if (attr.value_source === 'na') {
      results.push({
        spec_requirement_id: req.id,
        attribute_key: req.attribute_key,
        compared_value: 'N/A',
        compared_unit: null,
        comparison_status: 'missing',
        deviation_reason: 'Product attribute marked as not applicable.',
        confidence_score: 0.9,
        source_reference: null,
      });
      continue;
    }

    const norm = normalizeValue(attr.attribute_value);
    const verdict = evaluateOperator(
      attr.attribute_value,
      req.operator,
      req.target_value,
      req.tolerance_value,
    );

    let status: ComparisonResultStatus;
    let deviationReason: string | null = null;
    let confidence: number;

    switch (verdict) {
      case 'pass':
        status = 'compliant';
        confidence = attr.value_source === 'extracted'
          ? (attr.confidence_score ?? 0.8)
          : 0.95;
        break;
      case 'fail':
        status = 'deviated';
        confidence = 0.88;
        deviationReason = buildDeviationReason(req, attr.attribute_value);
        break;
      case 'uncertain':
        status = 'review_needed';
        confidence = 0.45;
        deviationReason = 'Value format or unit could not be reliably compared. Manual review recommended.';
        break;
    }

    results.push({
      spec_requirement_id: req.id,
      attribute_key: req.attribute_key,
      compared_value: attr.attribute_value,
      compared_unit: norm.unit,
      comparison_status: status!,
      deviation_reason: deviationReason,
      confidence_score: confidence!,
      source_reference: attr.value_source === 'extracted' ? 'Extracted from manufacturer PDF' : null,
    });
  }

  const summary: ComparisonSummary = {
    compliant_count: results.filter((r) => r.comparison_status === 'compliant').length,
    deviated_count: results.filter((r) => r.comparison_status === 'deviated').length,
    missing_count: results.filter((r) => r.comparison_status === 'missing').length,
    review_needed_count: results.filter((r) => r.comparison_status === 'review_needed').length,
  };

  return { results, summary };
}

function buildDeviationReason(req: SpecRequirement, actualValue: string): string {
  const spec = normalizeValue(req.target_value);
  const actual = normalizeValue(actualValue);

  const opLabel: Record<string, string> = {
    gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=', contains: 'contains',
  };
  const op = opLabel[req.operator] ?? req.operator;

  if (spec.numeric !== null && actual.numeric !== null) {
    return `Required ${op} ${req.target_value}${req.target_unit ? ' ' + req.target_unit : ''}; found ${actualValue}.`;
  }
  return `Required value "${req.target_value}" not satisfied by "${actualValue}".`;
}
