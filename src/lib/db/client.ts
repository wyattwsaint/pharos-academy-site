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

/**
 * Whether this process is running on the ephemeral database.
 *
 * Callers use it to decide whether seeding test accounts is legitimate. It is
 * never true in production, because `open()` throws there instead.
 */
export function isEphemeralDatabase(): boolean {
  return !connectionString();
}

async function open(): Promise<Db> {
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

function connectionString(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  return url && url.trim() ? url.trim() : undefined;
}

function isProduction(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === 'production';
}
