/**
 * What a family owes, from prices already resolved (ADR-0019).
 *
 * The one implementation of the arithmetic. `owed.ts` resolves a selection
 * against the rate card and hands the prices here; the Apply page's browser
 * script will read them off the checkboxes and hand them here too. Two
 * implementations of "what a family owes" is the failure ADR-0019 is most
 * concerned with, so there is one, and both sides call it.
 *
 * This module is a **leaf**: it imports nothing but types, which are erased
 * before a bundler sees them. That is what lets the browser have the totals
 * without the catalogue, the timetable, the rate card or the Statement of Faith
 * coming with them. A value import added here puts all of that back on the
 * wire.
 */

import type { MoneySettings } from './settings.js';

/**
 * The three settings the arithmetic needs, and no others.
 *
 * A subset rather than the whole of `MoneySettings` because the refund terms
 * and the notification addresses have nothing to do with adding up what a
 * family owes, and a caller holding only these three can still total.
 */
export type LiveMoneySettings = Pick<
  MoneySettings,
  'registrationFee' | 'classDeposit' | 'depositCreditedAgainstTuition'
>;

export type AmountOwed = {
  /** The registration fee, once per student per year however many classes. */
  registration: number;
  /** The deposits — one per class, holding the seats. */
  deposits: number;
  /** What the classes cost before any deposit is taken off. */
  tuition: number;
  /** What the deposits take off the tuition. Zero when they are not credited. */
  creditedAgainstTuition: number;
  /** Tuition less any credit: the tuition the family actually owes. */
  tuitionDue: number;
  /**
   * The deposits and the tuition due together — what the classes cost.
   *
   * Here rather than added up by whoever needs it, because two of them do: the
   * class-fee payment line (#303) and the browser writing the same figure onto
   * the same screen (ADR-0019). It is the one Vanco campaign the school's class
   * money is paid into, and the deposits come off the tuition inside it, which
   * is the relationship the copy spends a paragraph on.
   */
  classes: number;
  /** Everything the family pays across the year, counted once. */
  total: number;
};

/**
 * The whole of what a set of priced choices costs, in the figures a family
 * asks for.
 *
 * One price per thing the family has ticked: the deposit is per class, so the
 * count of the list is the count of the deposits, and a page passing a single
 * summed number would get that wrong.
 *
 * `total` never double-counts a credited deposit, which is the arithmetic the
 * deposit flag actually changes. What that figure means to a family, and why it
 * is one lump sum rather than an instalment, is `amountOwed`'s comment in
 * `owed.ts`.
 */
export function amountOwedForPrices(
  prices: readonly number[],
  settings: LiveMoneySettings,
): AmountOwed {
  const tuition = prices.reduce((sum, price) => sum + price, 0);
  const deposits = settings.classDeposit * prices.length;

  // Never more than the tuition. A family selecting a $90 block does not end up
  // owing minus ten dollars in tuition.
  const creditedAgainstTuition = settings.depositCreditedAgainstTuition
    ? Math.min(deposits, tuition)
    : 0;

  const registration = prices.length > 0 ? settings.registrationFee : 0;
  const tuitionDue = tuition - creditedAgainstTuition;

  return {
    registration,
    deposits,
    tuition,
    creditedAgainstTuition,
    tuitionDue,
    classes: deposits + tuitionDue,
    total: registration + deposits + tuitionDue,
  };
}

/**
 * Several children's figures as one family's.
 *
 * Added child by child rather than over one pooled list of prices, because the
 * registration fee is once per *student*: a family enrolling three children
 * pays it three times, and one flat total would charge it once and understate
 * the cheque. The deposit credit is per child for the same reason — one child's
 * $90 block cannot be paid for by a sibling's spare deposit.
 *
 * Here rather than in `application.ts` because the browser sums the same way
 * over the same rows (ADR-0019), and two implementations of a family's total is
 * the failure this leaf exists to prevent.
 */
export function sumOwed(parts: readonly AmountOwed[]): AmountOwed {
  const add = (pick: (owed: AmountOwed) => number): number =>
    parts.reduce((sum, owed) => sum + pick(owed), 0);

  return {
    registration: add((owed) => owed.registration),
    deposits: add((owed) => owed.deposits),
    tuition: add((owed) => owed.tuition),
    creditedAgainstTuition: add((owed) => owed.creditedAgainstTuition),
    tuitionDue: add((owed) => owed.tuitionDue),
    classes: add((owed) => owed.classes),
    total: add((owed) => owed.total),
  };
}
