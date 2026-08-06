import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { people as peopleTable, type PersonRow } from '../db/schema.js';
import type { Person } from './person.js';

/**
 * The one list of people, read and written (#26).
 *
 * Every surface that prints a person's name — the staff page, each class page,
 * the timetable — comes through here, so there is exactly one place a name can
 * be wrong and exactly one place to fix it.
 *
 * The row and the domain type happen to be the same shape today; the mapping is
 * still written out, for the same reason the catalogue's is, so that a column
 * added for storage reasons does not silently become part of the vocabulary.
 */

/**
 * Everybody, leadership first and then alphabetically.
 *
 * An empty table is a broken deployment rather than a school with no staff —
 * the migration seeds ten — so it is refused loudly here rather than rendered
 * as a staff page with nobody on it.
 */
export async function listPeople(db: Db): Promise<Person[]> {
  const rows = await db.select().from(peopleTable).orderBy(asc(peopleTable.slug));
  if (rows.length === 0) {
    throw new Error('The people list is empty — run `npm run db:migrate`.');
  }
  return rows.map(toPerson).sort(byLeadershipThenName);
}

/** One person, or undefined — which the admin turns into a 404. */
export async function getPerson(db: Db, slug: string): Promise<Person | undefined> {
  const rows = await db.select().from(peopleTable).where(eq(peopleTable.slug, slug)).limit(1);
  const row = rows[0];
  return row ? toPerson(row) : undefined;
}

/** What a save may change. The slug is the key and is not one of them. */
export type PersonEdit = {
  name: string;
  role: string;
  /** Empty means the school has not written one — stored as null, not as `''`. */
  bio: string | null;
  photo: string | null;
  leadershipRank: number | null;
};

/**
 * Save a person and stamp them.
 *
 * The stamp is overwritten rather than appended, like every other editable
 * record (CONTEXT.md): "who last edited this" is the question the school asks,
 * and permissions are flat, so attribution is the control.
 */
export async function savePerson(
  db: Db,
  slug: string,
  edit: PersonEdit,
  editorName: string,
  now = new Date(),
): Promise<Person> {
  const [row] = await db
    .update(peopleTable)
    .set({ ...edit, lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(peopleTable.slug, slug))
    .returning();

  if (!row) throw new Error(`No person with the slug "${slug}".`);
  return toPerson(row);
}

/**
 * Add somebody the school has taken on.
 *
 * Stamped on creation as well as on save: a person who appeared on the staff
 * page with "Not edited yet" against them would be the one record whose
 * attribution is missing, and that is the record somebody would ask about.
 */
export async function createPerson(
  db: Db,
  slug: string,
  edit: PersonEdit,
  editorName: string,
  now = new Date(),
): Promise<Person> {
  const [row] = await db
    .insert(peopleTable)
    .values({ slug, ...edit, lastEditedBy: editorName, lastEditedAt: now })
    .returning();

  if (!row) throw new Error(`Could not add a person with the slug "${slug}".`);
  return toPerson(row);
}

/**
 * Leadership in the school's order, then everybody else by name.
 *
 * The staff page renders in this order and so does the admin list, so the two
 * agree about who is near the top without either of them owning the rule.
 */
function byLeadershipThenName(a: Person, b: Person): number {
  if (a.leadershipRank !== null && b.leadershipRank !== null) {
    return a.leadershipRank - b.leadershipRank;
  }
  if (a.leadershipRank !== null) return -1;
  if (b.leadershipRank !== null) return 1;
  return a.name.localeCompare(b.name);
}

function toPerson(row: PersonRow): Person {
  return {
    slug: row.slug,
    name: row.name,
    role: row.role,
    bio: row.bio,
    photo: row.photo,
    leadershipRank: row.leadershipRank,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
