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

import { formatMoney, type RateCard } from '../money/settings.js';
import type { Course } from './course.js';
import { contactHours } from './schedule.js';

/**
 * The rate card is an **argument**, not a constant (#29 AC 1).
 *
 * The two rates are money settings the school controls, so nothing here may
 * hold a copy of them: a surface that has not read the settings cannot price a
 * course at all. That is what makes "no money figure is typed into page copy"
 * a property of the types rather than a thing a reviewer has to notice.
 * The seeded values live in `money/settings.ts`.
 */

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

export function coursePrice(course: Course, rates: RateCard): Price {
  const hours = contactHours(course);
  const ratePerHour = rates[course.rateTier];
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

/**
 * The full cost line, in the school's own form:
 * "$210/semester, $420/year ($10/hour)".
 */
export function priceLine(course: Course, rates: RateCard): string {
  const price = coursePrice(course, rates);
  return `${priceLabel(course, rates)} (${formatMoney(price.ratePerHour)}/hour)`;
}

/** The cost without the rate — "$210/semester, $420/year", "$90". */
export function priceLabel(course: Course, rates: RateCard): string {
  const price = coursePrice(course, rates);
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
export function priceSummary(course: Course, rates: RateCard): string {
  const price = coursePrice(course, rates);
  if (price.flat !== null) return formatMoney(price.flat);
  if (price.year !== null) return `${formatMoney(price.year)}/yr`;
  return `${formatMoney(price.semester ?? price.total)}/sem`;
}
