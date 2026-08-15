import { beforeEach, describe, expect, it } from 'vitest';

import { listCourses } from '../courses/store.js';
import { createEphemeralDatabase, runMigrations, type Db } from '../db/client.js';
import { courses as coursesTable, people as peopleTable } from '../db/schema.js';
import { bySlug, instructorOf, leadershipAmong, PEOPLE } from './person.js';
import { createPerson, getPerson, listPeople, savePerson } from './store.js';

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
    // The courses go first: the foreign key will not let a person who teaches
    // be deleted, which is itself the guarantee that no class page can lose
    // its instructor.
    await db.delete(coursesTable);
    await db.delete(peopleTable);
    await expect(listPeople(db)).rejects.toThrow(/db:migrate/);
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
});
