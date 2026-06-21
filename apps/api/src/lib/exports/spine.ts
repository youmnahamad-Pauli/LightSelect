/**
 * Phase 5 exports — consultant-agnostic data spine.
 *
 * MatchDecisionExportSource.resolve() queries the DB for a given
 * requirement + chosen candidate (default = top-ranked match) and
 * returns a normalised ComplianceStatement ready for template rendering.
 *
 * No rendering logic here — the spine is a pure data assembly step.
 */
import { eq, asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  matching_requirements,
  matching_requirement_attrs,
  match_decisions,
  match_evidence,
} from '../../db/schema/matching';
import { canonical_products, product_attribute_values } from '../../db/schema/registry';
import type { VerdictType } from '../../db/schema/matching';
import type {
  ComplianceStatement, StatementMetadata, ProposedProduct,
  AttributeEntry, GateResult, SpineVerdict,
} from './types';

// ─── Attribute label map ──────────────────────────────────────────────────────

const ATTR_LABELS: Record<string, string> = {
  ip_rating:        'IP Rating',
  voltage:          'Supply Voltage',
  colour_family:    'Colour Type',
  cct:              'CCT (K)',
  cri:              'CRI (Ra)',
  lumens_per_metre: 'Luminous Output (lm/m)',
  watts_per_metre:  'Power Consumption (W/m)',
  led_per_metre:    'LED Density (LED/m)',
  lumens:           'Luminous Output (lm)',
  watts:            'Power Consumption (W)',
  dimmable:         'Dimmable',
  colour_mode:      'Colour Mode',
  addressability:   'Addressability',
  beam_angle:       'Beam Angle',
  mounting:         'Mounting Type',
  dimensions:       'Dimensions',
  cut_interval:     'Cut Interval',
  max_run:          'Max Run Length',
  bend_plane:       'Bend Plane',
  min_bend_radius:  'Min Bend Radius',
};

function attrLabel(key: string): string {
  return ATTR_LABELS[key] ??
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Specified value formatter ────────────────────────────────────────────────

function formatSpecified(
  operator: string,
  value: string | null,
  unit: string | null,
): string | null {
  if (!value) return null;
  const withUnit = unit ? `${value} ${unit}` : value;
  switch (operator) {
    case 'gte':                return `≥ ${withUnit}`;   // ≥
    case 'lte':                return `≤ ${withUnit}`;   // ≤
    case 'eq':                 return withUnit;
    case 'match_target':       return `~${withUnit}`;
    case 'match_target_lumen': return `~${withUnit}`;
    case 'match_target_cct':   return withUnit;
    case 'colour_family_gate': return withUnit;
    case 'range_covers':       return `covers ${withUnit}`;
    default:                   return withUnit;
  }
}

// ─── Verdict mapper: engine VerdictType → spine SpineVerdict ─────────────────

function toSpineVerdict(v: VerdictType): SpineVerdict | null {
  switch (v) {
    case 'gate_pass':
    case 'comply':
      return 'comply';
    case 'comment':
      return 'comply_with_comment';
    case 'gate_fail':
    case 'deviation':
      return 'deviation';
    case 'gate_unverifiable':
      return 'comply_with_comment';
    case 'not_applicable':
      return null;
    default:
      return null;
  }
}

// ─── Comment cleaner ──────────────────────────────────────────────────────────

/**
 * Strips the leading "attribute_key: value — " prefix from evidence notes
 * so templates receive a concise action string ("undershoot 7.5% …").
 * For notes that don't match the pattern, returns the note unchanged.
 * For comply entries, no comment is needed — returns null.
 */
function cleanComment(
  evidenceNote: string | null,
  attributeKey: string,
  verdict: SpineVerdict | null,
): string | null {
  if (!evidenceNote) return null;
  if (verdict === 'comply') return null; // clean complies need no comment

  const prefix = `${attributeKey}: `;
  if (evidenceNote.startsWith(prefix)) {
    const rest = evidenceNote.slice(prefix.length);
    const dashIdx = rest.indexOf(' — '); // " — "
    if (dashIdx !== -1 && dashIdx < 40) {
      return rest.slice(dashIdx + 3);
    }
    return rest;
  }
  return evidenceNote;
}

// ─── Spine options ────────────────────────────────────────────────────────────

export interface SpineOptions {
  project_name?: string;
  consultant?: string;
  /** Display date string. Defaults to today in "DD MMM YYYY" format. */
  date?: string;
  revision?: string;
  ref?: string;
  /** XLSX sheet name / BOQ item code. Defaults to luminaire_type slug. */
  item_code?: string;
  /** Human-readable item type label. Defaults to requirement.name. */
  item_type?: string;
}

// ─── MatchDecisionExportSource ────────────────────────────────────────────────

export class MatchDecisionExportSource {
  /**
   * Resolve a ComplianceStatement from the DB.
   *
   * @param db          Drizzle DB instance (postgres-js or node-postgres)
   * @param requirementId  The matching requirement to export
   * @param candidateId    Specific product to propose. Defaults to rank-1 match.
   * @param options        Metadata overrides (project name, date, item code…)
   */
  static async resolve(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: PostgresJsDatabase<any>,
    requirementId: string,
    candidateId?: string,
    options?: SpineOptions,
  ): Promise<ComplianceStatement> {

    // ── 1. Load requirement + attrs ──────────────────────────────────────

    const [req] = await db
      .select()
      .from(matching_requirements)
      .where(eq(matching_requirements.id, requirementId))
      .limit(1);

    if (!req) throw new Error(`Requirement ${requirementId} not found`);

    const reqAttrs = await db
      .select()
      .from(matching_requirement_attrs)
      .where(eq(matching_requirement_attrs.requirement_id, requirementId));

    const reqAttrMap = new Map(reqAttrs.map((a) => [a.attribute_key, a]));

    // ── 2. Find decision ─────────────────────────────────────────────────

    let decision: typeof match_decisions.$inferSelect | undefined;

    if (candidateId) {
      const rows = await db
        .select()
        .from(match_decisions)
        .where(eq(match_decisions.requirement_id, requirementId));
      decision = rows.find((d) => d.canonical_product_id === candidateId);
    } else {
      // Default: top-ranked evaluated decision
      const rows = await db
        .select()
        .from(match_decisions)
        .where(eq(match_decisions.requirement_id, requirementId));
      decision = rows
        .filter((d) => d.status === 'evaluated' && d.rank !== null)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];
    }

    if (!decision) {
      throw new Error(
        `No match decisions found for requirement ${requirementId}. Run matching first.`,
      );
    }

    // ── 3. Load evidence ─────────────────────────────────────────────────

    const evidence = await db
      .select()
      .from(match_evidence)
      .where(eq(match_evidence.match_decision_id, decision.id))
      .orderBy(asc(match_evidence.created_at));

    // ── 4. Load product + attributes ─────────────────────────────────────

    const [product] = await db
      .select()
      .from(canonical_products)
      .where(eq(canonical_products.id, decision.canonical_product_id))
      .limit(1);

    const productAttrRows = await db
      .select()
      .from(product_attribute_values)
      .where(
        eq(product_attribute_values.canonical_product_id, decision.canonical_product_id),
      );

    const productAttrMap = new Map(
      productAttrRows.map((a) => [a.attribute_key, a.attribute_value]),
    );

    // ── 5. Build metadata ────────────────────────────────────────────────

    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    const luminaireSlug = req.luminaire_type
      .replace(/_/g, '-')
      .toUpperCase()
      .slice(0, 31);

    const metadata: StatementMetadata = {
      project_name: options?.project_name ?? 'LightSelect Project',
      consultant:   options?.consultant   ?? 'AECOM',
      date:         options?.date         ?? today,
      revision:     options?.revision     ?? 'Rev A',
      ref:          options?.ref          ?? req.id.slice(0, 8).toUpperCase(),
      item_code:    options?.item_code    ?? luminaireSlug,
      item_type:    options?.item_type    ?? req.name,
    };

    // ── 6. Build attribute entries ───────────────────────────────────────

    const attributes: AttributeEntry[] = evidence.map((ev) => {
      const reqAttr = reqAttrMap.get(ev.attribute_key);
      const operator = ev.required_operator ?? reqAttr?.operator ?? '';
      const specValue = formatSpecified(
        operator,
        ev.required_value ?? reqAttr?.target_value ?? null,
        reqAttr?.target_unit ?? null,
      );

      const verdict = toSpineVerdict(ev.verdict as VerdictType);
      const comment = cleanComment(ev.evidence_note ?? null, ev.attribute_key, verdict);

      return {
        attribute_key:   ev.attribute_key,
        label:           attrLabel(ev.attribute_key),
        specified_value: specValue,
        proposed_value:  ev.product_value,
        verdict,
        comment,
        provenance:      ev.provenance ?? null,
        is_gate:         ev.is_gate,
        weight:          ev.weight ?? null,
      };
    });

    // ── 7. Gate results (summary of gate evidence) ───────────────────────

    const gateResults: GateResult[] = evidence
      .filter((ev) => ev.is_gate)
      .map((ev) => {
        const v = ev.verdict as VerdictType;
        const gv: GateResult['verdict'] =
          v === 'gate_pass' ? 'pass'
          : v === 'gate_fail' ? 'fail'
          : 'unverifiable';
        return {
          attribute_key: ev.attribute_key,
          label:         attrLabel(ev.attribute_key),
          verdict:       gv,
          product_value: ev.product_value,
          required_value: ev.required_value,
        };
      });

    // ── 8. Proposed product ──────────────────────────────────────────────

    const manufacturer =
      productAttrMap.get('manufacturer') ??
      product?.canonical_manufacturer ??
      null;

    const proposedProduct: ProposedProduct = {
      display_name:     product?.display_name ?? decision.canonical_product_id,
      manufacturer,
      model_code:       product?.canonical_model_code ?? null,
      country_of_origin: productAttrMap.get('country_of_origin') ?? null,
      fit_score:        decision.fit_score ?? null,
      rank:             decision.rank ?? null,
    };

    return {
      metadata,
      general_description: req.description ?? req.name,
      proposed_product:    proposedProduct,
      attributes,
      gate_results:        gateResults,
    };
  }
}
