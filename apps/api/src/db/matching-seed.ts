/**
 * STEP 3 seed script — Phase 3 matching test (tuning pass).
 *
 * Changes vs Phase 3 original:
 *   1. colour_family attribute set on all ILTI strips; new colour_family_gate hard gate added.
 *   2. CCT switched from contains_value → match_target_cct (±100K absolute tolerance).
 *   3. Signify BRP 331 classified as 'downlight' so type-scoping excludes it.
 *   4. Requirement is always deleted and recreated to pick up gate changes.
 *
 * Usage:
 *   pnpm --filter api tsx src/db/matching-seed.ts
 *   pnpm --filter api tsx src/db/matching-seed.ts --org-id <uuid>
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { like, eq } from 'drizzle-orm';
import { canonical_products, product_attribute_values } from './schema/registry';
import { matching_requirements, matching_requirement_attrs } from './schema/matching';
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { orgId } = parseArgs();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db  = drizzle(sql);

  // ── 1. Classify ILTI WKL strips ──────────────────────────────────────────
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
    // Set luminaire_type = flexible_tape (unchanged from Phase 3)
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'flexible_tape', updated_at: new Date() })
      .where(eq(canonical_products.id, p.id));

    // Get all attributes for this product to find family_name
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
      // N10, N17, N19, N24, N24HF, N25 → all white
      colourFamily = 'white';
    }

    // Upsert colour_family in product_attribute_values
    await db
      .insert(product_attribute_values)
      .values({
        canonical_product_id: p.id,
        attribute_key:        'colour_family',
        attribute_value:      colourFamily,
        value_state:          'confirmed',
      })
      .onConflictDoUpdate({
        target: [
          product_attribute_values.canonical_product_id,
          product_attribute_values.attribute_key,
        ],
        set: {
          attribute_value: colourFamily,
          value_state:     'confirmed',
          updated_at:      new Date(),
        },
      });

    console.log(`  ${p.canonical_model_code} (${familyName || 'unknown'}) → colour_family=${colourFamily}`);
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

  // ── 3. Classify Signify BRP 331 as downlight (Change 4 — data hygiene) ───
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

  // ── 4. Recreate the requirement with tuned gates ──────────────────────────
  console.log('\n[matching-seed] Step 4: recreating flexible-tape requirement (tuning pass)…');

  // Delete any existing requirement for this org (cascade deletes attrs + decisions + evidence)
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
        '3000K ±100K absolute. CRI≥90. ~2000 lm/m.',
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
      notes:          'White output required. RGB/RGBW/RGBIC products disqualified — "can produce white" argument rejected per spec.',
    },
    // ── Scored attributes ─────────────────────────────────────────────────────
    {
      requirement_id: requirementId,
      attribute_key:  'cct',
      operator:       'match_target_cct',
      target_value:   '3000',
      target_unit:    'K',
      weight:         C.WEIGHT_HIGH,
      notes:          '3000K warm-white required. Closest CCT in product list; ±100K absolute → comment; exact match → comply.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'cri',
      operator:       'gte',
      target_value:   '90',
      weight:         C.WEIGHT_HIGH,
      notes:          'CRI≥90 required for accurate colour rendering.',
    },
    {
      requirement_id: requirementId,
      attribute_key:  'lumens_per_metre',
      operator:       'match_target',
      target_value:   '2000',
      target_unit:    'lm/m',
      tolerance_tight_pct: 2,
      tolerance_outer_pct: 10,
      weight:         C.WEIGHT_HIGH,
      notes:          '±2% → comply; ±10% → comment; beyond → deviation. Unconfirmed basis also flagged as comment.',
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
      notes:          '≥120 LED/m for dot-free appearance from normal viewing distances.',
    },
  ]);

  console.log(`  Requirement created: ${requirementId}`);

  // ── 5. Load + run evaluation ──────────────────────────────────────────────
  console.log('\n[matching-seed] Step 5: loading candidates and running evaluation…');
  const req = await loadRequirement(db, requirementId);
  if (!req) throw new Error('Requirement not found after insert');

  const candidates = await loadCandidates(db, orgId);
  console.log(`  Loaded ${candidates.length} candidates.`);

  const evaluations = runEvaluation(req, candidates);

  // ── 6. Print results ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  MATCH RESULTS (TUNING PASS) — ${req.name}`);
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
      console.log(`  ${String(rank).padStart(2)}    ${name}  ${cap}${fit.padStart(6)}  ${conf}  ${band}  ${dev.padEnd(9)}   ${e.comments_count}`);
    }
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
      console.log(`  ┌─ ${e.candidate.display_name} (fit=${fitStr}%, conf=${confStr} ${e.confidence_band})`);
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
