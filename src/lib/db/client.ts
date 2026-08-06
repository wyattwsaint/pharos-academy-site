import { sql } from 'drizzle-orm';
import { drizzle as drizzleNeon, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { MIGRATIONS, MIGRATIONS_TABLE_DDL } from './migrations.js';
import * as schema from './schema.js';

/**
 * The one way to reach the store.
 *
 * Two drivers, one schema. `DATABASE_URL` present means Neon over HTTP — the
 * production path, and the path a developer with `.env.local` gets. Absent, and
 * only outside production, it means an ephemeral in-process PGlite: real
 * Postgres, real SQL, gone when the process ends.
 *
 * The ephemeral database is not a mock and not a second implementation. It
 * exists so the browser suite can prove login, save and the failed-revalidation
 * message in CI, where there is no Neon secret and never should be. The DDL it
 * runs is the DDL Neon ran.
 */

const migrationsTable = pgTable('_migrations', {
  id: text('id').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Both drivers are `PgDatabase`s over the same schema, but their query-result
 * type parameters differ, so TypeScript will not unify them. The Neon type is
 * the one that describes production; the PGlite handle is asserted into it at
 * the single point of construction below, and every call site is then typed
 * against the driver that actually matters.
 */
export type Db = NeonHttpDatabase<typeof schema>;

let handle: Promise<Db> | undefined;

/** The database handle, opened once per process. */
export function getDb(): Promise<Db> {
  handle ??= open();
  return handle;
}

async function open(): Promise<Db> {
  const suite = suiteAdmin();
  if (suite) {
    // Suite mode, and it is deliberately all-or-nothing: an ephemeral database
    // *and* an account to sign into it with, never one without the other. It
    // wins over `DATABASE_URL` so a developer with `.env.local` runs the browser
    // suite against a throwaway database rather than against the school's.
    const db = await createEphemeralDatabase();
    await seedSuiteAdmin(db, suite);
    await seedSuitePolicyFiles(db);
    return db;
  }

  const url = connectionString();
  if (url) {
    return drizzleNeon(url, { schema });
  }

  if (isProduction()) {
    // Fail closed and say why. A production deployment that quietly fell back
    // to an in-memory database would accept Jill's edits and lose them, which
    // is the exact failure this ticket exists to make impossible.
    throw new Error(
      'DATABASE_URL is not set. Neon is a launch dependency (#18 §2), not just an admin store — refusing to start on an ephemeral database.',
    );
  }

  return createEphemeralDatabase();
}

/**
 * A fresh in-process Postgres with the migrations applied.
 *
 * Also what the integration tests open, one per test, so each of them starts
 * from the same DDL production runs rather than from a fixture nobody keeps up
 * to date.
 */
export async function createEphemeralDatabase(): Promise<Db> {
  // A variable specifier keeps the bundler from tracing PGlite into the
  // deployed function. It is a devDependency: present for `astro dev`, the
  // tests and CI, absent from the lambda, and unreachable there anyway.
  const specifier = '@electric-sql/pglite';
  const { PGlite } = await import(/* @vite-ignore */ specifier);
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const db = drizzlePglite(new PGlite(), { schema }) as unknown as Db;
  await runMigrations(db);
  return db;
}

/**
 * Apply every migration that has not been applied yet, in order.
 *
 * Idempotent by construction: the applied ids are rows, and each statement is
 * itself safe to re-run, so an interrupted run resumes rather than wedges.
 * Returns the ids it applied — nothing, on an up-to-date database.
 */
export async function runMigrations(db: Db): Promise<string[]> {
  await db.execute(sql.raw(MIGRATIONS_TABLE_DDL));
  const applied = new Set((await db.select().from(migrationsTable)).map((row) => row.id));

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await db.execute(sql.raw(statement));
    }
    await db.insert(migrationsTable).values({ id: migration.id }).onConflictDoNothing();
    ran.push(migration.id);
  }
  return ran;
}

/**
 * The account the browser suite signs in as, if this process is serving it.
 *
 * Both variables or neither — a username with no password would be an account
 * nobody can use, and a password with no username would be a credential with
 * nowhere to go. Absent, which is every real deployment and every ordinary
 * `astro dev`, this is undefined and nothing below it happens.
 */
function suiteAdmin(): { username: string; password: string } | undefined {
  const username = process.env.E2E_ADMIN_USERNAME?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (!username || !password) return undefined;

  if (isProduction()) {
    // Refusing is the whole safety story. Left to run, this would replace the
    // school's database with an empty one and open it with a password that is
    // written down in `playwright.config.ts`.
    throw new Error(
      'E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD are set on a deployed environment. They exist only so the browser suite has a throwaway database to sign into — refusing to start.',
    );
  }
  return { username, password };
}

/**
 * Put the suite's account in the ephemeral database.
 *
 * Imported lazily so that `users.js` — and the scrypt work its module body does
 * to build a decoy hash — is never loaded by a process that is not running the
 * suite.
 */
async function seedSuiteAdmin(db: Db, admin: { username: string; password: string }): Promise<void> {
  const { createUser } = await import('../admin/users.js');
  await createUser(db, { ...admin, displayName: 'Suite Admin' });
}

/**
 * A stand-in PDF on every seeded policy, so the suite has a page to measure.
 *
 * A policy is published by its file, not by its row (#28), and the migrations
 * seed the four rows without bytes — `npm run db:seed` attaches the school's own
 * PDFs from `docs/mirror/`, which CI does not have and must not need. Without
 * this the policies page renders its empty state, and the axe surface that is
 * meant to measure a list of four documents measures one sentence instead.
 *
 * Deliberately not the mirror files: nine bytes prove the route, the caching and
 * the stamped date exactly as well as 921 KB does, and reading a fixture off
 * disk would make the ephemeral database depend on the working tree.
 *
 * Suite mode only, and suite mode already refuses to run on a deployment.
 */
async function seedSuitePolicyFiles(db: Db): Promise<void> {
  const { SEEDED_POLICIES } = await import('../policies/policy.js');
  const { replacePolicyFile } = await import('../policies/store.js');

  const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'latin1');
  for (const seed of SEEDED_POLICIES) {
    await replacePolicyFile(
      db,
      seed.slug,
      { filename: `${seed.slug}.pdf`, bytes },
      'Suite Admin',
    );
  }
}

function connectionString(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  return url && url.trim() ? url.trim() : undefined;
}

function isProduction(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === 'production';
}
