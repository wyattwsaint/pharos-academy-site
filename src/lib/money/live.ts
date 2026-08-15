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
    total: registration + deposits + tuitionDue,
  };
}
