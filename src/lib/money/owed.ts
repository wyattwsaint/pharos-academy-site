/**
 * What a family is told it owes (#18 §11, #29 AC 4).
 *
 * The deposit-credited flag lives here rather than in a template because it is
 * arithmetic, not phrasing: on a three-class application it is the difference
 * between telling a family they owe their instructors $1,300 and $900, and a
 * difference of $400 is not a wording choice.
 *
 * Everything is computed from a `MoneySettings` handed in. There is no default
 * and no module-level rate: a surface that has not read the settings cannot
 * total anything, which is the shape that makes #29 AC 1 true by construction
 * rather than by review.
 */

import type { Course } from '../courses/course.js';
import { coursePrice } from '../courses/pricing.js';
import type { MoneySettings } from './settings.js';

/** One selection on an application: a course and how much of it is being bought. */
export type Selection = {
  course: Course;
  /**
   * Which of the course's prices applies. `year` for both semesters, `semester`
   * for one, `flat` for a block — the same three the price carries.
   */
  unit: 'year' | 'semester' | 'flat';
};

export type AmountOwed = {
  /** The registration fee, once per student per year however many classes. */
  registration: number;
  /** The deposits — one per class, posted by cheque, holding the seats. */
  deposits: number;
  /** What the instructors are owed before any deposit is taken off. */
  tuition: number;
  /** What the deposits take off the tuition. Zero when they are not credited. */
  creditedAgainstTuition: number;
  /** Registration plus deposits: the cheque the family posts now. */
  dueNow: number;
  /** Tuition less any credit: what the family still owes its instructors. */
  dueToInstructors: number;
  /** Everything the family pays across the year, counted once. */
  total: number;
};

/**
 * The whole of what an application costs, in the four figures a family asks for.
 *
 * `dueNow` and `dueToInstructors` are kept apart because they are paid to
 * different people — the school takes the registration and the deposits by
 * cheque, and tuition stays instructor-to-parent as the handbook specifies
 * (#18 §12). `total` is the sum of those two and never double-counts a credited
 * deposit, which is the arithmetic the flag actually changes.
 */
export function amountOwed(
  selections: readonly Selection[],
  settings: MoneySettings,
): AmountOwed {
  const tuition = selections.reduce((sum, selection) => sum + unitPrice(selection, settings), 0);
  const deposits = settings.classDeposit * selections.length;

  // Never more than the tuition. A family selecting a $90 block does not end up
  // owing its instructor minus ten dollars.
  const creditedAgainstTuition = settings.depositCreditedAgainstTuition
    ? Math.min(deposits, tuition)
    : 0;

  const registration = selections.length > 0 ? settings.registrationFee : 0;
  const dueNow = registration + deposits;
  const dueToInstructors = tuition - creditedAgainstTuition;

  return {
    registration,
    deposits,
    tuition,
    creditedAgainstTuition,
    dueNow,
    dueToInstructors,
    total: dueNow + dueToInstructors,
  };
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
