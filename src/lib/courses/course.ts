/**
 * A course, as the whole site means it.
 *
 * One shape, used by the seed, the store, all four public surfaces and the
 * tests. The nine hand-maintained artefacts on the live site collapse to this
 * (#22): a parent can find a class four ways and every one of them agrees,
 * because there is only one source.
 *
 * What is *not* here is as deliberate as what is. There is **no price field**
 * and **no contact-hours field**: both are computed (`pricing.ts`), from the
 * meeting times, the week count and the rate tier. Every published figure on
 * the live site is already internally consistent with that formula, which is
 * what makes computing it safe — and a typed price is exactly how the school's
 * nine artefacts drifted apart in the first place.
 */

import type { DayTrack } from './schedule.js';

/**
 * The three classical stages, in the school's own words.
 *
 * A course may sit in two — Algebra 1 is filed under both Logic and Rhetoric —
 * so this is a list on the course, not a single column.
 */
export const STAGES = [
  'Elementary (Grammar Stage)',
  'Middle School (Logic Stage)',
  'High School (Rhetoric Stage)',
] as const;
export type Stage = (typeof STAGES)[number];

/** Is this string one of the three? Asked where a typed form becomes a course. */
export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/**
 * What a course sells (CONTEXT.md, "enrolment unit").
 *
 * `year` means both semesters and is *also* what makes a semester price
 * meaningful: half of the year's contact hours at the same rate. `fall` and
 * `spring` are single-semester courses. `block` is a dated run shorter than a
 * semester, priced flat.
 *
 * Introduction to Church and Bible History offers a year *or* a single
 * semester, which is why this is per-course and not a global setting — but the
 * course is still a `year` course, and the semester option is stated in its
 * own duration line rather than being a fourth shape.
 */
export const ENROLMENT_UNITS = ['year', 'fall', 'spring', 'block'] as const;
export type EnrolmentUnit = (typeof ENROLMENT_UNITS)[number];

/** Is this string one of the four? Asked wherever a typed form becomes a course. */
export function isEnrolmentUnit(value: string): value is EnrolmentUnit {
  return (ENROLMENT_UNITS as readonly string[]).includes(value);
}

/**
 * The two rates the school charges (`docs/mirror/data/courses.json`,
 * `rateCard`). Named rather than numeric on the course so the numbers live in
 * exactly one place — `pricing.ts`.
 */
export const RATE_TIERS = ['standard', 'highSchoolCredit'] as const;
export type RateTier = (typeof RATE_TIERS)[number];

/** Is this string one of the two? Asked where a typed form becomes a course. */
export function isRateTier(value: string): value is RateTier {
  return (RATE_TIERS as readonly string[]).includes(value);
}

export type Course = {
  /** URL segment: `/classes/<slug>`. Unique, stable, and the store's key. */
  slug: string;
  /** The school's own title, including any "(Grades 5-8)" it carries. */
  title: string;
  /** The school's own description, in full, from `/full-course-descriptions`. */
  description: string;
  stages: readonly Stage[];
  /** The day tracks it meets on. Algebra 1 meets twice a week; the rest once. */
  days: readonly DayTrack[];
  /** Meeting start, `HH:MM` on a 24-hour clock. The display string is derived. */
  start: string;
  /** Meeting end, `HH:MM`. */
  end: string;
  enrolment: EnrolmentUnit;
  /**
   * The units a family may actually buy — ticked in the admin, never inferred
   * (#24). Distinct from `enrolment`, the course's *shape*: nine year courses
   * publish a semester price while publishing no semester offering, so the site
   * cannot read purchasability off the shape without guessing a $420 offering
   * into existence. The application's picker offers exactly what is here.
   */
  enrolmentUnits: readonly EnrolmentUnit[];
  /** Meeting weeks per day track. Contact hours are computed from it. */
  weeks: number;
  /** A block's published meeting dates, `YYYY-MM-DD`. Empty for anything else. */
  dates: readonly string[];
  /** The school's own age wording, which is not always a numeric range. */
  ageLabel: string;
  /**
   * The numeric age gate, when the school publishes one.
   *
   * Null on both for Algebra 1 — "8th Grade and older (or younger students who
   * demonstrate proficiency)" is a *prerequisite*, not an age. A course with no
   * numeric range is shown in every age band rather than filtered out of all of
   * them (`ages.ts`), which is the correct reading of a gate the school states
   * in terms of proficiency.
   */
  ageMin: number | null;
  ageMax: number | null;
  rateTier: RateTier;
  /** "1 High School Algebra 1 credit with completed homework", or none. */
  credit: string | null;
  requiredText: string | null;
  optionalText: string | null;
  /** What the parent buys and brings, as distinct from a fee paid to the school. */
  materialsToBuy: string | null;
  /** Dollars, paid to the school (ADR-0013). */
  materialsFee: number | null;
  /** "per year", when the school qualifies the fee. */
  materialsFeeNote: string | null;
  assessmentFee: number | null;
  /** "for test scoring", "for feedback on writing". */
  assessmentFeeNote: string | null;
  prerequisites: string;
  /**
   * Who teaches it, as a `Person.slug` — never a typed name (#26, ADR-0004).
   *
   * The name itself is read from the one list of people at render time, so
   * there is no second copy of a person to keep in sync and correcting a name
   * corrects it on the class page, in the timetable and on the staff page
   * together. `instructorOf` in `people/person.ts` is how a surface gets from
   * this slug to the person.
   */
  instructorSlug: string;
  /** The stamp: who saved this course last, and when. Null for the seeded rows. */
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** The duration line the school publishes, rebuilt from the fields above. */
export function durationLabel(course: Course): string {
  const weeks = `${course.weeks} weeks`;
  switch (course.enrolment) {
    case 'year':
      return course.days.length > 1
        ? `Full Year, ${course.days.length}x/week (${weeks})`
        : `Full Year (${weeks})`;
    case 'fall':
      return `Fall Semester (${weeks})`;
    case 'spring':
      return `Spring Semester (${weeks})`;
    case 'block':
      return weeks;
  }
}
