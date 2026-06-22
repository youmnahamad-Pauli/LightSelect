/**
 * STEP 3 seed script — Phase 3 matching test (diffuser/configured-product pass).
 *
 * Changes vs tuning pass:
 *   1. Explicit archetype='component_build' attribute on all WKL strips.
 *   2. Configured product: 1-WKL-6023 + EXAMPLE Opal profile (transmission=0.80, estimated).
 *      Combo's canonical product carries delivered lm/m = 1480, is_configured_product='true'.
 *   3. Requirement carries item_code='FLEX-TAPE'.
 *   4. Bare strip → delivered_pending (lumen not assessable).
 *      Combo → deviation −26% (delivered 1480 vs required 2000 lm/m).
 *
 * Usage:
 *   pnpm --filter api tsx src/db/matching-seed.ts
 *   pnpm --filter api tsx src/db/matching-seed.ts --org-id <uuid>
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { like, eq, and } from 'drizzle-orm';
import { canonical_products, product_attribute_values } from './schema/registry';
import { matching_requirements, matching_requirement_attrs } from './schema/matching';
import { delivery_combos } from './schema/delivery-combos';
import { loadRequirement, loadCandidates, runEvaluation, persistResults } from '../lib/matching/engine';
import { MATCHING_CONFIG as C } from '../lib/matching/config';

// ── Config ────────────────────────────────────────────────────────────────────

const ORG_ID_DEFAULT = 'e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e';

function parseArgs() {
  const args = process.argv.slice(2);
  let orgId = ORG_ID_DEFAULT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org-id' && args[i + 1]) orgId = args[++i];
  }
  return { orgId };
}

async function upsertAttr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: ReturnType<typeof drizzle<any>>,
  productId: string,
  key: string,
  value: string,
  state: 'confirmed' | 'extracted' = 'confirmed',
): Promise<void> {
  await db
    .insert(product_attribute_values)
    .values({ canonical_product_id: productId, attribute_key: key, attribute_value: value, value_state: state })
    .onConflictDoUpdate({
      target: [product_attribute_values.canonical_product_id, product_attribute_values.attribute_key],
      set: { attribute_value: value, value_state: state, updated_at: new Date() },
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { orgId } = parseArgs();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db  = drizzle(sql);

  // ── 1. Classify ILTI WKL strips + set archetype ──────────────────────────
  console.log('\n[matching-seed] Step 1: classifying ILTI WKL strips…');

  const iltiStrips = await db
    .select({
      id: canonical_products.id,
      display_name: canonical_products.display_name,
      canonical_model_code: canonical_products.canonical_model_code,
    })
    .from(canonical_products)
    .where(like(canonical_products.canonical_model_code, '1wkl%'));

  console.log(`  Found ${iltiStrips.length} WKL strip products.`);

  for (const p of iltiStrips) {
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'flexible_tape', updated_at: new Date() })
      .where(eq(canonical_products.id, p.id));

    const allAttrs = await db
      .select({ k: product_attribute_values.attribute_key, v: product_attribute_values.attribute_value })
      .from(product_attribute_values)
      .where(eq(product_attribute_values.canonical_product_id, p.id));

    const familyName = (allAttrs.find((a) => a.k === 'family_name')?.v ?? '').toUpperCase();

    let colourFamily: string;
    if (familyName === 'N21') {
      colourFamily = 'rgb';
    } else if (familyName === 'N22') {
      colourFamily = 'rgbw';
    } else {
      colourFamily = 'white';
    }

    await upsertAttr(db, p.id, 'colour_family', colourFamily);
    await upsertAttr(db, p.id, 'dimmable', 'true');
    // Explicitly set archetype — no model-code prefix heuristics in exports
    await upsertAttr(db, p.id, 'archetype', 'component_build');

    console.log(`  ${p.canonical_model_code} (${familyName || 'unknown'}) → colour_family=${colourFamily}, archetype=component_build`);
  }

  // ── 2. Classify profile products ─────────────────────────────────────────
  const bpProducts = await db
    .select({ id: canonical_products.id })
    .from(canonical_products)
    .where(like(canonical_products.canonical_model_code, 'bp%'));

  for (const p of bpProducts) {
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'profile', updated_at: new Date() })
      .where(eq(canonical_products.id, p.id));
  }
  console.log(`  ${bpProducts.length} BP products classified as 'profile'.`);

  // ── 2b. Create configured product: 1-WKL-6023 + EXAMPLE Opal Profile ────
  console.log('\n[matching-seed] Step 2b: creating 1-WKL-6023 + EXAMPLE Opal configured product…');

  // Find the 1-WKL-6023 strip (search by model code pattern)
  const wkl6023Rows = await db
    .select({ id: canonical_products.id, display_name: canonical_products.display_name,
              canonical_model_code: canonical_products.canonical_model_code })
    .from(canonical_products)
    .where(like(canonical_products.canonical_model_code, '%wkl%6023%'));

  if (wkl6023Rows.length === 0) {
    console.warn('  ⚠ 1-WKL-6023 not found — skipping configured product creation.');
  } else {
    const strip = wkl6023Rows[0];
    console.log(`  Strip: ${strip.canonical_model_code} (${strip.id})`);

    // Get all strip attributes so we can copy them to the combo
    const stripAttrs = await db
      .select()
      .from(product_attribute_values)
      .where(eq(product_attribute_values.canonical_product_id, strip.id));

    // Check if a configured product for this strip already exists
    const existingCombo = await db
      .select({ id: delivery_combos.id, canonical_product_id: delivery_combos.canonical_product_id })
      .from(delivery_combos)
      .where(eq(delivery_combos.strip_canonical_product_id, strip.id))
      .limit(1);

    let comboCanonicalId: string;

    if (existingCombo.length > 0 && existingCombo[0].canonical_product_id) {
      comboCanonicalId = existingCombo[0].canonical_product_id;
      console.log(`  Using existing configured product (canonical_id=${comboCanonicalId})`);
    } else {
      // Create new canonical_products row for the combo.
      // Check by dedup_key first so re-runs are idempotent.
      const COMBO_DEDUP_KEY = 'ilti luce::combo-1wkl6023-example-opal';
      const [existingComboCanonical] = await db
        .select({ id: canonical_products.id })
        .from(canonical_products)
        .where(and(eq(canonical_products.org_id, orgId), eq(canonical_products.dedup_key, COMBO_DEDUP_KEY)))
        .limit(1);

      let comboCanonical: { id: string };
      if (existingComboCanonical) {
        comboCanonical = existingComboCanonical;
        console.log(`  Existing combo canonical product found: ${comboCanonical.id}`);
      } else {
        const [inserted] = await db
          .insert(canonical_products)
          .values({
            org_id:                 orgId,
            display_name:           'EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00',
            canonical_manufacturer: 'ilti luce',
            canonical_model_code:   'combo-1wkl6023-example-opal',
            dedup_key:              COMBO_DEDUP_KEY,
            luminaire_type:         'flexible_tape',
          })
          .returning({ id: canonical_products.id });
        comboCanonical = inserted;
      }

      comboCanonicalId = comboCanonical.id;

      // Copy strip attributes to combo, then override/add combo-specific ones
      for (const attr of stripAttrs) {
        if (!attr.attribute_value) continue;
        await upsertAttr(db, comboCanonicalId, attr.attribute_key, attr.attribute_value,
          attr.value_state === 'confirmed' ? 'confirmed' : 'extracted');
      }
    }

    // Override/add combo-specific attributes
    const DIFFUSER_TRANSMISSION = 0.80;
    const sourceAttr = stripAttrs.find((a) => a.attribute_key === 'lumens_per_metre');
    const sourceLm   = sourceAttr?.attribute_value ? parseFloat(sourceAttr.attribute_value) : null;
    const deliveredLm = sourceLm !== null ? Math.round(sourceLm * DIFFUSER_TRANSMISSION) : null;

    // delivered lm/m (computed = 1850 × 0.80 = 1480)
    if (deliveredLm !== null) {
      await upsertAttr(db, comboCanonicalId, 'lumens_per_metre', String(deliveredLm), 'extracted');
      console.log(`  Delivered lm/m = ${sourceLm} × ${DIFFUSER_TRANSMISSION} = ${deliveredLm} lm/m`);
    }

    await upsertAttr(db, comboCanonicalId, 'archetype', 'component_build');
    await upsertAttr(db, comboCanonicalId, 'is_configured_product', 'true');
    await upsertAttr(db, comboCanonicalId, 'diffuser_transmission', String(DIFFUSER_TRANSMISSION));
    await upsertAttr(db, comboCanonicalId, 'transmission_provenance', 'estimated');

    // Create or update the delivery_combos row
    if (existingCombo.length === 0) {
      await db.insert(delivery_combos).values({
        org_id:                        orgId,
        canonical_product_id:          comboCanonicalId,
        strip_canonical_product_id:    strip.id,
        display_name:                  'EXAMPLE Opal Profile + ILTI LUCE — 1-WKL-6023-0-00',
        luminaire_type:                'flexible_tape',
        profile_name:                  'EXAMPLE Opal Profile',
        profile_manufacturer:          'EXAMPLE',
        profile_model_code:            'OPAL-EXAMPLE',
        diffuser_type:                 'opal',
        diffuser_transmission:         DIFFUSER_TRANSMISSION,
        transmission_provenance:       'estimated',
        notes:                         'PLACEHOLDER — diffuser transmission estimated at 80%. Verify from manufacturer characterisation before issue.',
      });
      console.log('  Created delivery_combos row (PLACEHOLDER — estimated transmission).');
    } else {
      console.log('  Configured product row already exists — updated attributes.');
    }
  }

  // ── 3. Classify Signify BRP 331 as downlight ──────────────────────────────
  console.log('\n[matching-seed] Step 3: classifying Signify BRP 331 as downlight…');
  const [brp331] = await db
    .select({ id: canonical_products.id })
    .from(canonical_products)
    .where(eq(canonical_products.canonical_model_code, 'brp 331'))
    .limit(1);

  if (brp331) {
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'downlight', updated_at: new Date() })
      .where(eq(canonical_products.id, brp331.id));
    console.log('  Signify BRP 331 → luminaire_type=downlight');
  } else {
    console.log('  Signify BRP 331 not found (may have been removed).');
  }

  // ── 4. Recreate the requirement ───────────────────────────────────────────
  console.log('\n[matching-seed] Step 4: recreating flexible-tape requirement (diffuser pass)…');

  const existingReqs = await db
    .select({ id: matching_requirements.id })
    .from(matching_requirements)
    .where(eq(matching_requirements.org_id, orgId));

  for (const r of existingReqs) {
    await db.delete(matching_requirements).where(eq(matching_requirements.id, r.id));
  }
  console.log(`  Deleted ${existingReqs.length} existing requirement(s).`);

  const [newReq] = await db
    .insert(matching_requirements)
    .values({
      org_id:         orgId,
      name:           'LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC [tuned]',
      luminaire_type: 'flexible_tape',
      description:
        'Surface-mounted flexible LED tape for soft cove/perimeter lighting. ' +
        'Indoor (IP≥20). White output only (colour channels disqualified). ' +
        '3000K ±100K absolute. CRI≥90. ~2000 lm/m delivered.',
      item_code:        'FLEX-TAPE',
      flag_wind_load:   false,
      flag_dark_sky:    false,
      flag_bend_radius: false,
    })
    .returning({ id: matching_requirements.id });

  const requirementId = newReq.id;

  await db.insert(matching_requirement_attrs).values([
    // ── Hard gates ────────────────────────────────────────────────────────────
    {
      requirement_id: requirementId,
      attribute_key:  'ip_rating',
      operator:       'gte',
      target_value:   'IP20',
      gate_type:      'hard',
      notes:          'Indoor minimum — must withstand light moisture/dust ingress.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'voltage',
      operator:       'eq',
      target_value:   '24V DC',
      gate_type:      'hard',
      notes:          'DC systems are exact-match; 12V and 48V are not interchangeable.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'colour_family',
      operator:       'colour_family_gate',
      target_value:   'white',
      gate_type:      'hard',
      notes:          'White output required. RGB/RGBW/RGBIC products disqualified.',
    },
    // ── Scored attributes ─────────────────────────────────────────────────────
    {
      requirement_id: requirementId,
      attribute_key:  'cct',
      operator:       'match_target_cct',
      target_value:   '3000',
      target_unit:    'K',
      weight:         C.WEIGHT_HIGH,
      notes:          '3000K warm-white required. Closest CCT ±100K → comment; exact → comply.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'cri',
      operator:       'gte',
      target_value:   '90',
      weight:         C.WEIGHT_HIGH,
      notes:          'CRI≥90 required.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'lumens_per_metre',
      operator:       'match_target_lumen',
      target_value:   '2000',
      target_unit:    'lm/m',
      weight:         C.WEIGHT_HIGH,
      notes:          'Delivered basis. Bare strip → delivered_pending. Combo → deviation at 1480 lm/m (−26%).',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'watts_per_metre',
      operator:       'lte',
      target_value:   '20',
      target_unit:    'W/m',
      weight:         C.WEIGHT_MED,
      notes:          'Power budget constraint — must not exceed 20 W/m.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'led_per_metre',
      operator:       'gte',
      target_value:   '120',
      weight:         C.WEIGHT_MED,
      notes:          '≥120 LED/m for dot-free appearance.',
    },
  ]);

  console.log(`  Requirement created: ${requirementId} (item_code=FLEX-TAPE)`);

  // ── 5. Load + run evaluation ──────────────────────────────────────────────
  console.log('\n[matching-seed] Step 5: loading candidates and running evaluation…');
  const req = await loadRequirement(db, requirementId);
  if (!req) throw new Error('Requirement not found after insert');

  const candidates = await loadCandidates(db, orgId);
  console.log(`  Loaded ${candidates.length} candidates.`);

  const evaluations = runEvaluation(req, candidates);

  // ── 6. Print results ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  MATCH RESULTS (DIFFUSER PASS) — ${req.name}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  const excluded     = evaluations.filter((e) => e.excluded);
  const disqualified = evaluations.filter((e) => !e.excluded && !e.passed_all_hard_gates);
  const scored       = evaluations.filter((e) => !e.excluded && e.passed_all_hard_gates);
  scored.sort((a, b) => ((a as any).rank ?? 999) - ((b as any).rank ?? 999));

  console.log(`\n  PASSED GATES & SCORED (${scored.length}):`);
  if (scored.length === 0) {
    console.log('    (none)');
  } else {
    console.log('  Rank  Product                                Fit%   Conf  Band  Dev(H/M/L)  Comments');
    console.log('  ──────────────────────────────────────────────────────────────────────────────────────');
    for (const e of scored) {
      const rank = (e as any).rank ?? '–';
      const name = e.candidate.display_name.padEnd(38).slice(0, 38);
      const fit  = e.fit_score !== null ? `${e.fit_score.toFixed(1)}%` : '  N/A';
      const conf = e.confidence_score !== null ? e.confidence_score.toFixed(2) : ' N/A';
      const band = (e.confidence_band ?? 'N/A').padEnd(4);
      const cap  = e.deviations_high_weight > 0 ? '⚠ ' : '  ';
      const dev  = `${e.deviations_high_weight}/${e.deviations_medium_weight}/${e.deviations_low_weight}`;

      // Check for delivered_pending lumen verdict
      const lumenEvidence = e.evidence.find(
        (ev) => ev.attribute_key === 'lumens_per_metre' || ev.attribute_key === 'lumens',
      );
      const lumenTag = lumenEvidence?.verdict === 'delivered_pending' ? ' [DELIVERED PENDING]' : '';

      console.log(`  ${String(rank).padStart(2)}    ${name}  ${cap}${fit.padStart(6)}  ${conf}  ${band}  ${dev.padEnd(9)}   ${e.comments_count}${lumenTag}`);
    }
  }

  // ── Side-by-side: bare strip vs configured combo ─────────────────────────
  const wkl6023Eval  = scored.find((e) => e.candidate.display_name.includes('1-WKL-6023') &&
    !e.candidate.is_configured_product);
  const comboEval    = scored.find((e) => e.candidate.is_configured_product &&
    e.candidate.display_name.includes('6023'));

  if (wkl6023Eval || comboEval) {
    console.log('\n  ── SIDE-BY-SIDE: bare strip vs configured combo ─────────────────────');
    console.log('  Product                                   Lumen Verdict      Evidence');
    console.log('  ─────────────────────────────────────────────────────────────────────');

    const printRow = (label: string, e: typeof scored[0] | undefined) => {
      if (!e) { console.log(`  ${label.padEnd(40)}  (not in scored pool)`); return; }
      const lumenEv = e.evidence.find((ev) =>
        ev.attribute_key === 'lumens_per_metre' || ev.attribute_key === 'lumens',
      );
      const verdict = lumenEv?.verdict ?? 'n/a';
      const note    = lumenEv?.evidence_note ?? '';
      console.log(`  ${label.padEnd(40)}  ${verdict.toUpperCase().padEnd(20)} ${note.slice(0, 60)}`);
    };

    printRow('1-WKL-6023 (bare strip)', wkl6023Eval);
    printRow('+ EXAMPLE Opal (combo, delivered=1480)', comboEval);
    console.log('  ─────────────────────────────────────────────────────────────────────');
  }

  console.log(`\n  DISQUALIFIED — HARD GATE FAILED (${disqualified.length}):`);
  for (const e of disqualified) {
    const failures = e.gate_failures.map(
      (f) => `${f.attr}: ${f.product_value ?? '(missing)'} ≠ ${f.required}`,
    ).join('; ');
    console.log(`    ✗ ${e.candidate.display_name}: ${failures}`);
  }

  console.log(`\n  EXCLUDED — TYPE MISMATCH (${excluded.length}):`);
  for (const e of excluded) {
    console.log(`    ○ ${e.candidate.display_name}: ${e.exclude_reason}`);
  }
  console.log('');

  // ── 7. Evidence detail for top-3 ─────────────────────────────────────────
  const top3 = scored.slice(0, 3);
  if (top3.length > 0) {
    console.log('\n  EVIDENCE DETAIL — TOP 3\n');
    for (const e of top3) {
      const fitStr  = e.fit_score?.toFixed(1);
      const confStr = e.confidence_score?.toFixed(2);
      const configTag = e.candidate.is_configured_product ? ' [CONFIGURED PRODUCT]' : '';
      console.log(`  ┌─ ${e.candidate.display_name}${configTag} (fit=${fitStr}%, conf=${confStr} ${e.confidence_band})`);
      for (const v of e.evidence) {
        const tag     = v.is_gate ? `[${v.gate_type?.toUpperCase() ?? 'GATE'}]` : `[scored w=${v.weight}]`;
        const verdict = v.verdict.toUpperCase().padEnd(18);
        console.log(`  │  ${tag.padEnd(14)} ${v.attribute_key.padEnd(22)} ${verdict}  ${v.evidence_note}`);
      }
      console.log('  └──');
    }
  }

  // ── 8. Persist ────────────────────────────────────────────────────────────
  console.log('\n[matching-seed] Step 8: persisting decisions to DB…');
  await persistResults(db, evaluations as any);
  console.log(`  Persisted ${evaluations.length} match decisions.`);

  await sql.end();
  console.log('\n[matching-seed] Done.\n');
}

main().catch((err) => {
  console.error('[matching-seed] Fatal:', err);
  process.exit(1);
});
