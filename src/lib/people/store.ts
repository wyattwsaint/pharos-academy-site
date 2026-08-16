import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { courses as coursesTable, people as peopleTable, type PersonRow } from '../db/schema.js';
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
 * The people the school lists today — leadership first, then alphabetically.
 *
 * The **published** reader, and the staff page is what it is for: somebody
 * retired is not on it, which is the whole of "a retired person does not appear
 * on the staff page" (#266). Nothing else has to know the word.
 *
 * An empty table is a broken deployment rather than a school with no staff —
 * the migration seeds ten — so it is refused loudly here rather than rendered
 * as a staff page with nobody on it.
 *
 * The filter is applied **after** the guard, deliberately, exactly as
 * `listCourses` does it: "no rows at all" is a database the migration has never
 * been run against, and "everybody retired" is a decision the school made. The
 * one would turn the other's last retire into an outage.
 */
export async function listPeople(db: Db): Promise<Person[]> {
  const rows = await listEveryPerson(db);
  if (rows.length === 0) {
    throw new Error('The people list is empty — run `npm run db:migrate`.');
  }
  return rows.filter((person) => person.retiredAt === null);
}

/**
 * The whole table, retired people included, with the guard left off.
 *
 * Three kinds of reader want this rather than the published list. The admin
 * People screen is where an empty table is *reported* — "this database has not
 * been set up" — rather than shipped to a parent (#197), and it is also the
 * screen that shows the retired ones in their own section (#266). The **class
 * surfaces** need it because `instructorOf` is what decides whether a class
 * names anybody, and it cannot decide about a person it was not handed: a
 * retired course still prints who taught it. The backup needs it because a
 * backup that drops rows is not one.
 *
 * It was `listPeopleForAdmin` while the admin list was the only caller; the
 * name says what it returns now that the public pages read it too.
 */
export async function listEveryPerson(db: Db): Promise<Person[]> {
  const rows = await db.select().from(peopleTable).orderBy(asc(peopleTable.slug));
  return rows.map(toPerson).sort(byLeadershipThenName);
}

/** One person, or undefined — which the admin turns into a 404. */
export async function getPerson(db: Db, slug: string): Promise<Person | undefined> {
  const rows = await db.select().from(peopleTable).where(eq(peopleTable.slug, slug)).limit(1);
  const row = rows[0];
  return row ? toPerson(row) : undefined;
}

/**
 * What a save may change. The slug is the key and is not one of them.
 *
 * `retiredAt` is not one of them either (#266), for the reason it is outside
 * `CourseEdit`: retiring is its own press with its own writer, and a form that
 * carried the date would let a save that only fixed a typo in somebody's bio
 * put them back on the staff page.
 */
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
 * Delete somebody, and leave the classes they taught standing (#262).
 *
 * **Unconditional, by decision rather than by omission** (ADR-0021). Nothing
 * outside the school's own content points at a person — the application flow
 * does not reference people at all — so there is no record of what a family
 * sent for this to damage. The only thing naming a person is a course, and a
 * course is the school's own copy. A staff list in flux is exactly the thing
 * the office must be able to correct the day it changes, so a duplicate, a
 * never-started and a departure all go without asking a developer.
 *
 * The courses are cleared **first**, and the order is the whole of the safety
 * here. `courses.instructor_slug` is a foreign key with no `on delete` action,
 * so Postgres refuses to remove a row nineteen courses point at; nulling the
 * references is what turns a refusal into a delete. Doing it the other way
 * round is not a different order, it is an error.
 *
 * Not in a transaction, because the production driver is neon-http and there is
 * no interactive one to open — the same constraint `saveSchoolYear` writes down.
 * What that leaves is a delete that dies between the two statements, and the
 * state it leaves is honest and self-healing: some classes are unstaffed, which
 * is a state the site renders correctly (#257), and the person is still on the
 * list, still deletable, and pressing again finishes the job. There is no
 * partial state here that needs hands on the database.
 *
 * Only the courses this person taught are touched, and only their instructor.
 * Every other field of those courses — the title, the morning, the texts, the
 * fees — is left exactly as it was, because a departure is not a reason to
 * change what a class *is*. Reassigning is an ordinary course edit afterwards,
 * deliberately not folded in here: forcing a replacement at delete time would
 * stop the school acting on a departure the day it happens, and would make it
 * name somebody who does not teach the class.
 *
 * Silent on a slug that is not there, like the other stores' deletes: the row
 * is gone either way, and the screen that called this already has the person.
 */
export async function deletePerson(db: Db, slug: string): Promise<void> {
  await db
    .update(coursesTable)
    .set({ instructorSlug: null })
    .where(eq(coursesTable.instructorSlug, slug));

  await db.delete(peopleTable).where(eq(peopleTable.slug, slug));
}

/**
 * Take somebody off the staff page, and stamp them (#266).
 *
 * **The low-stakes move, and the one the school reaches for first.** Retiring
 * and deleting (`deletePerson`) are the same distinction the catalogue draws
 * (CONTEXT.md, "retired"): retiring is for somebody who has left and whose
 * classes are the record of what they taught, deleting is for a row typed in
 * twice. Retiring keeps every course pointing where it points and is one press
 * back; deleting clears those references and is gone.
 *
 * One press and no confirmation, because nothing is lost: the row stays, the
 * courses that point at it keep pointing at it, and `unretirePerson` is the
 * whole of the way back. A confirmation belongs on a move that cannot be
 * undone, and putting one here would teach the office to click through the ones
 * that can.
 *
 * **Never refused, whatever they teach.** The school can act on a departure the
 * day it happens rather than reassigning four courses first; what those courses
 * print is `instructorOf`'s rule and needs nothing stored. That is only true
 * because being an instructor is not a status a person carries — there is no
 * second record of them to leave behind.
 *
 * Retiring somebody already retired re-dates them rather than refusing, which
 * is the harmless reading of a double press.
 */
export async function retirePerson(
  db: Db,
  slug: string,
  editorName: string,
  now = new Date(),
): Promise<Person> {
  return setRetirement(db, slug, now, editorName, now);
}

/** Bring them back. The date is cleared; nothing else about the row is touched. */
export async function unretirePerson(
  db: Db,
  slug: string,
  editorName: string,
  now = new Date(),
): Promise<Person> {
  return setRetirement(db, slug, null, editorName, now);
}

/** The one write both halves are. Deliberately not reachable through `PersonEdit`. */
async function setRetirement(
  db: Db,
  slug: string,
  retiredAt: Date | null,
  editorName: string,
  now: Date,
): Promise<Person> {
  const [row] = await db
    .update(peopleTable)
    .set({ retiredAt, lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(peopleTable.slug, slug))
    .returning();

  if (!row) throw new Error(`No person with the slug "${slug}".`);
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
    retiredAt: row.retiredAt,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
