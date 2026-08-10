import { describe, expect, it } from 'vitest';

import { SEEDED_SCHOOL_YEAR } from '../calendar/year.js';
import { CATALOGUE } from '../courses/catalogue.js';
import type { Course } from '../courses/course.js';
import {
  clashesAmong,
  clashSentence,
  findOffering,
  offeringKey,
  offeringsOf,
  selectedOfferings,
  type Offering,
} from './offerings.js';

/**
 * #31 AC 2, AC 3, AC 4 and AC 5 — the picker's offerings and the clash rule,
 * driven over the **real catalogue** rather than over invented fixtures. The
 * pairs the ticket names are real classes at real times, and a test built on
 * stand-ins would prove the arithmetic and miss the school.
 */

const year = SEEDED_SCHOOL_YEAR;
const bySlug = (slug: string): Course => CATALOGUE.find((course) => course.slug === slug)!;

/** One offering, from a course and a unit. Ticks the unit so it is really on sale. */
const offering = (slug: string, unit: Offering['unit'], over: Partial<Course> = {}): Offering => {
  const course = bySlug(slug);
  return {
    course: { ...course, enrolmentUnits: [unit], ...over },
    unit,
  };
};

describe('the offerings the picker shows (#31 AC 2)', () => {
  it('offers exactly the enrolment units ticked for that course', () => {
    const algebra = bySlug('algebra-1');
    const offerings = offeringsOf([{ ...algebra, enrolmentUnits: ['year', 'fall'] }]);

    expect(offerings.map(offeringKey)).toEqual(['algebra-1:year', 'algebra-1:fall']);
  });

  it('offers a year course no semester the school has not ticked', () => {
    // Nine year courses publish a semester price while selling no semester. The
    // picker must not guess one into existence (#24).
    const algebra = bySlug('algebra-1');
    expect(offeringsOf([{ ...algebra, enrolmentUnits: ['year'] }]).map(offeringKey)).toEqual([
      'algebra-1:year',
    ]);
  });

  it('shows nothing at all for a course with no ticked units', () => {
    const algebra = bySlug('algebra-1');
    expect(offeringsOf([{ ...algebra, enrolmentUnits: [] }])).toEqual([]);
  });

  it('orders each course’s units the same way however they were ticked', () => {
    const algebra = bySlug('algebra-1');
    const offerings = offeringsOf([{ ...algebra, enrolmentUnits: ['spring', 'year', 'fall'] }]);
    expect(offerings.map((one) => one.unit)).toEqual(['year', 'fall', 'spring']);
  });

  it('resolves posted keys and silently drops one that is no longer on sale', () => {
    const offerings = offeringsOf(CATALOGUE);
    const selected = selectedOfferings(offerings, [
      'algebra-1:year',
      'algebra-1:spring',
      'kingdom-math:year',
    ]);

    expect(selected.map(offeringKey)).toEqual(['algebra-1:year', 'kingdom-math:year']);
    expect(findOffering(offerings, 'not-a-class:year')).toBeNull();
  });
});

describe('the clash rule (#31 AC 3)', () => {
  /*
   * The ticket's own example, and the reason the naive check is not enough.
   * Algebra 1 and Beginner Latin (5-6) both meet Monday 11:20–12:20.
   */
  const algebraYear = offering('algebra-1', 'year');

  it('reports Algebra 1 against Beginner Latin (5-6) as a clash', () => {
    const latinYear = offering('beginner-latin-grades-5-6', 'year');
    const clashes = clashesAmong([algebraYear, latinYear], year);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('clash');
    expect(clashes[0]!.track).toBe('Monday');
    // Every Monday of the year, both semesters: 28 of them.
    expect(clashes[0]!.sharedDates).toHaveLength(28);
    expect(clashes[0]!.sharedDates[0]).toBe('2026-08-31');
  });

  it('still reports it after Latin is moved to one semester', () => {
    // The heart of the ticket. A same-slot check that compares semester names
    // clears this pair the moment they stop matching — and sells the family a
    // $280 clash, because Algebra 1 runs the full year and still meets on
    // every Monday the fall Latin does.
    const latinFall = offering('beginner-latin-grades-5-6', 'fall', {
      enrolment: 'fall',
      weeks: 14,
    });
    const clashes = clashesAmong([algebraYear, latinFall], year);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('clash');
    expect(clashes[0]!.sharedDates).toHaveLength(14);
    expect(clashes[0]!.sharedDates.at(-1)).toBe('2026-12-14');
  });

  it('clears a fall class against a spring one in the same slot', () => {
    const latinFall = offering('beginner-latin-grades-5-6', 'fall', {
      enrolment: 'fall',
      weeks: 14,
    });
    const latinSpring = offering('beginner-latin-grades-7-8', 'spring', {
      enrolment: 'spring',
      weeks: 14,
      start: '11:20',
      end: '12:20',
    });

    expect(clashesAmong([latinFall, latinSpring], year)).toEqual([]);
  });

  it('measures real overlap, not adjacency', () => {
    // 9:00–10:00 and 10:00–11:00 touch and do not collide.
    const early = offering('beginner-latin-grades-7-8', 'year');
    const next = offering('god-made-everything', 'year', {
      days: ['Monday'],
      start: '10:00',
      end: '11:00',
    });

    expect(clashesAmong([early, next], year)).toEqual([]);
  });

  it('reports a clash on each morning a twice-weekly class collides on', () => {
    // Algebra 1 meets Monday *and* Wednesday. A class opposite it on both is
    // two mornings lost, and the family is told about both.
    const opposite = offering('kingdom-math', 'year', {
      days: ['Monday', 'Wednesday'],
      start: '11:20',
      end: '12:20',
    });
    const clashes = clashesAmong([algebraYear, opposite], year);

    expect(clashes.map((clash) => clash.track)).toEqual(['Monday', 'Wednesday']);
  });

  it('reports one course selected as two units as a clash with itself', () => {
    const algebraFall = offering('algebra-1', 'fall');
    const clashes = clashesAmong([algebraYear, algebraFall], year);

    expect(clashes.map((clash) => clash.severity)).toEqual(['clash', 'clash']);
  });
});

describe('possible clash — the third state (#31 AC 4)', () => {
  const block = (slug: string, over: Partial<Course> = {}): Offering =>
    offering(slug, 'block', {
      enrolment: 'block',
      days: ['Wednesday'],
      start: '10:40',
      end: '11:40',
      weeks: 6,
      dates: [],
      ...over,
    });

  it('reports two undated blocks in the same slot as possible, not certain', () => {
    const clashes = clashesAmong([block('insect-explorers'), block('nocturnal-wonders')], year);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('possible');
    expect(clashes[0]!.sharedDates).toEqual([]);
  });

  it('resolves to a certain clash once the school sets the dates', () => {
    const dates = ['2026-09-09', '2026-09-16'];
    const clashes = clashesAmong(
      [block('insect-explorers', { dates }), block('nocturnal-wonders', { dates })],
      year,
    );

    expect(clashes[0]!.severity).toBe('clash');
    expect(clashes[0]!.sharedDates).toEqual(dates);
  });

  it('clears two dated blocks run back to back', () => {
    const clashes = clashesAmong(
      [
        block('insect-explorers', { dates: ['2026-09-09', '2026-09-16'] }),
        block('nocturnal-wonders', { dates: ['2026-09-23', '2026-09-30'] }),
      ],
      year,
    );

    expect(clashes).toEqual([]);
  });

  it('puts a certain clash before a possible one', () => {
    const algebra = offering('algebra-1', 'year');
    const latin = offering('beginner-latin-grades-5-6', 'year');
    const undated = block('insect-explorers', { days: ['Monday'], start: '11:20', end: '12:20' });

    const clashes = clashesAmong([undated, algebra, latin], year);
    expect(clashes.map((clash) => clash.severity)).toEqual([
      'clash',
      'possible',
      'possible',
    ]);
  });
});

describe('oversubscription is not a clash (#31 AC 5)', () => {
  /** The five electives the school runs opposite one another on Wednesday. */
  const wednesday1040 = CATALOGUE.filter(
    (course) => course.days.includes('Wednesday') && course.start === '10:40',
  );

  it('has five classes in the Wednesday 10:40 slot', () => {
    expect(wednesday1040.length).toBeGreaterThanOrEqual(5);
  });

  it('warns about none of them when a family selects one', () => {
    for (const course of wednesday1040) {
      expect(clashesAmong([{ course, unit: course.enrolment }], year)).toEqual([]);
    }
  });

  it('warns only once two of them are selected together', () => {
    // Nocturnal Wonders runs 2 September – 7 October and Pilgrim's Progress
    // 2 September – 2 December, so they really are in the room at once.
    const clashes = clashesAmong(
      [offering('nocturnal-wonders', 'block'), offering('pilgrims-progress-for-kids', 'block')],
      year,
    );

    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.track).toBe('Wednesday');
    expect(clashes[0]!.severity).toBe('clash');
  });

  it('warns about none of the five that merely share the slot across the year', () => {
    /*
     * The sharpest fact in this slot, and the one a same-time check gets wrong:
     * all five of these blocks meet at 10:40 on Wednesday and only some pairs
     * of them collide, because they run in different months. Insect Explorers
     * is March; Nocturnal Wonders is September. A family may take both.
     */
    const clashes = clashesAmong(
      [offering('insect-explorers', 'block'), offering('nocturnal-wonders', 'block')],
      year,
    );

    expect(clashes).toEqual([]);
  });
});

describe('what the family is told', () => {
  it('names both classes, the morning and the first day they collide', () => {
    const clashes = clashesAmong(
      [offering('algebra-1', 'year'), offering('beginner-latin-grades-5-6', 'year')],
      year,
    );
    const sentence = clashSentence(clashes[0]!);

    expect(sentence).toContain('Algebra 1 (full year)');
    expect(sentence).toContain('Beginner Latin Immersion (Grades 5-6) (full year)');
    expect(sentence).toContain('Monday');
    expect(sentence).toContain('2026-08-31');
  });

  it('says why a possible clash is only possible', () => {
    const undated = (slug: string): Offering =>
      offering(slug, 'block', {
        enrolment: 'block',
        days: ['Wednesday'],
        start: '10:40',
        end: '11:40',
        dates: [],
      });
    const clashes = clashesAmong([undated('insect-explorers'), undated('nocturnal-wonders')], year);

    expect(clashSentence(clashes[0]!)).toContain('has not set yet');
  });
});
