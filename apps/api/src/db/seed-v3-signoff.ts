/**
 * v3 sign-off data migration — resolves the five review items from MORNING-REPORT.md.
 *
 * IDEMPOTENT — safe to run multiple times.
 * REVERSIBLE — only status changes (active ↔ hidden); no rows are deleted.
 *
 * What it does:
 *   Item 1. Hides 7 orphaned original categories (0 products, 0 files)
 *           that are now duplicated by v3 categories.
 *   Item 2. Hides the v3 "Street & area" category because Road Lighting
 *           (093411dc) has a live product link and must remain active.
 *   Item 3. category_document_requirements — left empty (no action).
 *   Item 4. Populates category_attribute_relevance for Flexible LED Tapes
 *           and Flex Neon with the 12 new v3 Flexible-group attributes.
 *   Item 5. See TODO in MORNING-REPORT.md (no code change here).
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import { categories } from './schema/categories';
import { category_attribute_relevance } from './schema/catalogue';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db  = drizzle(sql);

// ─── Item 1 + 2: categories to hide ───────────────────────────────────────

const TO_HIDE: Array<{ id: string; label: string; reason: string }> = [
  // Item 1 — orphaned originals with v3 duplicates (all have 0 files, 0 products)
  {
    id: '8ce70106-d688-422d-888a-e594e983ab83',
    label: 'Recessed Downlight',
    reason: 'duplicated by v3 "Downlight (recessed)"',
  },
  {
    id: 'f617dd52-625d-4cbd-9a2f-9e584dbcd874',
    label: 'Track Lighting',
    reason: 'duplicated by v3 "Track & rail system"',
  },
  {
    id: 'f20885e4-0b3c-42dc-b0cd-ab2c9c3d205c',
    label: 'Pendant',
    reason: 'duplicated by v3 "Pendant / suspended"',
  },
  {
    id: '0509b6c2-2703-42f4-9fb8-7e6cbc365b93',
    label: 'Facade Lighting',
    reason: 'duplicated by v3 "Facade-surface linear"',
  },
  {
    id: '4c12a8e5-65cf-4551-beaf-64bd4ee5705f',
    label: 'Tunnel Lighting',
    reason: 'duplicated by v3 "Tunnel"',
  },
  {
    id: 'b67966f6-3ffa-4bff-95cf-3e82387fddbd',
    label: 'Landscape Lighting',
    reason: 'duplicated by v3 "Landscape"',
  },
  {
    id: 'bbbcb2ed-ce62-4d92-b5f5-574f33e2ba80',
    label: 'Emergency',
    reason: 'duplicated by v3 "Emergency / exit"',
  },
  // Item 2 — hide the v3 duplicate; Road Lighting (093411dc) stays active
  {
    id: '94291617-9be3-446d-b5e2-b56f460d8e3b',
    label: 'Street & area (v3)',
    reason: 'Road Lighting (093411dc) has 1 live product link — keeping original active; hiding v3 duplicate',
  },
];

// ─── Item 4: attribute relevance for Flexible categories ───────────────────

const FLEX_TAPES_ID = '99b49d18-a926-4606-a6ca-590f0635c39c';
const FLEX_NEON_ID  = '2ae11ee9-2254-45dd-95b6-46b4d8887f8b';

/**
 * v3 Flexible-group attributes with per-category relevance.
 *
 * primary         — core attribute for this luminaire type; shown prominently.
 * secondary       — relevant but not the main spec axis.
 * not_applicable  — should not appear in pickers for this category.
 */
const FLEX_TAPES_RELEVANCE: Array<{ key: string; relevance: 'primary' | 'secondary' | 'not_applicable' }> = [
  // Per-metre performance — central for tapes
  { key: 'watts_per_metre',   relevance: 'primary'        },
  { key: 'lumens_per_metre',  relevance: 'primary'        },
  { key: 'led_per_metre',     relevance: 'primary'        },
  { key: 'cut_interval',      relevance: 'primary'        },
  { key: 'max_run',           relevance: 'primary'        },
  // Colour / control
  { key: 'colour_mode',       relevance: 'primary'        },
  { key: 'addressability',    relevance: 'primary'        },
  { key: 'pixel_protocol',    relevance: 'secondary'      },
  // Optic / thermal
  { key: 'wash_optic',        relevance: 'secondary'      },
  { key: 'high_temp_variant', relevance: 'secondary'      },
  // Bending — tapes go in profiles; they don't bend natively
  { key: 'bend_plane',        relevance: 'not_applicable' },
  { key: 'min_bend_radius',   relevance: 'not_applicable' },
];

const FLEX_NEON_RELEVANCE: Array<{ key: string; relevance: 'primary' | 'secondary' | 'not_applicable' }> = [
  // Bending — primary axis for neon
  { key: 'bend_plane',        relevance: 'primary'   },
  { key: 'min_bend_radius',   relevance: 'primary'   },
  // Colour / control — also primary
  { key: 'colour_mode',       relevance: 'primary'   },
  { key: 'addressability',    relevance: 'primary'   },
  // Per-metre performance — relevant but secondary (neon spec is often gross)
  { key: 'watts_per_metre',   relevance: 'primary'   },
  { key: 'lumens_per_metre',  relevance: 'primary'   },
  { key: 'led_per_metre',     relevance: 'secondary' },
  { key: 'cut_interval',      relevance: 'secondary' },
  { key: 'max_run',           relevance: 'secondary' },
  // Pixel
  { key: 'pixel_protocol',    relevance: 'secondary' },
  // Optic / thermal
  { key: 'wash_optic',        relevance: 'secondary' },
  { key: 'high_temp_variant', relevance: 'secondary' },
];

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== v3 sign-off migration ===\n');

  // ── Item 1 + 2: hide categories ──────────────────────────────────────────
  console.log('Items 1 & 2 — hiding duplicated/superseded categories:\n');

  for (const cat of TO_HIDE) {
    const [existing] = await db
      .select({ id: categories.id, status: categories.status })
      .from(categories)
      .where(eq(categories.id, cat.id))
      .limit(1);

    if (!existing) {
      console.log(`  ⚠  ${cat.label} (${cat.id.slice(0, 8)}) — NOT FOUND, skipping`);
      continue;
    }

    if (existing.status === 'hidden') {
      console.log(`  –  ${cat.label} (${cat.id.slice(0, 8)}) — already hidden`);
      continue;
    }

    await db
      .update(categories)
      .set({ status: 'hidden', is_active: false, updated_at: new Date() })
      .where(eq(categories.id, cat.id));

    console.log(`  ✓  ${cat.label} (${cat.id.slice(0, 8)}) → hidden  [${cat.reason}]`);
  }

  // ── Item 3: category_document_requirements ────────────────────────────────
  console.log('\nItem 3 — category_document_requirements: left empty (no action).');

  // ── Item 4: category_attribute_relevance ──────────────────────────────────
  console.log('\nItem 4 — populating category_attribute_relevance for flexible categories:\n');

  const pairs: Array<{
    categoryId: string;
    label: string;
    relevance: Array<{ key: string; relevance: 'primary' | 'secondary' | 'not_applicable' }>;
  }> = [
    { categoryId: FLEX_TAPES_ID, label: 'Flexible LED Tapes', relevance: FLEX_TAPES_RELEVANCE },
    { categoryId: FLEX_NEON_ID,  label: 'Flex Neon',          relevance: FLEX_NEON_RELEVANCE  },
  ];

  for (const { categoryId, label, relevance } of pairs) {
    let inserted = 0;
    let skipped  = 0;

    for (const { key, relevance: level } of relevance) {
      // Idempotent: skip if already present for this (category, attribute_key) pair
      const [existing] = await db
        .select({ id: category_attribute_relevance.id })
        .from(category_attribute_relevance)
        .where(
          and(
            eq(category_attribute_relevance.category_id, categoryId),
            eq(category_attribute_relevance.attribute_key, key),
          ),
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(category_attribute_relevance).values({
        category_id:   categoryId,
        attribute_key: key,
        relevance:     level,
      });
      inserted++;
    }

    console.log(`  ✓  ${label} (${categoryId.slice(0, 8)}): ${inserted} inserted, ${skipped} already present`);
  }

  // ── Item 5: noted in MORNING-REPORT.md ───────────────────────────────────
  console.log('\nItem 5 — spec/claude-extractor.ts: TODO noted in MORNING-REPORT.md (no code change).');

  console.log('\n=== Sign-off migration complete ===\n');
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Sign-off migration failed:', err);
  process.exit(1);
});
