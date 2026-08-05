import { describe, expect, it } from 'vitest';

import { AGE_BANDS, bandsFor, courseInBand, coursesByBand, coursesInBand } from './ages.js';
import { CATALOGUE } from './catalogue.js';

/**
 * #22 AC 5, and the age axis generally: ages are primary, grades are
 * approximations, and a course with no numeric range is shown to everyone.
 */

const algebra = CATALOGUE.find((course) => course.slug === 'algebra-1')!;

describe('the age bands', () => {
  it('cover 4 to 18 with no gap and no overlap', () => {
    expect(AGE_BANDS[0]?.min).toBe(4);
    expect(AGE_BANDS[AGE_BANDS.length - 1]?.max).toBe(18);
    for (let i = 1; i < AGE_BANDS.length; i += 1) {
      expect((AGE_BANDS[i] as { min: number }).min).toBe(
        (AGE_BANDS[i - 1] as { max: number }).max + 1,
      );
    }
  });

  it('give every band a unique anchor, so a band can be linked to', () => {
    const ids = AGE_BANDS.map((band) => band.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leave no course unreachable', () => {
    for (const course of CATALOGUE) {
      expect(bandsFor(course).length, course.title).toBeGreaterThan(0);
    }
  });
});

describe('a course with a numeric range', () => {
  it('appears in every band its range touches, and no others', () => {
    // Backyard Botany is 5-10: a nine-year-old's parent must find it under
    // nine, and a fifteen-year-old's must not find it at all.
    const botany = CATALOGUE.find((course) => course.slug === 'backyard-botany')!;
    expect(bandsFor(botany).map((band) => band.id)).toEqual([
      'ages-4-6',
      'ages-7-9',
      'ages-10-13',
    ]);
  });

  it('is included on a shared edge rather than dropped between bands', () => {
    // 10-13 starts exactly where 7-9 ends. A course of 10-14 belongs to 10-13
    // and 14-18, and an off-by-one here silently hides classes.
    const spanish = CATALOGUE.find((course) => course.slug === 'basic-spanish-grades-5-8')!;
    expect(bandsFor(spanish).map((band) => band.id)).toEqual(['ages-10-13', 'ages-14-18']);
  });
});

describe('Algebra 1', () => {
  it('appears in every age band rather than being excluded for want of a range', () => {
    // The load-bearing rule. Its gate is a prerequisite, not an age, so a
    // filter that needs a number must not be allowed to drop it.
    expect(bandsFor(algebra)).toEqual([...AGE_BANDS]);
    for (const band of AGE_BANDS) {
      expect(courseInBand(algebra, band), band.label).toBe(true);
      expect(coursesInBand(CATALOGUE, band).map((course) => course.slug)).toContain('algebra-1');
    }
  });

  it('sorts last in its band, where its sentence of an age line reads best', () => {
    for (const { courses } of coursesByBand(CATALOGUE)) {
      expect(courses[courses.length - 1]?.slug).toBe('algebra-1');
    }
  });
});

describe('the By Age surface', () => {
  it('shows every course somewhere', () => {
    const shown = new Set(coursesByBand(CATALOGUE).flatMap(({ courses }) => courses.map((c) => c.slug)));
    expect(shown.size).toBe(CATALOGUE.length);
  });

  it('lists a band youngest first', () => {
    for (const { courses } of coursesByBand(CATALOGUE)) {
      const numeric = courses.filter((course) => course.ageMin !== null);
      const mins = numeric.map((course) => course.ageMin as number);
      expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    }
  });

  it('never leaves a band empty', () => {
    for (const { band, courses } of coursesByBand(CATALOGUE)) {
      expect(courses.length, band.label).toBeGreaterThan(0);
    }
  });
});
