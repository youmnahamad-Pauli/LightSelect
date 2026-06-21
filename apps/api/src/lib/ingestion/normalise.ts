/**
 * Normalisation helpers — identical logic to registry-backfill.ts.
 * Extracted here so the ingestion pipeline can apply the same dedup rules.
 */

export function normalizeForKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function buildDedupKey(manufacturer: string, modelCode: string): string {
  return `${normalizeForKey(manufacturer)}::${normalizeForKey(modelCode)}`;
}

export function buildDisplayName(manufacturer: string, modelCode: string | null, productName: string): string {
  if (modelCode) return `${manufacturer} — ${modelCode}`;
  return `${manufacturer} — ${productName}`;
}

export function buildSoftHint(
  manufacturer: string,
  productName: string,
  attrs: Record<string, { value: string; confidence: number }>,
): string {
  const m = normalizeForKey(manufacturer);
  const n = normalizeForKey(productName);
  const cct = normalizeForKey(attrs['cct']?.value ?? '');
  const w   = normalizeForKey(attrs['watts']?.value ?? attrs['watts_per_metre']?.value ?? '');
  const lm  = normalizeForKey(attrs['lumens']?.value ?? attrs['lumens_per_metre']?.value ?? '');
  const ip  = normalizeForKey(attrs['ip_rating']?.value ?? '');
  return `soft::${m}::${n}::${cct}:${w}:${lm}:${ip}`;
}
