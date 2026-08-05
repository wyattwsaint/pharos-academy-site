/**
 * What a class costs, computed — never a stored, typed number (#22).
 *
 * The school charges by the hour at two rates, and every one of the nineteen
 * published costs on the live site is already exactly contact hours × rate.
 * That consistency is what makes computing the figure safe rather than clever:
 * `pricing.test.ts` recomputes all nineteen and compares them against the
 * figures in `docs/mirror/data/courses.json`, so the day a price stops agreeing
 * with the formula is the day the suite says so.
 *
 * A typed price is how the live site's nine artefacts came to disagree with one
 * another. There is nowhere here to type one.
 */

import type { Course, RateTier } from './course.js';
import { contactHours } from './schedule.js';

/** The rate card (`docs/mirror/data/courses.json`, `rateCard`). Dollars an hour. */
export const RATE_PER_HOUR: Record<RateTier, number> = {
  standard: 10,
  highSchoolCredit: 15,
};

export type Price = {
  /** Contact hours × the rate: the whole cost of the course, always. */
  total: number;
  /** The year figure, for a course sold by the year. */
  year: number | null;
  /**
   * The semester figure — half a year course, or the whole of a course that
   * only runs one semester.
   */
  semester: number | null;
  /** A block's single figure. */
  flat: number | null;
  ratePerHour: number;
  contactHours: number;
};

export function coursePrice(course: Course): Price {
  const hours = contactHours(course);
  const ratePerHour = RATE_PER_HOUR[course.rateTier];
  const total = hours * ratePerHour;
  const base = { total, ratePerHour, contactHours: hours };

  switch (course.enrolment) {
    case 'year':
      return { ...base, year: total, semester: total / 2, flat: null };
    case 'fall':
    case 'spring':
      return { ...base, year: null, semester: total, flat: null };
    case 'block':
      return { ...base, year: null, semester: null, flat: total };
  }
}

/** "$420". Whole dollars, because every figure the school publishes is one. */
export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/**
 * The full cost line, in the school's own form:
 * "$210/semester, $420/year ($10/hour)".
 */
export function priceLine(course: Course): string {
  const price = coursePrice(course);
  return `${priceLabel(course)} (${formatMoney(price.ratePerHour)}/hour)`;
}

/** The cost without the rate — "$210/semester, $420/year", "$90". */
export function priceLabel(course: Course): string {
  const price = coursePrice(course);
  if (price.flat !== null) return formatMoney(price.flat);
  const parts: string[] = [];
  if (price.semester !== null) parts.push(`${formatMoney(price.semester)}/semester`);
  if (price.year !== null) parts.push(`${formatMoney(price.year)}/year`);
  return parts.join(', ');
}

/**
 * The short form a card carries — "$420/yr", "$140/sem", "$90".
 *
 * One figure, because a card is scanned rather than read: the year price for a
 * year course, the semester price for a one-semester course, the flat price for
 * a block. The full line is on the class's own page.
 */
export function priceSummary(course: Course): string {
  const price = coursePrice(course);
  if (price.flat !== null) return formatMoney(price.flat);
  if (price.year !== null) return `${formatMoney(price.year)}/yr`;
  return `${formatMoney(price.semester ?? price.total)}/sem`;
}
