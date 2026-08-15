import { describe, expect, it } from 'vitest';

import { unitLabel } from '../application/offerings.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { schoolId } from '../structured-data.js';
import { CATALOGUE } from './catalogue.js';
import type { Course } from './course.js';
import { coursePrice, priceLabel } from './pricing.js';
import { contactHours } from './schedule.js';
import { courseJsonLd, courseListJsonLd } from './structured-data.js';

/**
 * #151 AC 1 — each class describes itself, including who it is for and when it
 * runs.
 *
 * Checked against the real catalogue rather than a fixture, because the two
 * courses that matter here are real and neither is typical: Algebra 1 publishes
 * **no numeric age range** and meets twice a week, and The Pilgrim's Progress is
 * a dated block. A fixture would have quietly been a one-day year course with a
 * tidy age range, which is the one shape that cannot go wrong.
 *
 * What is asserted throughout is *agreement with the page's own functions* —
 * `coursePrice`, `contactHours`, `priceLabel`. This file therefore fails if the
 * markup ever starts computing its own answer, which is the criterion about the
 * two not being able to disagree.
 */
const { rates } = SEEDED_MONEY_SETTINGS;
const SITE = 'https://example.org';

function nodeFor(slug: string, instructorName: string | null = 'A Teacher') {
  return courseJsonLd({ course: courseNamed(slug), rates, instructorName, site: SITE }) as Record<
    string,
    // The node is a plain object by construction; the tests read it as one.
    any
  >;
}

function courseNamed(slug: string): Course {
  const course = CATALOGUE.find((candidate) => candidate.slug === slug);
  if (!course) throw new Error(`No such seeded course: ${slug}`);
  return course;
}

describe('a class’s structured data', () => {
  const algebra = nodeFor('algebra-1');

  it('is a Course at the class’s own address', () => {
    expect(algebra['@type']).toBe('Course');
    expect(algebra.url).toBe(`${SITE}/classes/algebra-1`);
    expect(algebra['@id']).toBe(`${SITE}/classes/algebra-1#course`);
  });

  // AC 4. The school is referred to, never described a second time.
  it('names the school by its existing identifier rather than describing one', () => {
    expect(algebra.provider).toEqual({ '@id': schoolId(SITE) });
    expect(JSON.stringify(algebra)).not.toContain('Sherwood');
  });

  it('carries the school’s own title and description, unedited', () => {
    expect(algebra.name).toBe(courseNamed('algebra-1').title);
    expect(algebra.description).toBe(courseNamed('algebra-1').description);
  });
});

describe('who a class is for', () => {
  it('states the age range the school publishes', () => {
    const botany = nodeFor('backyard-botany');
    expect(botany.typicalAgeRange).toBe(courseNamed('backyard-botany').ageLabel);
    expect(botany.audience).toMatchObject({
      '@type': 'EducationalAudience',
      educationalRole: 'student',
    });
  });

  /*
   * The load-bearing half (`ages.ts`). Algebra 1's gate is "8th Grade and older
   * (or younger students who demonstrate proficiency)" — a prerequisite, not an
   * age. A `typicalAgeRange` invented for it would publish a gate the school
   * deliberately has not set, and would exclude the younger student that
   * sentence exists to invite.
   */
  it('publishes no age range for a class whose gate is proficiency', () => {
    const algebra = nodeFor('algebra-1');
    expect(algebra.typicalAgeRange).toBeUndefined();
    expect(algebra.audience.audienceType).toBe(courseNamed('algebra-1').ageLabel);
  });

  it('carries the prerequisites the school states, including “None”', () => {
    expect(nodeFor('backyard-botany').coursePrerequisites).toBe(
      courseNamed('backyard-botany').prerequisites,
    );
    expect(nodeFor('pilgrims-progress-for-kids').coursePrerequisites).toBe('None');
    expect(nodeFor('algebra-1').coursePrerequisites).toContain('Proficiency in core arithmetic');
  });

  it('claims a credit only where the school awards one', () => {
    expect(nodeFor('algebra-1').educationalCredentialAwarded).toContain('Algebra 1 credit');
    expect(nodeFor('backyard-botany').educationalCredentialAwarded).toBeUndefined();
  });
});

describe('when a class runs', () => {
  it('gives the days as days of the week, and the clock times as typed', () => {
    const schedule = nodeFor('algebra-1').hasCourseInstance.courseSchedule;
    expect(schedule.byDay).toEqual(['https://schema.org/Monday', 'https://schema.org/Wednesday']);
    expect(schedule.startTime).toBe('11:20');
    expect(schedule.endTime).toBe('12:20');
    expect(schedule.repeatFrequency).toBe('weekly');
    // Weeks per day track, which is what the school publishes and what the
    // contact hours are computed from.
    expect(schedule.repeatCount).toBe(28);
  });

  // The times are wall-clock times in Enola. Without the zone a crawler reads
  // 11:20 in its own, which for a European index is the middle of the night.
  it('says which clock the times are on', () => {
    expect(nodeFor('algebra-1').hasCourseInstance.courseSchedule.scheduleTimezone).toBe(
      'America/New_York',
    );
  });

  it('counts hours the way the page does, per week and in total', () => {
    // Two one-hour meetings a week; 56 hours in all, which is the figure the
    // school itself publishes.
    expect(nodeFor('algebra-1').hasCourseInstance.courseWorkload).toBe('PT2H');
    expect(nodeFor('algebra-1').timeRequired).toBe('PT56H');
    expect(contactHours(courseNamed('algebra-1'))).toBe(56);
  });

  it('carries a half-hour meeting as half an hour, not as an hour', () => {
    // God Made Everything runs 9:00–10:30 once a week.
    expect(nodeFor('god-made-everything').hasCourseInstance.courseWorkload).toBe('PT1H30M');
  });

  /*
   * A block's real bounds are its own published dates. A year course has none,
   * and bounds inferred from the school year would be this module deciding
   * something no page says.
   */
  it('dates a block from the first and last meeting the school published', () => {
    const block = nodeFor('pilgrims-progress-for-kids').hasCourseInstance;
    expect(block.startDate).toBe('2026-09-02');
    expect(block.endDate).toBe('2026-12-02');
  });

  it('leaves a year course undated rather than inventing a run', () => {
    const instance = nodeFor('algebra-1').hasCourseInstance;
    expect(instance.startDate).toBeUndefined();
    expect(instance.endDate).toBeUndefined();
  });

  it('meets at the school, by reference, and is taught by a resolved person', () => {
    const instance = nodeFor('algebra-1').hasCourseInstance;
    expect(instance.location).toEqual({ '@id': schoolId(SITE) });
    expect(instance.instructor).toEqual({ '@type': 'Person', name: 'A Teacher' });
    // Hybrid: the class is in the room, the rest of the work is at home.
    expect(instance.courseMode).toBe('blended');
  });

  it('omits the instructor entirely for a class the school has not staffed', () => {
    /*
     * #257. The page asks `instructorOf` once and hands the answer here, so
     * "no instructor" reaches this as null — and the key is *absent*, not an
     * empty `Person` and not an empty name. A crawler that found either would
     * be holding an assertion that a teacher exists, which is exactly the
     * claim the page declines to make.
     */
    const instance = nodeFor('algebra-1', null).hasCourseInstance;
    expect(instance).not.toHaveProperty('instructor');
  });
});

describe('what a class costs', () => {
  it('offers exactly the figure the cost line on the page prints', () => {
    const offers = nodeFor('algebra-1').offers;
    const price = coursePrice(courseNamed('algebra-1'), rates);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ '@type': 'Offer', priceCurrency: 'USD', price: price.year });
    expect(priceLabel(courseNamed('algebra-1'), rates)).toContain(`$${price.year}`);
    // The picker's own word for the unit, not a second set of labels here: a
    // family choosing "Full year" in the application and an assistant quoting one
    // are quoting the same thing.
    expect(offers[0].name).toBe(unitLabel('year'));
  });

  /*
   * #24, restated in markup. Nine year courses publish a semester *price* while
   * offering no semester *enrolment*; an offer per priced figure would invent a
   * $420 offering the school does not sell, and an offer is a thing a family can
   * try to buy.
   */
  it('offers only the units a family may actually enrol in', () => {
    for (const course of CATALOGUE) {
      const offers = (courseJsonLd({ course, rates, site: SITE }) as Record<string, any>).offers ?? [];
      expect(offers, course.slug).toHaveLength(course.enrolmentUnits.length);
    }
  });

  it('prices a block flat, as the page does', () => {
    const offers = nodeFor('pilgrims-progress-for-kids').offers;
    expect(offers[0].price).toBe(coursePrice(courseNamed('pilgrims-progress-for-kids'), rates).flat);
  });
});

describe('a list view’s structured data', () => {
  const list = courseListJsonLd(CATALOGUE, '/classes/descriptions', SITE) as Record<string, any>;

  it('is a list of the classes’ own pages, in the page’s order', () => {
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement).toHaveLength(CATALOGUE.length);
    expect(list.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: CATALOGUE[0]!.title,
      url: `${SITE}/classes/${CATALOGUE[0]!.slug}`,
    });
  });

  /*
   * By Age shows a class under every band its range touches, so the same course
   * arrives more than once. A list that repeated it would claim two classes where
   * the school has one, and a crawler counting the list would read that claim.
   */
  it('lists a class once even when the page shows it in three places', () => {
    const repeated = courseListJsonLd(
      [CATALOGUE[0]!, CATALOGUE[1]!, CATALOGUE[0]!],
      '/classes',
      SITE,
    ) as Record<string, any>;
    expect(repeated.itemListElement).toHaveLength(2);
    expect(repeated.itemListElement.map((item: { position: number }) => item.position)).toEqual([
      1, 2,
    ]);
  });

  it('does not describe the classes a second time', () => {
    // The description, the price and the schedule belong to the class's own page.
    // A list that carried them would be a fourth copy of every class.
    expect(JSON.stringify(list)).not.toContain('Offer');
    expect(JSON.stringify(list)).not.toContain('courseSchedule');
  });
});

describe('every class in the catalogue', () => {
  /*
   * The whole catalogue, because the failure this guards is a *particular*
   * class going quiet — a renamed field or a null the seed happens not to have.
   * The fields listed are the ones the acceptance criteria name.
   */
  it('describes itself with a name, a schedule, an audience and a price', () => {
    for (const course of CATALOGUE) {
      const node = courseJsonLd({ course, rates, site: SITE }) as Record<string, any>;
      expect(node.name, course.slug).toBe(course.title);
      expect(node.hasCourseInstance.courseSchedule.byDay.length, course.slug).toBe(
        course.days.length,
      );
      expect(node.audience.audienceType, course.slug).toBeTruthy();
      expect(node.offers?.length, course.slug).toBeGreaterThan(0);
      expect(node.timeRequired, course.slug).toMatch(/^PT\d+(?:H\d+M|H|M)$/);
    }
  });
});
