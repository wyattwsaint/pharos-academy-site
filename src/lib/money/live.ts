/**
 * What a family owes, from prices already resolved (ADR-0019).
 *
 * The one implementation of the arithmetic. `owed.ts` resolves a selection
 * against the rate card and hands the prices here; the Apply page's browser
 * script reads them off the checkboxes and hands them here too. Two
 * implementations of "what a family owes" is the failure ADR-0019 is most
 * concerned with, so there is one, and it is tested once.
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
 * A subset rather than the whole of `MoneySettings` because this is also the
 * shape the page hands the browser as `data-money`: the refund terms and the
 * notification addresses are not the browser's business, and naming the three
 * here is what keeps them out of it.
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
 * All of it is owed to the school (ADR-0013) and all of it is paid the same way
 * (ADR-0017): one lump sum, upfront. So `total` is not a summary a surface may
 * skip past — it is the figure a family types into the giving page, and the
 * itemisation above it is what explains that number. It never double-counts a
 * credited deposit, which is the arithmetic the flag actually changes.
 */
export function amountOwedFor(
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
