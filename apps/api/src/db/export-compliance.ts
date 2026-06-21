/**
 * Phase 5 exports — compliance statement CLI.
 *
 * Generates a consultant-formatted XLSX compliance statement from the
 * latest match decisions for a given requirement and writes it to disk.
 *
 * Usage:
 *   pnpm export:compliance                               (auto-detect requirement)
 *   pnpm export:compliance --requirement <uuid>
 *   pnpm export:compliance --requirement <uuid> --candidate <uuid>
 *   pnpm export:compliance --requirement <uuid> --consultant aecom
 *   pnpm export:compliance --org-id <uuid>
 *
 * Output:
 *   compliance-<req-short>-<YYYY-MM-DD>.xlsx in the current working directory.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { matching_requirements } from './schema/matching';
import { MatchDecisionExportSource } from '../lib/exports/spine';
import { renderStatement, listTemplates } from '../lib/exports/templates/registry';

// ── Defaults ───────────────────────────────────────────────────────────────────

const ORG_ID_DEFAULT = 'e15f7fa1-1ca5-4aba-8d07-f6cc88d00a3e';

// ── Arg parsing ────────────────────────────────────────────────────────────────

function parseArgs(): {
  requirementId: string | undefined;
  candidateId: string | undefined;
  consultant: string;
  orgId: string;
} {
  const args = process.argv.slice(2);
  let requirementId: string | undefined;
  let candidateId: string | undefined;
  let consultant = 'aecom';
  let orgId = ORG_ID_DEFAULT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--requirement' && args[i + 1]) requirementId = args[++i];
    if (args[i] === '--candidate'   && args[i + 1]) candidateId   = args[++i];
    if (args[i] === '--consultant'  && args[i + 1]) consultant    = args[++i];
    if (args[i] === '--org-id'      && args[i + 1]) orgId         = args[++i];
  }

  return { requirementId, candidateId, consultant, orgId };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { requirementId: reqIdArg, candidateId, consultant, orgId } = parseArgs();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db  = drizzle(sql);

  // ── Find requirement ────────────────────────────────────────────────────

  let requirementId = reqIdArg;
  let requirementName = '';

  if (!requirementId) {
    const reqs = await db
      .select({ id: matching_requirements.id, name: matching_requirements.name })
      .from(matching_requirements)
      .where(eq(matching_requirements.org_id, orgId));

    if (reqs.length === 0) {
      console.error(
        '[export-compliance] No requirements found for org. Run matching:seed first.',
      );
      process.exit(1);
    }

    requirementId    = reqs[0].id;
    requirementName  = reqs[0].name;
    console.log(`[export-compliance] Auto-selected requirement: "${requirementName}"`);
    console.log(`[export-compliance]   ID: ${requirementId}`);
  }

  // ── Validate consultant key ─────────────────────────────────────────────

  const available = listTemplates().map((t) => t.key);
  if (!available.includes(consultant.toLowerCase())) {
    console.error(
      `[export-compliance] Unknown consultant "${consultant}". Available: ${available.join(', ')}`,
    );
    process.exit(1);
  }

  // ── Build spine ─────────────────────────────────────────────────────────

  console.log(`\n[export-compliance] Building compliance statement…`);

  const dateLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const statement = await MatchDecisionExportSource.resolve(
    db,
    requirementId,
    candidateId,
    {
      project_name: 'LightSelect Demo Project',
      consultant:   consultant.toUpperCase(),
      date:         dateLabel,
      revision:     'Rev A',
      ref:          'LS-2026-001',
      item_code:    'FLEX-TAPE',
      item_type:    requirementName || 'Flexible LED Tape — Soft Cove',
    },
  );

  const { proposed_product: prod, attributes, metadata } = statement;

  console.log(`  Proposed:  ${prod.display_name}`);
  console.log(`  Fit score: ${prod.fit_score != null ? prod.fit_score.toFixed(1) + '%' : 'n/a'}`);
  console.log(`  Rank:      #${prod.rank ?? '?'}`);
  console.log(`  Attrs:     ${attributes.filter((a) => a.verdict !== null).length} adjudicated`);

  // ── Render ──────────────────────────────────────────────────────────────

  console.log(`\n[export-compliance] Rendering ${consultant.toUpperCase()} template…`);

  const buffer = await renderStatement(statement, consultant);

  // ── Write output ────────────────────────────────────────────────────────

  const reqShort = requirementId.slice(0, 8);
  const dateStr  = new Date().toISOString().slice(0, 10);
  const outName  = `compliance-${reqShort}-${dateStr}.xlsx`;
  const outPath  = path.resolve(process.cwd(), outName);

  fs.writeFileSync(outPath, buffer);

  console.log(`\n[export-compliance] ✓ Compliance statement written to:`);
  console.log(`  ${outPath}`);
  console.log(`\n  Sheet:     ${metadata.item_code}`);
  console.log(`  Project:   ${metadata.project_name}`);
  console.log(`  Date:      ${metadata.date}`);
  console.log(`  Consultant: ${metadata.consultant}`);

  await sql.end();
}

main().catch((err) => {
  console.error('[export-compliance] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
