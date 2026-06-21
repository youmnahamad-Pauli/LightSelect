/**
 * STEP 3 seed script — Phase 3 matching test.
 *
 * 1. Sets luminaire_type = 'flexible_tape' on all ingested ILTI strip products
 *    (WKL model codes) so the type-scoping gate fires correctly.
 * 2. Creates a sample flexible-tape requirement:
 *       "LED Strip — Soft Cove 3000K, CRI≥90, ~2000 lm/m, 24V DC, IP≥20"
 * 3. Runs the matching engine against all org products.
 * 4. Prints a ranked results table.
 * 5. Persists decisions + evidence to the DB.
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

  // ── 1. Classify ILTI strip products ──────────────────────────────────────
  console.log('\n[matching-seed] Classifying ILTI WKL strips as flexible_tape…');

  const iltiStrips = await db
    .select({ id: canonical_products.id, display_name: canonical_products.display_name })
    .from(canonical_products)
    .where(like(canonical_products.canonical_model_code, '1wkl%'));

  console.log(`  Found ${iltiStrips.length} WKL strip products.`);
  for (const p of iltiStrips) {
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'flexible_tape', updated_at: new Date() })
      .where(eq(canonical_products.id, p.id));
  }

  // Also mark BP profiles and accessories as 'profile'
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

  // Also mark catalogue_accessories-linked products that are accessories
  const accessoryLikeProducts = await db
    .select({ id: canonical_products.id })
    .from(canonical_products)
    .where(like(canonical_products.canonical_model_code, 'bpconn%'));

  for (const p of accessoryLikeProducts) {
    await db
      .update(canonical_products)
      .set({ luminaire_type: 'profile', updated_at: new Date() })
      .where(eq(canonical_products.id, p.id));
  }

  console.log(`  Done. ${bpProducts.length} BP products classified as 'profile'.`);

  // ── 2. Create (or reuse) the sample requirement ───────────────────────────
  console.log('\n[matching-seed] Creating flexible-tape requirement…');

  const [existingReq] = await db
    .select({ id: matching_requirements.id })
    .from(matching_requirements)
    .where(eq(matching_requirements.org_id, orgId))
    .limit(1);

  let requirementId: string;

  if (existingReq) {
    requirementId = existingReq.id;
    console.log(`  Reusing existing requirement: ${requirementId}`);
  } else {
    const [newReq] = await db
      .insert(matching_requirements)
      .values({
        org_id:        orgId,
        name:          'LED Strip — Soft Cove, 3000K, CRI≥90, ~2000 lm/m, 24V DC',
        luminaire_type: 'flexible_tape',
        description:   'Surface-mounted flexible LED tape for soft cove/perimeter lighting. ' +
                       'Indoor (IP≥20). Requires uniform 3000K output and high CRI for retail/hospitality.',
        flag_wind_load:   false,
        flag_dark_sky:    false,
        flag_bend_radius: false,
      })
      .returning({ id: matching_requirements.id });

    requirementId = newReq.id;

    // Insert requirement attributes (gates first, then scored)
    await db.insert(matching_requirement_attrs).values([
      // ── Hard gates ──────────────────────────────────────────────────────────
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
      // ── Scored attributes ───────────────────────────────────────────────────
      {
        requirement_id: requirementId,
        attribute_key:  'cct',
        operator:       'contains_value',
        target_value:   '3000',
        weight:         C.WEIGHT_HIGH,
        notes:          'Warm-white 3000K required for hospitality ambience. K suffix stripped in comparison.',
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
        notes:          '±2% → comply; ±10% → comment; beyond → deviation.',
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
  }

  // ── 3. Load requirement + candidates ─────────────────────────────────────
  console.log('\n[matching-seed] Loading requirement and candidates…');
  const req = await loadRequirement(db, requirementId);
  if (!req) throw new Error('Requirement not found after insert');

  const candidates = await loadCandidates(db, orgId);
  console.log(`  Loaded ${candidates.length} candidates.`);

  // ── 4. Run evaluation ────────────────────────────────────────────────────
  console.log('\n[matching-seed] Running evaluation…');
  const evaluations = runEvaluation(req, candidates);

  // ── 5. Print results ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  MATCH RESULTS — ${req.name}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  const excluded    = evaluations.filter((e) => e.excluded);
  const disqualified = evaluations.filter((e) => !e.excluded && !e.passed_all_hard_gates);
  const scored      = evaluations.filter((e) => !e.excluded && e.passed_all_hard_gates);
  // Sort rank asc (rank 1 = best match first), unranked at end
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
    const failures = e.gate_failures.map((f) => `${f.attr}: ${f.product_value ?? '(missing)'} ≠ ${f.required}`).join('; ');
    console.log(`    ✗ ${e.candidate.display_name}: ${failures}`);
  }

  console.log(`\n  EXCLUDED — TYPE MISMATCH (${excluded.length}):`);
  for (const e of excluded) {
    console.log(`    ○ ${e.candidate.display_name}: ${e.exclude_reason}`);
  }
  console.log('');

  // ── 6. Evidence detail for top-3 ─────────────────────────────────────────
  const top3 = scored.slice(0, 3);
  if (top3.length > 0) {
    console.log('\n  EVIDENCE DETAIL — TOP 3\n');
    for (const e of top3) {
      console.log(`  ┌─ ${e.candidate.display_name} (fit=${e.fit_score?.toFixed(1)}%, conf=${e.confidence_score?.toFixed(2)} ${e.confidence_band})`);
      for (const v of e.evidence) {
        const tag = v.is_gate ? `[${v.gate_type?.toUpperCase() ?? 'GATE'}]` : `[scored w=${v.weight}]`;
        const verdict = v.verdict.toUpperCase().padEnd(18);
        console.log(`  │  ${tag.padEnd(14)} ${v.attribute_key.padEnd(22)} ${verdict}  ${v.evidence_note}`);
      }
      console.log('  └──');
    }
  }

  // ── 7. Persist ───────────────────────────────────────────────────────────
  console.log('\n[matching-seed] Persisting decisions to DB…');
  await persistResults(db, evaluations as any);
  console.log(`  Persisted ${evaluations.length} match decisions.`);

  await sql.end();
  console.log('\n[matching-seed] Done.\n');
}

main().catch((err) => {
  console.error('[matching-seed] Fatal:', err);
  process.exit(1);
});
