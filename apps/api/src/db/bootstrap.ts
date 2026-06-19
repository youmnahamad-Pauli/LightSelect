/**
 * Creates the first organization and admin user, then links them via organization_users.
 * Idempotent: exits cleanly if BOOTSTRAP_ADMIN_EMAIL already exists in users.
 *
 * Required env vars (in apps/api/.env):
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { users, organizations, organization_users } from './schema';

const ORG_NAME = 'LightSelect';

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    console.log(`Admin user ${email} already exists — skipping bootstrap.`);
    await sql.end();
    process.exit(0);
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: ORG_NAME })
    .returning({ id: organizations.id, name: organizations.name });

  console.log(`✓ organization: ${org.name} (${org.id})`);

  const password_hash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({ full_name: 'Admin', email, password_hash, role: 'admin' })
    .returning({ id: users.id, email: users.email });

  console.log(`✓ user: ${user.email} (${user.id})`);

  await db.insert(organization_users).values({
    organization_id: org.id,
    user_id: user.id,
    organization_role: 'owner',
  });

  console.log(`✓ linked to organization as owner`);
  console.log('\nBootstrap complete.');
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
