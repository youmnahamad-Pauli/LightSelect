/**
 * Seeds system categories and document types.
 * Safe to run multiple times — skips rows that already exist by slug or code.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, isNull, and } from 'drizzle-orm';
import { categories, document_types } from './schema/categories';

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

async function upsertCategory(
  name: string,
  parentSlug: string | null = null,
): Promise<string> {
  const slug = toSlug(name);

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, slug), isNull(categories.organization_id)))
    .limit(1);

  if (existing) return existing.id;

  let parentId: string | null = null;
  if (parentSlug) {
    const [parent] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, parentSlug), isNull(categories.organization_id)))
      .limit(1);
    if (parent) parentId = parent.id;
  }

  const [created] = await db
    .insert(categories)
    .values({ name, slug, is_system_defined: true, parent_category_id: parentId })
    .returning({ id: categories.id });

  console.log(`  ✓ category: ${name}`);
  return created.id;
}

async function upsertDocumentType(name: string, code: string, description?: string): Promise<void> {
  const [existing] = await db
    .select({ id: document_types.id })
    .from(document_types)
    .where(eq(document_types.code, code))
    .limit(1);

  if (existing) return;

  await db.insert(document_types).values({ name, code, description });
  console.log(`  ✓ document type: ${name} (${code})`);
}

async function main() {
  console.log('Seeding system categories…');

  // Root categories
  await upsertCategory('Indoor');
  await upsertCategory('Outdoor');
  await upsertCategory('Controls');
  await upsertCategory('Emergency');
  await upsertCategory('Architectural');

  // Indoor subcategories
  await upsertCategory('Office', 'indoor');
  await upsertCategory('Retail', 'indoor');
  await upsertCategory('Hospitality', 'indoor');
  await upsertCategory('Healthcare', 'indoor');
  await upsertCategory('Industrial', 'indoor');
  await upsertCategory('Education', 'indoor');

  // Outdoor subcategories
  await upsertCategory('Road Lighting', 'outdoor');
  await upsertCategory('Facade Lighting', 'outdoor');
  await upsertCategory('Sports Lighting', 'outdoor');
  await upsertCategory('Landscape Lighting', 'outdoor');
  await upsertCategory('Tunnel Lighting', 'outdoor');
  await upsertCategory('Parking', 'outdoor');

  // Architectural subcategories
  await upsertCategory('Linear Profile', 'architectural');
  await upsertCategory('Recessed Downlight', 'architectural');
  await upsertCategory('Track Lighting', 'architectural');
  await upsertCategory('Pendant', 'architectural');
  await upsertCategory('Wall Washer', 'architectural');

  console.log('\nSeeding document types…');

  await upsertDocumentType('Datasheet', 'DS', 'Product technical datasheet');
  await upsertDocumentType('IES Photometric File', 'IES', 'IESNA photometric data file');
  await upsertDocumentType('Photometric Report', 'PHO', 'Lighting calculation or photometric report');
  await upsertDocumentType('Installation Manual', 'IM', 'Installation guide or instructions');
  await upsertDocumentType('CE Certificate', 'CE', 'CE conformity declaration');
  await upsertDocumentType('Warranty Document', 'WR', 'Manufacturer warranty terms');
  await upsertDocumentType('Control Guide', 'CG', 'Dimming and control system guide');
  await upsertDocumentType('Wiring Diagram', 'WD', 'Electrical wiring diagram');
  await upsertDocumentType('Specification Sheet', 'SS', 'Project specification sheet');
  await upsertDocumentType('Technical Drawing', 'DWG', 'CAD or dimensional drawing');
  await upsertDocumentType('LM-79 Report', 'LM79', 'IESNA LM-79 photometric test report');
  await upsertDocumentType('LM-80 Report', 'LM80', 'IESNA LM-80 LED lumen maintenance report');
  await upsertDocumentType('DALI Certificate', 'DALI', 'DALI compliance certificate');
  await upsertDocumentType('IP Test Report', 'IP', 'Ingress protection test certificate');

  console.log('\nSeed complete.');
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
