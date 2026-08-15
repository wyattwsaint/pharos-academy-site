/**
 * What a family is told it owes (#18 §11, #29 AC 4).
 *
 * The deposit-credited flag lives here rather than in a template because it is
 * arithmetic, not phrasing: on a three-class application it is the difference
 * between telling a family they owe $1,300 in tuition and $900, and a
 * difference of $400 is not a wording choice.
 *
 * Everything is computed from a `MoneySettings` handed in. There is no default
 * and no module-level rate: a surface that has not read the settings cannot
 * total anything, which is the shape that makes #29 AC 1 true by construction
 * rather than by review.
 */

import type { Course } from '../courses/course.js';
import { coursePrice } from '../courses/pricing.js';
import { amountOwedForPrices, type AmountOwed } from './live.js';
import type { MoneySettings } from './settings.js';

export type { AmountOwed };

/** One selection on an application: a course and how much of it is being bought. */
export type Selection = {
  course: Course;
  /**
   * Which of the course's prices applies. `year` for both semesters, `semester`
   * for one, `flat` for a block — the same three the price carries.
   */
  unit: 'year' | 'semester' | 'flat';
};

/**
 * The whole of what an application costs, in the figures a family asks for.
 *
 * All of it is owed to the school (ADR-0013) and all of it is paid the same
 * way (ADR-0017): one lump sum, upfront, through the church's Vanco page, with
 * a cheque as the fallback for the whole of it rather than for a part. So
 * `total` is not a summary a surface may skip past — it is the figure a family
 * types into the giving page, and the itemisation above it is what explains
 * that number.
 *
 * This resolves each selection against the rate card and hands the prices to
 * `live.ts`, which does the arithmetic. The split is the whole point: the
 * browser cannot have the rate card, but it can have the prices, and there is
 * one set of sums for both (ADR-0019).
 */
export function amountOwed(
  selections: readonly Selection[],
  settings: MoneySettings,
): AmountOwed {
  return amountOwedForPrices(
    selections.map((selection) => unitPrice(selection, settings)),
    settings,
  );
}

/** What one selection costs at these rates. */
export function unitPrice(selection: Selection, settings: MoneySettings): number {
  const price = coursePrice(selection.course, settings.rates);
  const amount = price[selection.unit];
  if (amount === null) {
    throw new Error(
      `${selection.course.title} is not sold by the ${selection.unit} — it is a ${selection.course.enrolment} course.`,
    );
  }
  return amount;
}

/**
 * The cheapest and dearest class in the catalogue, for the homepage's range.
 *
 * The whole cost of the course, which is the figure the "$90–840 per class per
 * year" line is quoting — not the semester instalment of it. Returns null for
 * an empty catalogue rather than `Infinity–-Infinity`.
 */
export function priceRange(
  courses: readonly Course[],
  settings: MoneySettings,
): { low: number; high: number } | null {
  if (courses.length === 0) return null;
  const totals = courses.map((course) => coursePrice(course, settings.rates).total);
  return { low: Math.min(...totals), high: Math.max(...totals) };
}
