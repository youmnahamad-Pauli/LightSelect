/**
 * BOQ Candidate Service — Priority 14: smarter matching with explanation.
 *
 * Hierarchy:
 *   1. Products in the current project (boosted by scope)
 *   2. Products in other projects of the same org (workspace memory)
 *
 * Scoring:
 *   - Weighted attribute match via match-scorer.ts
 *   - Closeness bonus for numeric proximity
 *   - is_preferred: +0.15 boost
 *   - is_do_not_use: excluded entirely
 *   - Current-project products rank first on tie within a band
 *
 * Future:
 *   - Per-consultant weight profiles in consultant_templates
 *   - Manufacturer catalog rows as additional candidates (same interface)
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { products, product_attributes } from '../../db/schema/products';
import { projects } from '../../db/schema/projects';
import { project_spec_requirements } from '../../db/schema/spec';
import { scoreProduct, scoreToBand } from './match-scorer';
import type { SpecRequirement } from '../../db/schema/spec';
import type { CandidateEntry, SpecProfileItem } from '../../db/schema/boq';

// ─── Config ────────────────────────────────────────────────────────────────

const PREFERRED_BOOST = 0.15;
const MINIMUM_SCORE_THRESHOLD = 0.10; // exclude candidates scoring below this

// ─── Options ───────────────────────────────────────────────────────────────

interface SuggestOptions {
  projectId: string;
  orgId: string;
  specRequirements?: SpecRequirement[];
  specProfile?: SpecProfileItem[];
  limit?: number;
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function suggestCandidates(
  opts: SuggestOptions,
): Promise<CandidateEntry[]> {
  const { projectId, orgId, specRequirements, specProfile, limit = 10 } = opts;

  const requirements = buildRequirements(specRequirements, specProfile);

  // Fetch all org products with workspace flags
  const orgProducts = await db
    .select({
      id: products.id,
      manufacturer: products.manufacturer,
      family_name: products.family_name,
      model_number: products.model_number,
      project_id: products.project_id,
      is_preferred: products.is_preferred,
      is_do_not_use: products.is_do_not_use,
    })
    .from(products)
    .innerJoin(projects, eq(products.project_id, projects.id))
    .where(eq(projects.organization_id, orgId));

  if (orgProducts.length === 0) return [];

  const scored: CandidateEntry[] = [];

  for (const product of orgProducts) {
    // Skip do-not-use products entirely
    if (product.is_do_not_use) continue;

    const attrs = await db
      .select()
      .from(product_attributes)
      .where(eq(product_attributes.product_id, product.id));

    const isFromCurrentProject = product.project_id === projectId;

    // Score with the new match scorer
    let matchResult;
    if (requirements.length > 0) {
      matchResult = scoreProduct(requirements, attrs);
    } else {
      // No requirements: return a neutral result — candidate still visible but no score
      matchResult = {
        match_score: 0,
        match_band: 'none' as const,
        matched_attributes: [],
        deviated_attributes: [],
        missing_attributes: [],
        compliant_count: 0,
        deviated_count: 0,
        missing_count: 0,
        review_needed_count: 0,
        total_count: 0,
      };
    }

    // Apply preferred boost
    let finalScore = matchResult.match_score;
    if (product.is_preferred) {
      finalScore = Math.min(1.0, finalScore + PREFERRED_BOOST);
    }

    // Exclude very weak matches when requirements exist
    if (requirements.length > 0 && finalScore < MINIMUM_SCORE_THRESHOLD) continue;

    const label =
      [product.manufacturer, product.model_number, product.family_name]
        .filter(Boolean)
        .join(' — ') || 'Unnamed product';

    const finalBand = requirements.length > 0 ? scoreToBand(finalScore) : 'none';

    // Compute legacy compliance_score for backward compat
    const mandatoryReqs = requirements.filter((r) => r.priority === 'mandatory');
    const mandatoryTotal = mandatoryReqs.length;
    const compliance_score = mandatoryTotal === 0
      ? (matchResult.compliant_count / Math.max(matchResult.total_count, 1))
      : matchResult.compliant_count / mandatoryTotal;

    scored.push({
      product_id: product.id,
      product_label: label,
      manufacturer: product.manufacturer,
      model_number: product.model_number,
      compliance_score: parseFloat(compliance_score.toFixed(3)),
      match_score: parseFloat(finalScore.toFixed(3)),
      match_band: finalBand,
      is_from_current_project: isFromCurrentProject,
      is_preferred: product.is_preferred,
      is_do_not_use: false,
      matched_attributes: matchResult.matched_attributes,
      deviated_attributes: matchResult.deviated_attributes,
      missing_attributes: matchResult.missing_attributes,
      compliant_count: matchResult.compliant_count,
      deviated_count: matchResult.deviated_count,
      missing_count: matchResult.missing_count,
      review_needed_count: matchResult.review_needed_count,
      total_count: matchResult.total_count,
    });
  }

  // Sort:
  // 1. match_score DESC
  // 2. current project first on ties
  // 3. preferred flag as secondary boost
  scored.sort((a, b) => {
    const bScore = b.match_score ?? 0;
    const aScore = a.match_score ?? 0;
    if (bScore !== aScore) return bScore - aScore;
    // On tie: current project products first
    if (a.is_from_current_project !== b.is_from_current_project) {
      return a.is_from_current_project ? -1 : 1;
    }
    // Then preferred
    if (a.is_preferred !== b.is_preferred) {
      return a.is_preferred ? -1 : 1;
    }
    // Then fewer deviations
    if (a.deviated_count !== b.deviated_count) return a.deviated_count - b.deviated_count;
    return a.missing_count - b.missing_count;
  });

  return scored.slice(0, limit);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function profileToRequirements(profile: SpecProfileItem[]): SpecRequirement[] {
  return profile.map((item, i) => ({
    id: `profile-${i}`,
    spec_document_id: '',
    section_name: null,
    requirement_group: null,
    attribute_key: item.attribute_key,
    attribute_label: item.attribute_label,
    operator: item.operator as SpecRequirement['operator'],
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

function buildRequirements(
  specRequirements?: SpecRequirement[],
  specProfile?: SpecProfileItem[],
): SpecRequirement[] {
  if (specRequirements && specRequirements.length > 0) return specRequirements;
  if (specProfile && specProfile.length > 0) return profileToRequirements(specProfile);
  return [];
}
