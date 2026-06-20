/**
 * v3 taxonomy seed — adds the LightSelect-Product-Database-Map-v3.md §3
 * luminaire-type categories as DB records (is_system_defined=true, global).
 *
 * SAFE to run multiple times — skips existing slugs.
 * Does NOT modify or remove any of the 22 original seeded categories.
 *
 * Road Lighting (093411dc) has 1 product link — ID is never touched here.
 * No category_document_requirements rows are created (greenfield — needs
 * human decision per MORNING-REPORT.md §Needs human decision).
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, isNull, and } from 'drizzle-orm';
import { categories } from './schema/categories';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

async function upsertCategory(name: string): Promise<{ id: string; created: boolean }> {
  const slug = toSlug(name);
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, slug), isNull(categories.organization_id)))
    .limit(1);

  if (existing) return { id: existing.id, created: false };

  const [created] = await db
    .insert(categories)
    .values({
      name,
      slug,
      is_system_defined: true,
      status: 'active',
      is_active: true,
    })
    .returning({ id: categories.id });

  return { id: created.id, created: true };
}

// ─── v3 §3 taxonomy ────────────────────────────────────────────────────────

const V3_CATEGORIES = [
  // Interior — ceiling & recessed
  'Downlight (recessed)',
  'Downlight (surface)',
  'Panels & Troffers',
  'Recessed modular multiples',
  'Recessed accent / adjustable spotlight',
  'Projector / spotlight (standalone)',
  'Track & rail system',
  'Track inserts',
  'Pendant / suspended',
  // Interior — surface group
  'Surface-mounted linear',
  'Surface bulkhead',
  'Surface spots',
  'Surface ceiling (general)',
  // Interior — wall & special
  'Wall (surface)',
  'Recessed wall / step / orientation',
  'Emergency / exit',
  'Cleanroom',
  // Industrial
  'High/low bay',
  'Waterproof batten',
  'Batten & trunking',
  // Linear / continuous-run
  'Flexible LED Tapes',
  'Flex Neon',
  'Ceiling recessed linear',
  'Pendant linear (indoor)',
  'Pendant linear (outdoor)',
  'Cove',
  // Facade / exterior architectural
  'Facade-surface linear',
  'Facade-inground linear',
  'Facade beam/projector',
  'Facade quad/flood',
  // Exterior — area & street
  'Floodlight/projector',
  'Street & area',
  'Post-top',
  'Light column',
  'Pole/column (structural)',
  'Tunnel',
  'Bollard',
  'In-ground (general)',
  'Wall-mounted exterior',
  // Specialist
  'Underwater (IP68)',
  'Landscape',
];

async function main() {
  console.log('Seeding v3 luminaire-type categories…\n');

  let created = 0;
  let skipped = 0;

  for (const name of V3_CATEGORIES) {
    const result = await upsertCategory(name);
    if (result.created) {
      console.log(`  ✓ ${name}  (${result.id})`);
      created++;
    } else {
      console.log(`  – ${name}  (exists: ${result.id})`);
      skipped++;
    }
  }

  console.log(`\nDone. Created: ${created}  Skipped (already existed): ${skipped}`);
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('v3 seed failed:', err);
  process.exit(1);
});
