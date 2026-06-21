/**
 * CLI script: ingest a lighting catalogue PDF into the canonical registry.
 *
 * Usage:
 *   npx tsx src/db/catalogue-ingest.ts \
 *     --pdf /path/to/catalogue.pdf \
 *     --org-id <uuid> \
 *     [--filter N25,N19,N24]   # restrict to products whose model_code contains these strings
 *     [--model claude-sonnet-4-6]
 *
 * The script writes a JSON result to stdout and generates
 * INGESTION-REVIEW.md at the repo root when run from the monorepo root
 * or in the current directory otherwise.
 *
 * PRE-REQUISITES:
 *   - DATABASE_URL and ANTHROPIC_API_KEY must be in apps/api/.env
 *   - The 0002_registry_tables migration must have been applied to the DB.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { runCatalogueIngestion } from '../lib/ingestion/pipeline';
import type { CatalogueIngestionResult } from '../lib/ingestion/types';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  pdf: string;
  orgId: string;
  filter: string[];
  model: string | undefined;
} {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const pdf = get('--pdf');
  const orgId = get('--org-id');

  if (!pdf) {
    console.error('Usage: npx tsx src/db/catalogue-ingest.ts --pdf <path> --org-id <uuid> [--filter codes] [--model name]');
    process.exit(1);
  }
  if (!orgId) {
    console.error('--org-id is required. Find your org UUID from the organizations table.');
    process.exit(1);
  }

  const filterRaw = get('--filter') ?? '';
  const filter = filterRaw ? filterRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const model = get('--model');

  return { pdf: path.resolve(pdf), orgId, filter, model };
}

// ─── Review markdown generator ───────────────────────────────────────────────

function generateReviewMarkdown(result: CatalogueIngestionResult): string {
  const lines: string[] = [];
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  lines.push(`# Ingestion Review — ${path.basename(result.source_file)}`);
  lines.push('');
  lines.push(`**Ingested at:** ${ts}`);
  lines.push(`**Source file:** \`${result.source_file}\``);
  lines.push(`**Org ID:** \`${result.org_id}\``);
  lines.push(`**Products detected:** ${result.products_detected}`);
  lines.push(`**Products written:** ${result.products_written}`);
  lines.push(`**Total attribute values stored:** ${result.total_attribute_values}`);
  lines.push(`**LLM:** ${result.llm_meta.model} · in=${result.llm_meta.input_tokens} out=${result.llm_meta.output_tokens} (${result.llm_meta.elapsed_ms}ms)`);
  lines.push('');
  lines.push('> All values have `value_state = \'extracted\'` and require human review.');
  lines.push('> To confirm a value, update the row in `product_attribute_values` and set `value_state = \'confirmed\'`.');
  lines.push('> To confirm a canonical product, set `review_status = \'confirmed\'` in `canonical_products`.');
  lines.push('');

  if (result.products.length === 0) {
    lines.push('_No products were extracted._');
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');

  for (const p of result.products) {
    const pageStr = p.pages[0] === p.pages[1] ? `p.${p.pages[0]}` : `pp.${p.pages[0]}–${p.pages[1]}`;
    const statusBadge = p.review_status === 'needs_review' ? '⚠️ needs_review' : '✓ auto_merged';
    const dupBadge = p.merged_into_existing ? ' _(merged into existing)_' : '';

    lines.push(`## ${p.display_name} ${statusBadge}${dupBadge}`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Canonical ID | \`${p.canonical_product_id}\` |`);
    lines.push(`| Manufacturer | ${p.manufacturer} |`);
    lines.push(`| Model code | ${p.model_code ?? '_(none)_'} |`);
    lines.push(`| Source pages | ${pageStr} |`);
    lines.push(`| Attributes written | ${p.attributes_written} |`);
    lines.push(`| Attributes skipped | ${p.attributes_skipped} |`);
    lines.push('');
    lines.push('');
  }

  // Accuracy summary
  const allProducts = result.products;
  const noModel = allProducts.filter((p) => !p.model_code).length;
  const merged = allProducts.filter((p) => p.merged_into_existing).length;
  const avgAttrs = allProducts.length
    ? Math.round(result.total_attribute_values / allProducts.length)
    : 0;

  lines.push('---');
  lines.push('');
  lines.push('## Accuracy & Uncertainty Summary');
  lines.push('');
  lines.push(`- **${allProducts.length}** product(s) extracted`);
  lines.push(`- **${noModel}** product(s) have no model code → flagged \`needs_review\``);
  lines.push(`- **${merged}** product(s) merged into an existing canonical record`);
  lines.push(`- Average **${avgAttrs}** attribute values per product`);
  lines.push('');
  lines.push('All values are **extracted** (not confirmed). Confidence scores are stored in');
  lines.push('`product_attribute_values.confidence_score`. Low-confidence values (< 0.7) should');
  lines.push('be prioritised for human review.');
  lines.push('');
  lines.push('### How to review');
  lines.push('');
  lines.push('```sql');
  lines.push('-- See all extracted products from this ingestion run');
  lines.push(`SELECT cp.display_name, cp.review_status, cp.review_notes,`);
  lines.push(`       pav.attribute_key, pav.attribute_value, pav.confidence_score, pav.conflict_notes`);
  lines.push(`FROM canonical_products cp`);
  lines.push(`JOIN product_attribute_values pav ON pav.canonical_product_id = cp.id`);
  lines.push(`WHERE cp.review_notes LIKE 'Ingested from: ${path.basename(result.source_file)}%'`);
  lines.push(`ORDER BY cp.display_name, pav.attribute_key;`);
  lines.push('```');
  lines.push('');
  lines.push('### Needs human decision');
  lines.push('');

  const issues: string[] = [];
  if (noModel > 0) {
    issues.push(`- ${noModel} product(s) have no model code. Review their \`soft_match_hint\` to check for duplicates.`);
  }
  if (merged > 0) {
    issues.push(`- ${merged} product(s) were merged into existing canonical records. Verify the merge is correct.`);
  }
  issues.push('- `merge_type = \'manual\'` is used for catalogue-ingested sources (no `products` table row exists). A new merge_type (e.g. `catalogue_ingestion`) could be added in a future schema migration to distinguish this provenance more precisely.');
  issues.push('- Variant handling: if a product has multiple CCT or wattage options with the same model code, only the "primary" value was extracted. The notes attribute contains variant information. A future enhancement could create separate canonical records per variant.');
  issues.push('- `org_id` is required by the schema. The catalogue ingestion must always be associated with a specific org. Consider whether a system/library org concept is needed for manufacturer-level catalogues shared across orgs.');

  lines.push(...issues);
  lines.push('');

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { pdf, orgId, filter, model } = parseArgs(process.argv);

  console.log('[ingestion] Starting catalogue ingestion pipeline');
  console.log(`[ingestion] PDF: ${pdf}`);
  console.log(`[ingestion] Org: ${orgId}`);
  if (filter.length) console.log(`[ingestion] Filter: ${filter.join(', ')}`);

  const result = await runCatalogueIngestion({
    pdfPath: pdf,
    orgId,
    modelFilter: filter.length ? filter : undefined,
    model,
  });

  // Write result JSON to stdout
  console.log('\n[ingestion] Result:');
  console.log(JSON.stringify(result, null, 2));

  // Write review markdown alongside the PDF (or in cwd if PDF is in ingestion-input/)
  const reviewDir = fs.existsSync(path.join(process.cwd(), 'ingestion-input'))
    ? process.cwd()
    : path.dirname(pdf);

  const reviewPath = path.join(reviewDir, 'INGESTION-REVIEW.md');
  const markdown = generateReviewMarkdown(result);
  fs.writeFileSync(reviewPath, markdown, 'utf8');
  console.log(`\n[ingestion] Review written to: ${reviewPath}`);
}

main().catch((err) => {
  console.error('[ingestion] Fatal error:', err);
  process.exit(1);
});
