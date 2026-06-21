/**
 * Numeric value extraction from attribute strings.
 *
 * Handles the messy extracted formats produced by the catalogue LLM:
 *   "90"  ">80"  "≥90"  "2064-2368 lm/m"  "3000K,4000K"  "9.6W/m"  etc.
 */

export interface ParsedNumericValue {
  /** Primary representative value (midpoint for ranges, stripped numeric for ">80"). */
  primary: number | null;
  min: number | null;
  max: number | null;
  /** All discrete string items (for comma/slash-separated lists such as CCT or certs). */
  items: string[];
  unit: string | null;
  raw: string;
}

const STRIP_UNITS_RE = /[a-zA-Z°/³²μ]+/g;
const RANGE_RE = /^([>≥<≤]?\s*[\d.]+)\s*[-–—]\s*([>≥<≤]?\s*[\d.]+)/;
const SINGLE_RE = /^([>≥<≤]?\s*[\d.]+)/;

function extractNumber(s: string): number | null {
  const cleaned = s.replace(/[>≥<≤\s]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function stripUnit(s: string): string {
  return s.replace(STRIP_UNITS_RE, '').replace(/\s+/g, '').trim();
}

function detectUnit(s: string): string | null {
  const m = s.match(/([a-zA-Z°/³²μ]+)/);
  return m ? m[1] : null;
}

/**
 * Parse an attribute value string into a structured form.
 *
 * For list values (comma/slash-separated) every item is returned in `items`.
 * For numeric values the primary, min, and max are populated.
 */
export function parseAttributeValue(raw: string): ParsedNumericValue {
  const trimmed = raw.trim();
  const unit = detectUnit(trimmed);

  // Strip units first so we don't misinterpret "/" inside unit strings like "W/m", "lm/m", "LED/m"
  const stripped = stripUnit(trimmed);

  // Lists: comma in the original string, or "/" in the UNIT-STRIPPED value (not from unit fractions)
  const hasComma  = trimmed.includes(',');
  const hasSlash  = stripped.includes('/');

  if ((hasComma || hasSlash) && !/^\s*[\d.>≥<≤]+\s*[-–—]\s*[\d.>≥<≤]+/.test(stripped)) {
    const splitSource = hasComma ? trimmed : stripped;
    const items = splitSource.split(/[,/]/).map((s) => s.replace(STRIP_UNITS_RE, '').trim()).filter(Boolean);
    return { primary: null, min: null, max: null, items, unit, raw };
  }

  // Range: "2064-2368" or "1.5–3.0"
  const rangeMatch = stripped.match(RANGE_RE) ?? trimmed.replace(STRIP_UNITS_RE, '').match(RANGE_RE);
  if (rangeMatch) {
    const lo = extractNumber(rangeMatch[1]);
    const hi = extractNumber(rangeMatch[2]);
    const primary = lo !== null && hi !== null ? (lo + hi) / 2 : (lo ?? hi);
    return { primary, min: lo, max: hi, items: [], unit, raw };
  }

  // Single value (possibly with inequality prefix)
  const singleMatch = stripped.match(SINGLE_RE) ?? trimmed.replace(STRIP_UNITS_RE, '').match(SINGLE_RE);
  if (singleMatch) {
    const v = extractNumber(singleMatch[1]);
    return { primary: v, min: v, max: v, items: [], unit, raw };
  }

  return { primary: null, min: null, max: null, items: [], unit, raw };
}

/**
 * Return a single representative number for ≥ comparisons (use the minimum
 * of the product's range — the worst-case lower bound).
 */
export function lowerBound(p: ParsedNumericValue): number | null {
  return p.min ?? p.primary;
}

/**
 * Return a single representative number for ≤ comparisons (use the maximum
 * of the product's range — the worst-case upper bound).
 */
export function upperBound(p: ParsedNumericValue): number | null {
  return p.max ?? p.primary;
}

/**
 * Return the midpoint (or single value) for match-target comparisons.
 */
export function midpoint(p: ParsedNumericValue): number | null {
  return p.primary;
}

/**
 * Parse an IP rating like "IP20", "IP65", "IP68" → numeric integer (20, 65, 68).
 * Returns null if the string is not a recognisable IP rating.
 */
export function parseIpRating(raw: string): number | null {
  const m = raw.toUpperCase().match(/IP\s*(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * Normalise a certification / distribution type string for comparison:
 * lowercase, strip spaces and punctuation.
 */
export function normCert(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '');
}
