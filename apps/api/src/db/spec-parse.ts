/**
 * CLI script: parse a consultant lighting schedule into matching_requirements.
 *
 * Usage:
 *   pnpm --filter api spec:parse \
 *     --spec spec-input/LightSelect-Test-Schedule.md \
 *     --org-id <uuid> \
 *     [--filter LCL-015,LCL-001]   # restrict to items whose item_code contains these strings
 *     [--model claude-sonnet-4-6]
 *     [--run-matching]              # after writing, run matching for each parsed requirement
 *
 * Writes matching_requirements + matching_requirement_attrs to the DB.
 * Generates SPEC-PARSER-REVIEW.md (inspection output) at the repo root.
 *
 * PRE-REQUISITES:
 *   - DATABASE_URL and ANTHROPIC_API_KEY in apps/api/.env
 *   - Migration 0005_spec_parser applied (run: pnpm --filter api db:migrate)
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { runSpecParser } from '../lib/spec-parser/pipeline';
import { loadRequirement, loadCandidates, runEvaluation, persistResults } from '../lib/matching/engine';
import { matching_requirements } from './schema/matching';
import type { SpecParseResult } from '../lib/spec-parser/types';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

// Resolve spec path: try direct, then relative to monorepo root (apps/api/src/db/ → ../../../../)
function resolveSpecPath(spec: string): string {
  const direct = path.resolve(spec);
  if (fs.existsSync(direct)) return direct;
  const monoRoot = path.resolve(__dirname, '../../../../');
  const fromRoot = path.resolve(monoRoot, spec);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return direct; // not found — will surface a clear error downstream
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const spec = get('--spec');
  const orgId = get('--org-id');

  if (!spec) {
    console.error('Usage: pnpm --filter api spec:parse --spec <path> --org-id <uuid> [--filter codes] [--model name] [--run-matching]');
    process.exit(1);
  }
  if (!orgId) {
    console.error('--org-id is required. Find your org UUID from the organizations table.');
    process.exit(1);
  }

  const filterRaw = get('--filter') ?? '';
  const filter = filterRaw ? filterRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const model = get('--model');
  const runMatching = args.includes('--run-matching');

  return { spec: resolveSpecPath(spec), orgId, filter, model, runMatching };
}

// ─── Review markdown ──────────────────────────────────────────────────────────

function generateReviewMarkdown(result: SpecParseResult, matchingResults: MatchResult[]): string {
  const lines: string[] = [];
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  lines.push(`# Spec Parser Review — ${path.basename(result.source_file)}`);
  lines.push('');
  lines.push(`**Parsed at:** ${ts}`);
  lines.push(`**Source file:** \`${result.source_file}\``);
  lines.push(`**Org ID:** \`${result.org_id}\``);
  lines.push(`**Items detected:** ${result.items_detected}`);
  lines.push(`**Items written:** ${result.items_written}`);
  lines.push(`**LLM:** ${result.llm_meta.model} · in=${result.llm_meta.input_tokens} out=${result.llm_meta.output_tokens} (${result.llm_meta.elapsed_ms}ms)`);
  lines.push('');
  lines.push('> All extracted values have provenance = **extracted** and require human review.');
  lines.push('> Luminaire type classifications with confidence < 0.8 are flagged for review.');
  lines.push('> Unknown attribute keys and low-confidence values are listed per item.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const item of result.items) {
    const badge = item.needs_review ? '⚠️  needs_review' : '✓ ok';
    lines.push(`## ${item.item_code} — ${badge}`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Requirement ID | \`${item.requirement_id}\` |`);
    lines.push(`| Luminaire type | \`${item.luminaire_type ?? '**UNCLASSIFIED**'}\` (conf=${item.luminaire_type_confidence.toFixed(2)}) |`);
    lines.push(`| Matchable attrs | ${item.matchable_attrs_written} |`);
    lines.push(`| Informational attrs | ${item.informational_attrs_count} |`);

    if (item.unknown_keys.length > 0) {
      lines.push(`| Unknown keys | ⚠️ ${item.unknown_keys.join(', ')} |`);
    }
    if (item.low_confidence_flags.length > 0) {
      lines.push(`| Low confidence | ⚠️ ${item.low_confidence_flags.join(', ')} |`);
    }
    lines.push('');

    // Matching results for this item
    const mr = matchingResults.find((r) => r.requirement_id === item.requirement_id);
    if (mr) {
      lines.push(`### Matching Results (${mr.assessed} assessed, ${mr.pending} pending, ${mr.disqualified} disqualified, ${mr.excluded} excluded)`);
      lines.push('');
      if (mr.top_ranked.length > 0) {
        lines.push('| Rank | Product | Fit% | Conf | Band | Dev(H/M/L) |');
        lines.push('|------|---------|------|------|------|-----------|');
        for (const e of mr.top_ranked) {
          const fit = e.fit_score !== null ? `${e.fit_score.toFixed(1)}%` : 'N/A';
          const conf = e.confidence_score !== null ? e.confidence_score.toFixed(2) : 'N/A';
          const dev = `${e.deviations_high_weight}/${e.deviations_medium_weight}/${e.deviations_low_weight}`;
          const combo = e.candidate.is_configured_product ? ' [COMBO]' : '';
          lines.push(`| ${(e as { rank?: number }).rank ?? '–'} | ${e.candidate.display_name}${combo} | ${fit} | ${conf} | ${e.confidence_band ?? 'N/A'} | ${dev} |`);
        }
      } else {
        lines.push('_No assessed candidates ranked._');
      }

      if (mr.pending_items.length > 0) {
        lines.push('');
        lines.push(`**Pending characterisation (${mr.pending_items.length}):** ${mr.pending_items.join(', ')}`);
      }
      if (mr.no_candidates) {
        lines.push('');
        lines.push('> ⚠️  No candidates of this luminaire_type in the product pool. Run catalogue ingestion first.');
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  const needsReviewCount = result.items.filter((i) => i.needs_review).length;
  lines.push(`- **${result.items_written}** requirement(s) written`);
  lines.push(`- **${needsReviewCount}** need human review (type unclassified, unknown keys, or low confidence)`);
  lines.push('');
  lines.push('### Needs human decision');
  lines.push('');
  lines.push('1. **Luminaire type classification**: Items with confidence < 0.8 must have their luminaire_type confirmed before matching is meaningful — the type scoping filter excludes wrong-type candidates entirely.');
  lines.push('2. **Unknown attribute keys**: Keys returned by the LLM that are not in ATTR_CONFIG are discarded. Review whether they should be added to the locked config or treated as informational.');
  lines.push('3. **Lumen basis**: All lumen targets are written with `notes: "lumen basis: delivered"`. Confirm the spec intends delivered output before running matching.');
  lines.push('4. **Dimming as gate**: The current config does NOT add dimming as a gate requirement (it was captured as informational `control_type`). If dimming protocol is a hard gate for this project, add it manually to the requirement attrs.');
  lines.push('');

  return lines.join('\n');
}

// ─── Matching runner ──────────────────────────────────────────────────────────

interface MatchResult {
  requirement_id: string;
  item_code: string;
  assessed: number;
  pending: number;
  disqualified: number;
  excluded: number;
  no_candidates: boolean;
  top_ranked: ReturnType<typeof runEvaluation>[number][];
  pending_items: string[];
}

async function runMatchingForRequirements(
  orgId: string,
  requirementIds: string[],
): Promise<MatchResult[]> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  const results: MatchResult[] = [];

  for (const reqId of requirementIds) {
    const req = await loadRequirement(db, reqId);
    if (!req) continue;

    const candidates = await loadCandidates(db, orgId);
    const evaluations = runEvaluation(req, candidates);
    await persistResults(db, evaluations as Parameters<typeof persistResults>[1]);

    const [reqRow] = await db
      .select({ item_code: matching_requirements.item_code })
      .from(matching_requirements)
      .where(eq(matching_requirements.id, reqId))
      .limit(1);

    const pendingChar = evaluations.filter((e) => e.pending_characterisation);
    const assessed = evaluations.filter(
      (e) => !e.excluded && !e.pending_characterisation && e.passed_all_hard_gates,
    );
    const pending = pendingChar;
    const disqualified = evaluations.filter((e) => !e.excluded && !e.passed_all_hard_gates);
    const excluded = evaluations.filter((e) => e.excluded);

    const ranked = [...assessed]
      .sort((a, b) => ((a as { rank?: number }).rank ?? 999) - ((b as { rank?: number }).rank ?? 999))
      .slice(0, 5);

    results.push({
      requirement_id: reqId,
      item_code: reqRow?.item_code ?? reqId,
      assessed: assessed.length,
      pending: pending.length,
      disqualified: disqualified.length,
      excluded: excluded.length,
      no_candidates: candidates.filter((c) =>
        req.luminaire_type && c.luminaire_type === req.luminaire_type,
      ).length === 0,
      top_ranked: ranked,
      pending_items: pending.map((e) => e.candidate.display_name),
    });

    console.log(
      `[spec-parser:match] ${reqRow?.item_code ?? reqId}: ` +
      `${assessed.length} assessed, ${pending.length} pending, ` +
      `${disqualified.length} disqualified, ${excluded.length} excluded`,
    );
  }

  await sql.end();
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { spec, orgId, filter, model, runMatching } = parseArgs(process.argv);

  console.log('[spec-parser] Starting spec parser pipeline');
  console.log(`[spec-parser] Spec: ${spec}`);
  console.log(`[spec-parser] Org: ${orgId}`);
  if (filter.length) console.log(`[spec-parser] Filter: ${filter.join(', ')}`);

  const result = await runSpecParser({
    filePath: spec,
    orgId,
    model,
    itemFilter: filter.length ? filter : undefined,
  });

  console.log('\n[spec-parser] Parse result:');
  console.log(JSON.stringify(result, null, 2));

  // Run matching if requested
  let matchingResults: MatchResult[] = [];
  if (runMatching && result.items.length > 0) {
    console.log('\n[spec-parser] Running matching for parsed requirements…');
    const reqIds = result.items.map((i) => i.requirement_id);
    matchingResults = await runMatchingForRequirements(orgId, reqIds);
  }

  // Write review markdown
  const reviewDir = fs.existsSync(path.join(process.cwd(), 'spec-input'))
    ? process.cwd()
    : path.dirname(spec);
  const reviewPath = path.join(reviewDir, 'SPEC-PARSER-REVIEW.md');
  const markdown = generateReviewMarkdown(result, matchingResults);
  fs.writeFileSync(reviewPath, markdown, 'utf8');
  console.log(`\n[spec-parser] Review written to: ${reviewPath}`);
}

main().catch((err) => {
  console.error('[spec-parser] Fatal error:', err);
  process.exit(1);
});
