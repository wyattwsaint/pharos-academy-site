import { beforeEach, describe, expect, it } from 'vitest';

import { listCourses, listEveryCourse, retireCourse } from '../courses/store.js';
import { createEphemeralDatabase, runMigrations, type Db } from '../db/client.js';
import { courses as coursesTable, people as peopleTable } from '../db/schema.js';
import { bySlug, instructorOf, instructorsAmong, leadershipAmong, PEOPLE } from './person.js';
import {
  createPerson,
  deletePerson,
  getPerson,
  listEveryPerson,
  listPeople,
  retirePerson,
  savePerson,
  unretirePerson,
} from './store.js';

/**
 * The one list, against real Postgres.
 *
 * PGlite runs the DDL Neon ran, so this is where the interesting half of #26 is
 * proved: the migration that turned `courses.instructor` from a typed name into
 * a foreign key really does land every course on a person, and the store hands
 * back an optional bio as null rather than as an empty string.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

describe('the seeded people', () => {
  it('holds leadership and instructors in one list', async () => {
    const people = await listPeople(db);
    expect(people).toHaveLength(PEOPLE.length);
    expect(leadershipAmong(people)).toHaveLength(3);
  });

  it('lists leadership first, in the school’s order', async () => {
    const people = await listPeople(db);
    expect(people.slice(0, 3).map((person) => person.slug)).toEqual([
      'jill-kilker',
      'george-jensen',
      'kathy-liddick',
    ]);
  });

  it('keeps an unwritten bio and an unsupplied photograph null', async () => {
    const person = await getPerson(db, 'angela-fecteau');
    expect(person?.bio).toBeNull();
    expect(person?.photo).toBeNull();
    expect(person?.role).toBe('Instructor');
  });

  it('reads back the photograph and the bio of somebody the school supplied them for', async () => {
    // #99 for the face, #150 for the paragraph. The migrations are where both
    // arrive, so this is the check that the seed and the applied SQL say the
    // same thing about what the staff page prints under her name.
    const person = await getPerson(db, 'mandy-saint');
    expect(person?.photo).toBe('/portraits/mandy-saint.webp');
    expect(person?.bio).toBe(PEOPLE.find((seeded) => seeded.slug === 'mandy-saint')?.bio);
  });

  it('answers with nothing for a slug that is not a person', async () => {
    expect(await getPerson(db, 'nobody-at-all')).toBeUndefined();
  });

  it('refuses an empty list rather than rendering a school with no staff', async () => {
    // The courses go first only because it is the shortest way to an empty
    // table here. Since #262 a person who teaches can be deleted properly —
    // `deletePerson` clears the references first — so this is a statement
    // about the public guard, not about the foreign key.
    await db.delete(coursesTable);
    await db.delete(peopleTable);
    await expect(listPeople(db)).rejects.toThrow(/db:migrate/);
  });
});

describe('deleting a person', () => {
  /** Dr. Mandy Saint teaches eight of the nineteen — the interesting case. */
  const TEACHES_EIGHT = 'mandy-saint';

  it('takes them off the one list every surface reads', async () => {
    await deletePerson(db, TEACHES_EIGHT);

    expect(await getPerson(db, TEACHES_EIGHT)).toBeUndefined();
    expect((await listPeople(db)).map((person) => person.slug)).not.toContain(TEACHES_EIGHT);
  });

  it('leaves every class they taught standing, and instructorless', async () => {
    /*
     * #262's core promise, and the reason the delete is allowed to be
     * unconditional: the classes are the school's own copy, they keep running,
     * and the only thing that changes about them is that they name nobody.
     * Compared field for field, so a delete that quietly dropped a fee or a
     * text would fail here rather than on a class page.
     */
    const before = (await listCourses(db)).filter(
      (course) => course.instructorSlug === TEACHES_EIGHT,
    );
    expect(before.length).toBe(8);

    await deletePerson(db, TEACHES_EIGHT);

    const after = await listCourses(db);
    expect(after).toHaveLength(19);
    for (const was of before) {
      const now = after.find((course) => course.slug === was.slug);
      expect(now, was.title).toBeDefined();
      expect(now!.instructorSlug, was.title).toBeNull();
      expect({ ...now!, instructorSlug: was.instructorSlug }, was.title).toEqual(was);
    }
  });

  it('touches no class taught by anybody else', async () => {
    // Only their references are cleared. A delete that nulled the column
    // wholesale would unstaff the school in one press.
    const others = (await listCourses(db)).filter(
      (course) => course.instructorSlug !== TEACHES_EIGHT,
    );

    await deletePerson(db, TEACHES_EIGHT);

    const after = await listCourses(db);
    for (const was of others) {
      expect(after.find((course) => course.slug === was.slug), was.title).toEqual(was);
    }
  });

  it('is never refused, and empties the list entirely', async () => {
    /*
     * Two acceptance criteria that are one action, so they share one database:
     * every one of the ten goes, whatever they teach — before #257 the foreign
     * key refused eight of them — and there is no floor on the list (ADR-0021).
     */
    for (const person of await listPeople(db)) {
      await expect(deletePerson(db, person.slug), person.name).resolves.toBeUndefined();
    }

    expect(await listEveryPerson(db)).toEqual([]);
    // The admin's own reader is what renders the empty state; the public guard
    // still refuses an empty table, which #197 decided and this does not touch.
    await expect(listPeople(db)).rejects.toThrow(/db:migrate/);

    // And the catalogue is whole, with nobody teaching any of it.
    const courses = await listCourses(db);
    expect(courses).toHaveLength(19);
    expect(courses.every((course) => course.instructorSlug === null)).toBe(true);
  });

  it('is not refused by a retired class either, and unstaffs that one too', async () => {
    /*
     * #262's "not by a retired course", which only became testable when #263
     * shipped retirement. A retired class is still the school's own copy and
     * still names its instructor — it is simply not being run this year — so
     * the delete clears it like any other and comes back if the class does.
     */
    await retireCourse(db, 'kingdom-math', 'Jill Kilker');

    await expect(deletePerson(db, TEACHES_EIGHT)).resolves.toBeUndefined();

    const retired = (await listEveryCourse(db)).find((course) => course.slug === 'kingdom-math')!;
    expect(retired.retiredAt).not.toBeNull();
    expect(retired.instructorSlug).toBeNull();
  });

  it('says nothing about a slug that is not there', async () => {
    // Silent, like the other stores' deletes: the row is gone either way.
    await expect(deletePerson(db, 'nobody-at-all')).resolves.toBeUndefined();
    expect(await listEveryPerson(db)).toHaveLength(PEOPLE.length);
  });
});

describe('the catalogue, after the migration', () => {
  it('points every course at a person rather than at a typed name', async () => {
    const directory = bySlug(await listPeople(db));
    for (const course of await listCourses(db)) {
      expect(instructorOf(directory, course)?.name, course.title).toBeTruthy();
    }
  });

  it('gives Algebra 1 the chaplain who teaches it, from the one list', async () => {
    const directory = bySlug(await listPeople(db));
    const courses = await listCourses(db);
    const algebra = courses.find((course) => course.slug === 'algebra-1')!;
    expect(instructorOf(directory, algebra)?.name).toBe('Pastor George Jensen');
    expect(instructorOf(directory, algebra)?.role).toBe('Chaplain & Spiritual Advisor');
  });

  it('is idempotent — re-running the migrations changes nothing', async () => {
    const before = await listPeople(db);
    await runMigrations(db);
    expect(await listPeople(db)).toEqual(before);
  });
});

describe('editing a person', () => {
  it('saves the change and stamps who made it', async () => {
    const at = new Date('2026-08-05T14:00:00Z');
    const saved = await savePerson(
      db,
      'mandy-saint',
      {
        name: 'Mrs. Mandy Saint',
        role: 'Instructor',
        bio: 'Twelve years of early elementary science.',
        photo: null,
        leadershipRank: null,
      },
      'Jill Kilker',
      at,
    );

    expect(saved.bio).toBe('Twelve years of early elementary science.');
    expect(saved.lastEditedBy).toBe('Jill Kilker');
    expect(saved.lastEditedAt).toEqual(at);
  });

  it('changes the name on every class that person teaches, at once', async () => {
    // AC 3: there is one place a name lives, so correcting it corrects the
    // class pages and the timetable together rather than one of the two.
    await savePerson(
      db,
      'mandy-saint',
      { name: 'Dr. Mandy Saint', role: 'Instructor', bio: null, photo: null, leadershipRank: null },
      'Jill Kilker',
    );

    const directory = bySlug(await listPeople(db));
    const hers = (await listCourses(db)).filter((course) => course.instructorSlug === 'mandy-saint');
    expect(hers).toHaveLength(8);
    for (const course of hers) {
      expect(instructorOf(directory, course)?.name).toBe('Dr. Mandy Saint');
    }
  });

  it('refuses to save somebody who is not there', async () => {
    await expect(
      savePerson(
        db,
        'nobody-at-all',
        { name: 'Nobody', role: 'Instructor', bio: null, photo: null, leadershipRank: null },
        'Jill Kilker',
      ),
    ).rejects.toThrow(/nobody-at-all/);
  });
});

describe('adding a person', () => {
  it('puts them in the same one list, stamped', async () => {
    await createPerson(
      db,
      'new-hire',
      { name: 'Mrs. New Hire', role: 'Instructor', bio: null, photo: null, leadershipRank: null },
      'Jill Kilker',
    );

    const person = await getPerson(db, 'new-hire');
    expect(person?.lastEditedBy).toBe('Jill Kilker');
    expect((await listPeople(db)).map((entry) => entry.slug)).toContain('new-hire');
  });

  it('places a new leader by rank rather than at the end', async () => {
    await createPerson(
      db,
      'new-deputy',
      { name: 'Mrs. New Deputy', role: 'Deputy Head', bio: null, photo: null, leadershipRank: 2 },
      'Jill Kilker',
    );

    const ranked = leadershipAmong(await listPeople(db)).map((person) => person.slug);
    expect(ranked[0]).toBe('jill-kilker');
    expect(ranked.indexOf('new-deputy')).toBeLessThan(ranked.indexOf('kathy-liddick'));
  });

  it('adds them listed, not retired', async () => {
    await createPerson(
      db,
      'new-hire',
      { name: 'Mrs. New Hire', role: 'Instructor', bio: null, photo: null, leadershipRank: null },
      'Jill Kilker',
    );

    expect((await getPerson(db, 'new-hire'))?.retiredAt).toBeNull();
  });
});

/**
 * Retiring somebody, against real Postgres (#266).
 *
 * The two readers are the whole of it: the staff page reads one and the admin
 * reads the other, so "off the staff page, still in the office's own list" is a
 * fact about the store rather than a filter each screen has to remember.
 */
describe('retiring a person', () => {
  it('takes them off the staff page’s reader and leaves them in the admin’s', async () => {
    await retirePerson(db, 'robyn-lach', 'Jill Kilker');

    const published = (await listPeople(db)).map((person) => person.slug);
    const everybody = (await listEveryPerson(db)).map((person) => person.slug);

    expect(published).not.toContain('robyn-lach');
    expect(everybody).toContain('robyn-lach');
    expect(everybody).toHaveLength(PEOPLE.length);
  });

  it('records when it happened, and stamps who did it', async () => {
    const at = new Date('2026-06-30T14:00:00Z');
    const retired = await retirePerson(db, 'robyn-lach', 'Jill Kilker', at);

    expect(retired.retiredAt).toEqual(at);
    expect(retired.lastEditedBy).toBe('Jill Kilker');
    expect(retired.lastEditedAt).toEqual(at);
  });

  it('is never refused, whatever they teach', async () => {
    // Mandy teaches eight of the catalogue's classes. The school can act on a
    // departure the day it happens; what the classes print is a rendering rule
    // and needs no course reassigned first.
    const hers = (await listCourses(db)).filter((course) => course.instructorSlug === 'mandy-saint');
    expect(hers.length).toBeGreaterThan(0);

    await expect(retirePerson(db, 'mandy-saint', 'Jill Kilker')).resolves.toBeTruthy();
  });

  it('unnames them on the live classes they taught, without touching a course row', async () => {
    const before = await listCourses(db);
    await retirePerson(db, 'mandy-saint', 'Jill Kilker');

    const directory = bySlug(await listEveryPerson(db));
    const after = await listCourses(db);
    const hers = after.filter((course) => course.instructorSlug === 'mandy-saint');

    expect(hers.length).toBeGreaterThan(0);
    for (const course of hers) {
      expect(instructorOf(directory, course), course.title).toBeNull();
    }
    // The catalogue is untouched: every course still points where it pointed.
    expect(after.map((course) => course.instructorSlug)).toEqual(
      before.map((course) => course.instructorSlug),
    );
  });

  it('takes them off the staff page’s instructors as well as its leadership', async () => {
    // `instructorsAmong` is derived from the catalogue, so the staff page loses
    // them by being handed the published reader — not by a second rule.
    await retirePerson(db, 'mandy-saint', 'Jill Kilker');

    const teaching = instructorsAmong(await listPeople(db), await listCourses(db));
    expect(teaching.map((entry) => entry.person.slug)).not.toContain('mandy-saint');
  });

  it('brings them back to both lists, with nothing retyped', async () => {
    const before = await getPerson(db, 'mandy-saint');
    await retirePerson(db, 'mandy-saint', 'Jill Kilker');
    const back = await unretirePerson(db, 'mandy-saint', 'Jill Kilker');

    expect(back.retiredAt).toBeNull();
    expect(back.bio).toBe(before?.bio);
    expect(back.photo).toBe(before?.photo);
    expect((await listPeople(db)).map((person) => person.slug)).toContain('mandy-saint');

    const directory = bySlug(await listEveryPerson(db));
    const hers = (await listCourses(db)).filter((course) => course.instructorSlug === 'mandy-saint');
    for (const course of hers) {
      expect(instructorOf(directory, course)?.name, course.title).toBe('Mrs. Mandy Saint');
    }
  });

  it('refuses somebody who is not there', async () => {
    await expect(retirePerson(db, 'nobody-at-all', 'Jill Kilker')).rejects.toThrow(/nobody-at-all/);
  });

  it('still refuses an empty table, where everybody retired is a decision', async () => {
    // The guard is about a database the migration never ran against, so it is
    // applied before the filter: retiring the last person must not read as an
    // outage.
    for (const person of await listEveryPerson(db)) {
      await retirePerson(db, person.slug, 'Jill Kilker');
    }
    expect(await listPeople(db)).toEqual([]);

    await db.delete(coursesTable);
    await db.delete(peopleTable);
    await expect(listPeople(db)).rejects.toThrow(/db:migrate/);
  });
});
