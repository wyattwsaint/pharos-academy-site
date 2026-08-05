import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, runMigrations, type Db } from '../db/client.js';
import { CATALOGUE } from './catalogue.js';
import { getCourse, listCourses } from './store.js';

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
    expect(course?.instructor).toBe('Mrs. Mandy Saint');
  });

  it('answers with nothing for a slug that is not a class', async () => {
    // Which is what the page turns into a 404, rather than rendering an empty
    // class as though the school offered it.
    expect(await getCourse(db, 'underwater-basket-weaving')).toBeUndefined();
  });

  it('is idempotent — re-running the migrations changes nothing', async () => {
    const before = await listCourses(db);
    // Simulating the half-applied case: the ids are recorded, so a second run
    // is a no-op, and each statement is independently safe anyway.
    await runMigrations(db);
    expect(await listCourses(db)).toEqual(before);
  });
});
