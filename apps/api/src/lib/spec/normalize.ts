/**
 * Centralized attribute value normalization.
 * Used by both the spec comparator and (later) the BOQ match engine.
 */

export interface NormalizedValue {
  /** Parsed numeric value, null if not parseable. */
  numeric: number | null;
  /** Lowercased, trimmed raw text. */
  text: string;
  /** Extracted unit string (e.g. 'lm', 'W', 'K', '°C'), null if none found. */
  unit: string | null;
}

// Known unit patterns (order matters — longer patterns first)
const UNIT_PATTERNS = [
  /^(\d+(?:[,\s]\d+)*(?:\.\d+)?)\s*(lm\/W|lm|lx|W|V|Hz|°C|°|K|h|kg|mm|cm|m|A|VA|VA\/W|%|IK\d+|IP\d+)/i,
  /^(IP\d+)/i,
  /^(IK\d+)/i,
  /^(Ra\s*(?:≥|>=|>)?\s*\d+)/i,
  /^([<>≥≤]=?\s*\d+(?:\.\d+)?)\s*(\S+)?/,
];

export function normalizeValue(raw: string | null | undefined): NormalizedValue {
  if (!raw || raw.trim() === '') {
    return { numeric: null, text: '', unit: null };
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // Strip common prefix operators for numeric comparison
  const withoutOp = trimmed.replace(/^[≥≤<>=]+\s*/, '');

  // Try to extract leading number + optional unit
  const numMatch = withoutOp.match(/^(\d+(?:[,\s]\d+)*(?:\.\d+)?)\s*([a-zA-Z°%\/]+\w*)?/);
  if (numMatch) {
    const numericStr = numMatch[1].replace(/[,\s]/g, '');
    const numeric = parseFloat(numericStr);
    const unit = numMatch[2] ?? null;
    return {
      numeric: isNaN(numeric) ? null : numeric,
      text: lower,
      unit: unit ? unit.trim() : null,
    };
  }

  // IP / IK ratings as special numeric: IP66 → 66
  const ipMatch = lower.match(/^ip\s*(\d+)/i);
  if (ipMatch) {
    return { numeric: parseFloat(ipMatch[1]), text: lower, unit: 'IP' };
  }

  const ikMatch = lower.match(/^ik\s*(\d+)/i);
  if (ikMatch) {
    return { numeric: parseFloat(ikMatch[1]), text: lower, unit: 'IK' };
  }

  return { numeric: null, text: lower, unit: null };
}

/**
 * Tries to determine if valueA satisfies the operator condition against valueB.
 * Returns null if normalization is insufficient to make a reliable decision.
 */
export function evaluateOperator(
  productValue: string | null | undefined,
  operator: string,
  specValue: string,
  toleranceValue?: string | null,
): 'pass' | 'fail' | 'uncertain' {
  const pv = normalizeValue(productValue);
  const sv = normalizeValue(specValue);

  if (!productValue) return 'fail'; // missing → will be handled as 'missing' upstream

  switch (operator) {
    case 'any':
      return pv.text ? 'pass' : 'fail';

    case 'eq':
      if (pv.numeric !== null && sv.numeric !== null) {
        return Math.abs(pv.numeric - sv.numeric) < 0.001 ? 'pass' : 'fail';
      }
      // Text comparison: tolerant (contains check or exact)
      if (pv.text === sv.text) return 'pass';
      if (pv.text.includes(sv.text) || sv.text.includes(pv.text)) return 'pass';
      return 'fail';

    case 'gte':
      if (pv.numeric === null || sv.numeric === null) return 'uncertain';
      return pv.numeric >= sv.numeric ? 'pass' : 'fail';

    case 'lte':
      if (pv.numeric === null || sv.numeric === null) return 'uncertain';
      return pv.numeric <= sv.numeric ? 'pass' : 'fail';

    case 'gt':
      if (pv.numeric === null || sv.numeric === null) return 'uncertain';
      return pv.numeric > sv.numeric ? 'pass' : 'fail';

    case 'lt':
      if (pv.numeric === null || sv.numeric === null) return 'uncertain';
      return pv.numeric < sv.numeric ? 'pass' : 'fail';

    case 'contains':
      return pv.text.includes(sv.text) ? 'pass' : 'fail';

    case 'range': {
      if (!toleranceValue) return 'uncertain';
      const tv = normalizeValue(toleranceValue);
      if (pv.numeric === null || sv.numeric === null || tv.numeric === null) return 'uncertain';
      return pv.numeric >= sv.numeric && pv.numeric <= tv.numeric ? 'pass' : 'fail';
    }

    default:
      return 'uncertain';
  }
}
