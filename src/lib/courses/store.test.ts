import { beforeEach, describe, expect, it } from 'vitest';

import { catalogueCourses, chosenClasses } from '../application/chosen-classes.js';
import { offeringsOf } from '../application/offerings.js';
import { createApplication, listApplications } from '../application/store.js';
import { classTally } from '../application/tally.js';
import { createEphemeralDatabase, runMigrations, type Db } from '../db/client.js';
import { applicationChildren, courses as coursesTable } from '../db/schema.js';
import { CATALOGUE } from './catalogue.js';
import type { Course } from './course.js';
import {
  createCourse,
  deleteCourse,
  getCourse,
  listCourses,
  listEveryCourse,
  retireCourse,
  saveCourse,
  unretireCourse,
  type CourseEdit,
} from './store.js';

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
  const { slug: _slug, retiredAt: _retired, lastEditedBy: _by, lastEditedAt: _at, ...edit } = course;
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

  it('lets a class give its instructor up and take one back', async () => {
    // #257, both directions, because the staffing question is asked twice: a
    // class typed in before it is staffed, and a class whose instructor
    // leaves. Null goes down and comes back as null, never as an empty string.
    const unstaffed = await saveCourse(
      db,
      'backyard-botany',
      { ...editOf((await getCourse(db, 'backyard-botany'))!), instructorSlug: null },
      'Jill Kilker',
    );
    expect(unstaffed.instructorSlug).toBeNull();
    expect((await getCourse(db, 'backyard-botany'))?.instructorSlug).toBeNull();

    const staffed = await saveCourse(
      db,
      'backyard-botany',
      { ...editOf(unstaffed), instructorSlug: 'mandy-saint' },
      'Jill Kilker',
    );
    expect(staffed.instructorSlug).toBe('mandy-saint');
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

  it('takes a class the school has scheduled and not staffed', async () => {
    // #257. The school puts a class on the schedule before it decides who
    // teaches it, so the column takes a null and hands one back — never an
    // empty string standing in for a person nobody has picked.
    const donor = (await getCourse(db, 'backyard-botany'))!;
    const created = await createCourse(
      db,
      'winter-birds',
      { ...editOf(donor), title: 'Winter Birds', instructorSlug: null },
      'Jill Kilker',
    );

    expect(created.instructorSlug).toBeNull();
    expect((await getCourse(db, 'winter-birds'))?.instructorSlug).toBeNull();
  });

  it('adds it running, not retired', async () => {
    const donor = (await getCourse(db, 'backyard-botany'))!;
    await createCourse(
      db,
      'winter-birds',
      { ...editOf(donor), title: 'Winter Birds', enrolment: 'spring', enrolmentUnits: ['spring'] },
      'Jill Kilker',
    );

    expect((await getCourse(db, 'winter-birds'))?.retiredAt).toBeNull();
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

/**
 * Retiring a class, and bringing it back (#263).
 *
 * The two readers are the whole mechanism, so they are what is asserted:
 * `listCourses` is what every public surface renders and a retired class is not
 * in it, `listEveryCourse` is the school's own list and it is. Everything else
 * — the age bands, the timetable, the Apply page's offerings — is downstream of
 * the first, and the class page and the class tally are downstream of the
 * second, so proving the pair proves the surfaces.
 */
describe('retiring a course', () => {
  it('takes it out of the published list and leaves it in the school’s own', async () => {
    await retireCourse(db, 'backyard-botany', 'Jill Kilker');

    const published = (await listCourses(db)).map((course) => course.slug);
    const every = (await listEveryCourse(db)).map((course) => course.slug);

    expect(published).not.toContain('backyard-botany');
    expect(every).toContain('backyard-botany');
  });

  it('still answers at its own address, which is what keeps the page up', async () => {
    // A printed flyer and the redirect from the old site both point here, so a
    // retired class says the school is not running it rather than 404ing.
    await retireCourse(db, 'backyard-botany', 'Jill Kilker');
    expect((await getCourse(db, 'backyard-botany'))?.title).toBe('Backyard Botany');
  });

  it('records when it happened, and stamps the row like any other save', async () => {
    const at = new Date('2026-08-15T14:00:00Z');
    const retired = await retireCourse(db, 'backyard-botany', 'Jill Kilker', at);

    expect(retired.retiredAt).toEqual(at);
    expect(retired.lastEditedBy).toBe('Jill Kilker');
    expect(retired.lastEditedAt).toEqual(at);
  });

  it('clears the date on the way back, and stamps that too', async () => {
    const at = new Date('2026-09-01T14:00:00Z');
    await retireCourse(db, 'backyard-botany', 'Jill Kilker');
    const back = await unretireCourse(db, 'backyard-botany', 'George Jensen', at);

    expect(back.retiredAt).toBeNull();
    expect(back.lastEditedBy).toBe('George Jensen');
    expect(back.lastEditedAt).toEqual(at);
    expect((await listCourses(db)).map((course) => course.slug)).toContain('backyard-botany');
  });

  it('loses nothing on the round trip — no field is retyped', async () => {
    const before = (await getCourse(db, 'backyard-botany'))!;
    await retireCourse(db, 'backyard-botany', 'Jill Kilker');
    const after = await unretireCourse(db, 'backyard-botany', 'Jill Kilker');

    // Everything but the two things retiring is *for*: the date, and the stamp
    // that says who last touched the row.
    const { retiredAt: _wasRetired, lastEditedBy: _by, lastEditedAt: _at, ...kept } = before;
    expect(after).toMatchObject(kept);
  });

  it('refuses to retire a course that is not there', async () => {
    await expect(retireCourse(db, 'underwater-basket-weaving', 'Jill Kilker')).rejects.toThrow(
      /underwater-basket-weaving/,
    );
  });

  it('does not read a fully retired catalogue as an unmigrated database', async () => {
    // The empty-catalogue guard is about rows, not about listings: a school
    // that has retired everything has made a decision, where a database with no
    // course rows in it has never had the migration run. Throwing here would
    // take the whole public site down on the last retire.
    for (const course of await listEveryCourse(db)) {
      await retireCourse(db, course.slug, 'Jill Kilker');
    }
    expect(await listCourses(db)).toEqual([]);
  });

  it('leaves the retirement alone when the editor saves the rest of the row', async () => {
    // Retire and Save are two buttons and two writes. A save carrying the whole
    // form must not quietly bring a class back, which is what would happen if
    // the date rode along in `CourseEdit`.
    const at = new Date('2026-08-15T14:00:00Z');
    await retireCourse(db, 'backyard-botany', 'Jill Kilker', at);
    const before = (await getCourse(db, 'backyard-botany'))!;
    const saved = await saveCourse(
      db,
      'backyard-botany',
      { ...editOf(before), requiredText: 'A field notebook' },
      'Jill Kilker',
    );

    expect(saved.retiredAt).toEqual(at);
  });
});

/**
 * Deleting a class, and what it must not touch (#267, ADR-0021).
 *
 * The row going is the easy half and is asserted first. The half this ticket is
 * actually about is below it: a family applied for the class, the school
 * deletes it, and **every column of that application is exactly what it was** —
 * because an application names its classes as captured text rather than as a
 * pointer (#259). That is what makes an unconditional delete safe, so it is
 * proved against real tables rather than reasoned about.
 */
describe('deleting a course', () => {
  /** One application, for the class the tests below delete out from under it. */
  async function applyForAlgebra(): Promise<void> {
    await createApplication(
      db,
      {
        familyName: 'Marsh',
        phone: '717-555-0142',
        address: { street: '12 Oak Lane', street2: '', city: 'Gettysburg', state: 'PA', zip: '17325' },
        email: 'ruth@example.com',
        children: [{ name: 'Obi', age: '9', offeringKeys: ['algebra-1:year'] }],
        faith: {},
        objections: '',
        agreements: {},
        paymentMethod: 'check',
      },
      { statementVersion: 'sof-test', offerings: offeringsOf(await listCourses(db)) },
    );
  }

  it('takes it out of both lists and stops answering at its address', async () => {
    await deleteCourse(db, 'backyard-botany');

    expect((await listCourses(db)).map((course) => course.slug)).not.toContain('backyard-botany');
    expect((await listEveryCourse(db)).map((course) => course.slug)).not.toContain(
      'backyard-botany',
    );
    expect(await getCourse(db, 'backyard-botany')).toBeUndefined();
  });

  it('empties the catalogue when every class goes, rather than refusing the last one', async () => {
    // The school's own list is allowed to be empty: that is the state the admin
    // Classes screen has an empty state for, and a new school clearing the
    // board is the case this delete exists for.
    for (const course of await listEveryCourse(db)) {
      await deleteCourse(db, course.slug);
    }
    expect(await listEveryCourse(db)).toEqual([]);
  });

  it('is silent about a class that is not there', async () => {
    // The row is gone either way, and the screen that called this already had
    // the course. Nothing here is a refusal.
    await expect(deleteCourse(db, 'underwater-basket-weaving')).resolves.toBeUndefined();
  });

  it('modifies no application row, and is not refused for having been applied for', async () => {
    await applyForAlgebra();
    const children = await db.select().from(applicationChildren);
    const applications = await listApplications(db);

    await deleteCourse(db, 'algebra-1');

    expect(await db.select().from(applicationChildren)).toEqual(children);
    expect(await listApplications(db)).toEqual(applications);
  });

  it('leaves the deleted class named, marked and counted on the application', async () => {
    // The two readers of a submitted application, after the class it names has
    // gone: it is named as the family was shown it, marked as no longer
    // offered, and still counted in the tally the school decides on.
    await applyForAlgebra();
    await deleteCourse(db, 'algebra-1');

    const applications = await listApplications(db);
    const live = offeringsOf(await listCourses(db));
    const [chosen] = chosenClasses(applications[0]!.children[0]!, catalogueCourses(live));

    expect(chosen!.title).toBe('Algebra 1');
    expect(chosen!.offered).toBe(false);

    const [entry] = classTally(applications, live);
    expect(entry!.courseSlug).toBe('algebra-1');
    expect(entry!.offered).toBe(false);
    expect(entry!.seats).toHaveLength(1);
  });
});
