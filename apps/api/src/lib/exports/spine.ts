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
import type { CanonicalProduct } from '../../db/schema/registry';
import type {
  ComplianceStatement, StatementMetadata, ProposedProduct,
  AttributeEntry, GateResult, SpineVerdict,
  ProductArchetype, LumenRepresentation,
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
    case 'gte':                return `≥ ${withUnit}`;
    case 'lte':                return `≤ ${withUnit}`;
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
  if (verdict === 'comply') return null;

  const prefix = `${attributeKey}: `;
  if (evidenceNote.startsWith(prefix)) {
    const rest = evidenceNote.slice(prefix.length);
    const dashIdx = rest.indexOf(' — ');
    if (dashIdx !== -1 && dashIdx < 40) {
      return rest.slice(dashIdx + 3);
    }
    return rest;
  }
  return evidenceNote;
}

// ─── Archetype detection ──────────────────────────────────────────────────────

/**
 * Detect construction archetype from product attributes and model code.
 *
 * Priority:
 *   1. Explicit 'archetype' product attribute ('preassembled' | 'component_build')
 *   2. WKL model code prefix → component_build (strip + profile + diffuser)
 *   3. Fallback → unknown (logged for human review)
 */
function detectArchetype(
  product: CanonicalProduct | undefined,
  productAttrMap: Map<string, string | null>,
): ProductArchetype {
  const explicit = productAttrMap.get('archetype');
  if (explicit === 'preassembled' || explicit === 'component_build') {
    return explicit;
  }

  const modelCode = (product?.canonical_model_code ?? '').toLowerCase();
  if (modelCode.startsWith('1wkl')) {
    return 'component_build';
  }

  return 'unknown';
}

// ─── Lumen representation builder ────────────────────────────────────────────

type EvidenceRow = typeof match_evidence.$inferSelect;

/**
 * Build a LumenRepresentation from archetype, product attributes, and evidence.
 *
 * component_build:
 *   source_lumens = published figure; delivered = source × diffuser_transmission.
 *   If transmission not in product attrs → delivered = null (PENDING).
 *
 * preassembled:
 *   delivered = published figure directly; source = null (internal, not separately published).
 *
 * unknown:
 *   Assume published = source (not confirmed); pending_reason flags unverified basis.
 */
function buildLumenRepresentation(
  archetype: ProductArchetype,
  productAttrMap: Map<string, string | null>,
  evidence: EvidenceRow[],
): LumenRepresentation | null {
  // Find lumen evidence (prefer lumens_per_metre for tapes)
  const lumenEv = evidence.find((e) =>
    e.attribute_key === 'lumens_per_metre' || e.attribute_key === 'lumens',
  );
  const wattEv = evidence.find((e) =>
    e.attribute_key === 'watts_per_metre' || e.attribute_key === 'watts',
  );

  const sourceLumensRaw =
    lumenEv?.product_value ??
    productAttrMap.get('lumens_per_metre') ??
    productAttrMap.get('lumens') ??
    null;

  if (!sourceLumensRaw) return null;

  const sourceLumens = parseFloat(sourceLumensRaw);
  if (isNaN(sourceLumens)) return null;

  const lumenAttrKey = lumenEv?.attribute_key ?? 'lumens_per_metre';
  const unit = lumenAttrKey.includes('_per_metre') ? 'lm/m' : 'lm';

  const wattsRaw =
    wattEv?.product_value ??
    productAttrMap.get('watts_per_metre') ??
    productAttrMap.get('watts') ??
    null;
  const watts = wattsRaw ? parseFloat(wattsRaw) : null;

  const transmissionRaw = productAttrMap.get('diffuser_transmission');
  const diffuserTransmission = transmissionRaw ? parseFloat(transmissionRaw) : null;
  const transmissionValid =
    diffuserTransmission !== null &&
    !isNaN(diffuserTransmission) &&
    diffuserTransmission > 0 &&
    diffuserTransmission <= 1;

  switch (archetype) {
    case 'component_build': {
      const deliveredLumens = transmissionValid
        ? Math.round(sourceLumens * diffuserTransmission!)
        : null;
      const pendingReason = deliveredLumens === null
        ? 'diffuser transmission not characterized'
        : null;
      const efficacy =
        deliveredLumens !== null && watts !== null && watts > 0
          ? Math.round((deliveredLumens / watts) * 10) / 10
          : null;
      return {
        source_lumens:        sourceLumens,
        delivered_lumens:     deliveredLumens,
        basis:                'source',
        diffuser_transmission: transmissionValid ? diffuserTransmission : null,
        unit,
        efficacy_lm_per_w:   efficacy,
        pending_reason:       pendingReason,
      };
    }

    case 'preassembled': {
      // Published figure IS the delivered output
      const efficacy =
        sourceLumens !== null && watts !== null && watts > 0
          ? Math.round((sourceLumens / watts) * 10) / 10
          : null;
      return {
        source_lumens:        null,
        delivered_lumens:     sourceLumens,
        basis:                'delivered',
        diffuser_transmission: null,
        unit,
        efficacy_lm_per_w:   efficacy,
        pending_reason:       null,
      };
    }

    default: {
      // unknown — expose source; flag that basis is unconfirmed
      return {
        source_lumens:        sourceLumens,
        delivered_lumens:     sourceLumens,
        basis:                'source',
        diffuser_transmission: null,
        unit,
        efficacy_lm_per_w:   null,
        pending_reason:       'archetype unknown — lumen basis unconfirmed',
      };
    }
  }
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
   * @param db             Drizzle DB instance (postgres-js)
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

    const productAttrMap = new Map<string, string | null>(
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
          attribute_key:  ev.attribute_key,
          label:          attrLabel(ev.attribute_key),
          verdict:        gv,
          product_value:  ev.product_value,
          required_value: ev.required_value,
        };
      });

    // ── 8. Proposed product with archetype + lumen representation ────────

    // Prefer a confirmed/extracted 'manufacturer' attribute; fall back to the
    // display_name prefix (e.g. "ILTI LUCE" from "ILTI LUCE — 1-WKL-6023-0-00")
    // rather than the lowercased canonical_manufacturer dedup key.
    const displayParts = (product?.display_name ?? '').split(' — ');
    const displayManufacturer = displayParts.length >= 2 ? displayParts[0].trim() : null;
    const displayModelCode    = displayParts.length >= 2 ? displayParts.slice(1).join(' — ').trim() : null;

    const manufacturer =
      productAttrMap.get('manufacturer') ??
      displayManufacturer ??
      product?.canonical_manufacturer ??
      null;

    const archetype = detectArchetype(product, productAttrMap);
    const lumenRepresentation = buildLumenRepresentation(archetype, productAttrMap, evidence);

    const rawAttributes: Record<string, string | null> = {};
    for (const [k, v] of productAttrMap.entries()) {
      rawAttributes[k] = v;
    }

    const proposedProduct: ProposedProduct = {
      display_name:      product?.display_name ?? decision.canonical_product_id,
      manufacturer,
      model_code:        displayModelCode ?? product?.canonical_model_code ?? null,
      country_of_origin: productAttrMap.get('country_of_origin') ?? null,
      fit_score:         decision.fit_score ?? null,
      rank:              decision.rank ?? null,
      archetype,
      lumen_representation: lumenRepresentation,
      raw_attributes:    rawAttributes,
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
