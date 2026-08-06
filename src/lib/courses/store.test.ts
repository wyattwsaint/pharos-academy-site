import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, runMigrations, type Db } from '../db/client.js';
import { courses as coursesTable } from '../db/schema.js';
import { CATALOGUE } from './catalogue.js';
import type { Course } from './course.js';
import { createCourse, getCourse, listCourses, saveCourse, type CourseEdit } from './store.js';

/**
 * The catalogue, against real Postgres.
 *
 * PGlite runs the DDL Neon ran (`db/migrations.ts`), so this proves the seed
 * survives the round trip into columns and back — text arrays, nullable fee
 * columns, and the age range that is null on both ends or on neither.
 *
 * #22 AC 1's "all nineteen courses are in Neon and render from that one source"
 * has two halves: the rows are here, and what comes back out is exactly what
 * went in. Both are asserted below.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

describe('the seeded catalogue', () => {
  it('puts all nineteen courses in the store', async () => {
    const stored = await listCourses(db);
    expect(stored).toHaveLength(19);
  });

  it('reads back exactly what was seeded, field for field', async () => {
    const stored = await listCourses(db);
    const expected = [...CATALOGUE].sort((a, b) => a.title.localeCompare(b.title));
    expect(stored).toEqual(expected.map((course) => ({ ...course, days: [...course.days], stages: [...course.stages], dates: [...course.dates] })));
  });

  it('keeps Algebra 1’s age range null on both ends', async () => {
    // Not zero, not -1, not a wide range standing in for "everyone": null, so
    // the age rules can tell "no published range" from "published as 0-99".
    const algebra = await getCourse(db, 'algebra-1');
    expect(algebra?.ageMin).toBeNull();
    expect(algebra?.ageMax).toBeNull();
  });

  it('serves one course by its own address', async () => {
    const course = await getCourse(db, 'kingdom-math');
    expect(course?.title).toBe('Kingdom Math: Early Elementary Math Enrichment');
    // The slug, not the name — the name is the `people` row's, and #26's
    // people store is where it is read back.
    expect(course?.instructorSlug).toBe('mandy-saint');
  });

  it('answers with nothing for a slug that is not a class', async () => {
    // Which is what the page turns into a 404, rather than rendering an empty
    // class as though the school offered it.
    expect(await getCourse(db, 'underwater-basket-weaving')).toBeUndefined();
  });

  it('refuses an empty catalogue rather than rendering four empty surfaces', async () => {
    // "No courses" is not a school with no classes; it is a database the
    // migration has never been run against. Saying so is the difference
    // between a loud deploy failure and a parent finding an empty page.
    await db.delete(coursesTable);
    await expect(listCourses(db)).rejects.toThrow(/db:migrate/);
  });

  it('is idempotent — re-running the migrations changes nothing', async () => {
    const before = await listCourses(db);
    // Simulating the half-applied case: the ids are recorded, so a second run
    // is a no-op, and each statement is independently safe anyway.
    await runMigrations(db);
    expect(await listCourses(db)).toEqual(before);
  });

  it('backfills every course as purchasable only in its own shape', async () => {
    // The conservative half of #24 AC 5: nine year courses publish a semester
    // price while publishing no semester offering, so until Jill ticks the
    // semesters herself, `['year']` is the only honest answer.
    for (const course of await listCourses(db)) {
      expect(course.enrolmentUnits, course.title).toEqual([course.enrolment]);
    }
  });
});

/** The course as an edit — everything but the key and the stamp. */
function editOf(course: Course): CourseEdit {
  const { slug: _slug, lastEditedBy: _by, lastEditedAt: _at, ...edit } = course;
  return edit;
}

describe('editing a course', () => {
  it('saves the change and stamps who made it', async () => {
    const at = new Date('2026-08-06T14:00:00Z');
    const before = (await getCourse(db, 'backyard-botany'))!;
    const saved = await saveCourse(
      db,
      'backyard-botany',
      { ...editOf(before), requiredText: 'A field notebook' },
      'Jill Kilker',
      at,
    );

    expect(saved.requiredText).toBe('A field notebook');
    expect(saved.lastEditedBy).toBe('Jill Kilker');
    expect(saved.lastEditedAt).toEqual(at);
  });

  it('reads a saved edit back through the one list every surface renders', async () => {
    // #24 AC 1's mechanism: all four public surfaces read `listCourses`, so an
    // edit that reads back here is an edit on every one of them after save.
    const before = (await getCourse(db, 'algebra-1'))!;
    await saveCourse(
      db,
      'algebra-1',
      { ...editOf(before), enrolmentUnits: ['year', 'fall', 'spring'] },
      'Jill Kilker',
    );

    const listed = (await listCourses(db)).find((course) => course.slug === 'algebra-1');
    expect(listed?.enrolmentUnits).toEqual(['year', 'fall', 'spring']);
  });

  it('refuses to save a course that is not there', async () => {
    const donor = (await getCourse(db, 'algebra-1'))!;
    await expect(
      saveCourse(db, 'underwater-basket-weaving', editOf(donor), 'Jill Kilker'),
    ).rejects.toThrow(/underwater-basket-weaving/);
  });

  it('refuses a course purchasable as nothing at all', async () => {
    // The check constraint, proved from the store side: an empty tick list is
    // a class nobody could ever apply for, and the row will not hold one.
    const before = (await getCourse(db, 'algebra-1'))!;
    await expect(
      saveCourse(db, 'algebra-1', { ...editOf(before), enrolmentUnits: [] }, 'Jill Kilker'),
    ).rejects.toThrow();
  });
});

describe('adding a course', () => {
  it('puts it in the same one list, stamped', async () => {
    const donor = (await getCourse(db, 'backyard-botany'))!;
    await createCourse(
      db,
      'winter-birds',
      { ...editOf(donor), title: 'Winter Birds', enrolment: 'spring', enrolmentUnits: ['spring'] },
      'Jill Kilker',
    );

    const course = await getCourse(db, 'winter-birds');
    expect(course?.lastEditedBy).toBe('Jill Kilker');
    expect((await listCourses(db)).map((entry) => entry.slug)).toContain('winter-birds');
  });

  it('refuses an instructor who is not on the one list of people', async () => {
    // ADR-0004's foreign key doing its job at authoring time: the catalogue
    // cannot name somebody the staff page does not have.
    const donor = (await getCourse(db, 'backyard-botany'))!;
    await expect(
      createCourse(
        db,
        'ghost-class',
        { ...editOf(donor), title: 'Ghost Class', instructorSlug: 'nobody-at-all' },
        'Jill Kilker',
      ),
    ).rejects.toThrow();
  });
});
