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
    if (process.env.E2E_EMPTY_LISTS?.trim()) {
      // The empty-lists run (#197): the migrations seed a full catalogue,
      // staff list, announcement history and policy set, so the four admin
      // lists are never empty on an ordinary throwaway database — and the
      // empty states those screens promise would otherwise ship untested.
      // Only meaningful inside suite mode, which already refuses production.
      await deleteSeededContent(db);
    } else {
      await seedSuitePolicyFiles(db);
      await seedSuiteRetiredCourse(db);
      await seedSuiteRetiredPerson(db);
      await seedSuiteOrphanedPolicy(db);
    }
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
  await createUser(db, SUITE_SPARE_ACCOUNT);
  await createUser(db, SUITE_KEPT_ACCOUNT);
}

/**
 * A second account the suite exists to delete (#200).
 *
 * The Users screen offers no way to add one, on purpose, and the last account
 * cannot be deleted — so without this the browser suite could prove the
 * confirmation appears but never that confirming it deletes anybody. Deleting
 * the suite's own account instead would sign every other spec out.
 *
 * Its password is never typed: nothing signs in as this account, it only waits
 * to be removed.
 */
const SUITE_SPARE_ACCOUNT = {
  username: 'suite-spare',
  displayName: 'Suite Spare',
  password: 'a-long-enough-spare-passphrase',
};

/**
 * A third account, which exists so that the delete *confirmation* can be
 * measured (#202).
 *
 * Suite Spare cannot serve: the spec that deletes it removes it for the rest of
 * the run, so an axe spec aimed at the confirmation screen would pass or vanish
 * depending on which worker got there first. This one is never deleted — the
 * axe specs reach its confirmation and then decline — so the screen is always
 * there to measure.
 *
 * Its password is never typed either; nothing signs in as it.
 */
const SUITE_KEPT_ACCOUNT = {
  username: 'suite-kept',
  displayName: 'Suite Kept',
  password: 'a-long-enough-kept-passphrase',
};

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

/**
 * The slug of the one class the throwaway database retires (#263).
 *
 * Written out again in `e2e/suite-admin.ts` rather than imported from here, the
 * way `SUITE_KEPT` is: `playwright.config.ts` loads that module to build its
 * environment, and importing this one would drag the driver and every migration
 * into the config's own graph. Two literals, and the comment on each says so.
 */
export const SUITE_RETIRED_COURSE = 'suite-retired-class';

/**
 * A class that is already retired, so both suites have one to measure (#263).
 *
 * The same argument as Suite Kept above, in the catalogue rather than the user
 * list. The retired states — the admin's own section and the class page that
 * says the school is not currently running it — are two axe surfaces that
 * cannot be reached unless something is retired, and no spec may retire a
 * *seeded* class to reach them: the public suite pins the catalogue's size and
 * its published prices, and it runs against this same database at the same
 * time.
 *
 * So the suite gets a class of its own, added and then retired. Being retired
 * is what makes it invisible to every one of those specs — it is off the age
 * bands, off the timetable, out of the full descriptions and off the
 * application — while its own page and the admin's retired section are exactly
 * the two things there to be measured.
 *
 * Suite mode only, and suite mode already refuses to run on a deployment.
 */
async function seedSuiteRetiredCourse(db: Db): Promise<void> {
  const { CATALOGUE } = await import('../courses/catalogue.js');
  const { createCourse, retireCourse } = await import('../courses/store.js');

  const donor = CATALOGUE[0];
  if (!donor) return;
  const { slug: _slug, retiredAt: _retired, lastEditedBy: _by, lastEditedAt: _at, ...edit } = donor;

  await createCourse(
    db,
    SUITE_RETIRED_COURSE,
    { ...edit, title: 'Suite Retired Class' },
    'Suite Admin',
  );
  await retireCourse(db, SUITE_RETIRED_COURSE, 'Suite Admin');
}

/**
 * The slug of the one person the throwaway database retires (#266).
 *
 * Written out again in `e2e/suite-admin.ts` for the reason the class's slug is:
 * the Playwright config loads that module and must not pull the driver in.
 */
export const SUITE_RETIRED_PERSON = 'suite-departed-instructor';

/**
 * Somebody already retired, so the People screen's own retired section can be
 * measured (#266).
 *
 * The class's argument, in the people list. The section only appears on a day
 * the office has retired somebody, and no spec may retire a *seeded* person to
 * reach it: the public suite pins the staff page and the names printed on the
 * classes, and it runs against this same database at the same time.
 *
 * **They teach nothing, and that is deliberate.** A retired person who taught a
 * seeded class would unname it on the class page, the timetable, the full
 * descriptions and its structured data — which is exactly the rule this ticket
 * is about, and exactly the thing the public suite measures against the seed.
 * That rule is proved where it is decided, at `instructorOf`, across all four
 * cases; what is left for a browser is the screen, and the screen needs only
 * somebody in the section.
 *
 * Suite mode only, and suite mode already refuses to run on a deployment.
 */
async function seedSuiteRetiredPerson(db: Db): Promise<void> {
  const { createPerson, retirePerson } = await import('../people/store.js');

  await createPerson(
    db,
    SUITE_RETIRED_PERSON,
    {
      name: 'Mrs. Suite Departed',
      role: 'Instructor',
      bio: null,
      photo: null,
      leadershipRank: null,
    },
    'Suite Admin',
  );
  await retirePerson(db, SUITE_RETIRED_PERSON, 'Suite Admin');
}

/**
 * The title of a policy that has been deleted and left its documents behind
 * (#268).
 *
 * Written out again in `e2e/suite-admin.ts` for the reason `SUITE_KEPT` and
 * `SUITE_RETIRED_COURSE` are: `playwright.config.ts` loads that module to build
 * its environment, and importing this one would drag the driver and every
 * migration into the config's own graph.
 */
export const SUITE_ORPHANED_POLICY = 'Suite Kept Policy';

/**
 * A slug that holds two documents and no policy, so the question can be
 * measured (#268).
 *
 * The create screen asks it only when a title mints an address that already has
 * kept documents under it, and that state exists in the database rather than in
 * a form — so an axe spec cannot reach the screen unless something is there to
 * be inherited. It could reach it by deleting a seeded policy, but the public
 * suite pins the policies page at four documents and runs against this same
 * database at the same time.
 *
 * So the suite gets a history of its own: a policy created, uploaded to twice
 * and then deleted. What is left is invisible everywhere — no row, so nothing
 * lists it and the policies page is still four — while the two versioned
 * addresses go on resolving, which is exactly the state the question is about.
 *
 * Suite mode only, and suite mode already refuses to run on a deployment.
 */
async function seedSuiteOrphanedPolicy(db: Db): Promise<void> {
  const { policySlug } = await import('../policies/policy.js');
  const { createPolicy, deletePolicy, replacePolicyFile } = await import('../policies/store.js');

  const slug = policySlug(SUITE_ORPHANED_POLICY);
  await createPolicy(
    db,
    { slug, title: SUITE_ORPHANED_POLICY, position: 9, signed: false },
    'Suite Admin',
  );
  const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'latin1');
  await replacePolicyFile(db, slug, { filename: `${slug}.pdf`, bytes }, 'Suite Admin');
  await replacePolicyFile(db, slug, { filename: `${slug}-2.pdf`, bytes }, 'Suite Admin');
  await deletePolicy(db, slug);
}

/**
 * Delete every row the migrations seeded into the four admin lists, in the
 * order the foreign keys allow: a course names its teacher, so courses go
 * before people.
 *
 * **A policy's versions no longer go with it** (#260). This used to lean on a
 * cascade that migration 0023 dropped, and it still does the right thing for
 * the reason the run exists: the empty-lists server skips
 * `seedSuitePolicyFiles`, so there are no version rows to leave behind. Adding
 * a delete of `policy_versions` here would be the opposite of what the site now
 * promises — a document survives its policy — so what stays behind on a
 * differently-ordered run is a retained document, correctly.
 *
 * This is the whole of the `E2E_EMPTY_LISTS` seam. It deletes list content
 * only — school details, money, the school year and the calendar stay, because
 * the screens under test are the four lists and a half-emptied database that
 * cannot render the admin chrome would test nothing.
 */
export async function deleteSeededContent(db: Db): Promise<void> {
  await db.delete(schema.courses);
  await db.delete(schema.people);
  await db.delete(schema.announcements);
  await db.delete(schema.policies);
}

function connectionString(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  return url && url.trim() ? url.trim() : undefined;
}

function isProduction(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === 'production';
}
