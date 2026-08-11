/**
 * What the Admissions page says, derived (#29 AC 6).
 *
 * The page is one long piece of honest prose, and prose is exactly where a fee
 * gets retyped and then quietly goes stale. So none of the figures on it are
 * written into the template: they come through the two exports here, from the
 * money settings.
 *
 * This file used to derive ages, mornings and the four quarterly payment dates
 * as well. The client's rewrite dropped the ages and mornings claims (#107) and
 * took the dates off the page entirely rather than moving them (#108), so the
 * helpers behind all three are gone rather than left dangling — the admin still
 * owns the dates, and nothing prints them.
 *
 * The page exists because the application asks a stranger for a great deal —
 * two cheques, four signatures and a year of their child's mornings — and one
 * page of plain explanation before that is the cheapest possible mitigation of
 * the worst moment on this site.
 */

import { APPLICATION_PATH } from '../application/application.js';
import { formatMoney, type MoneySettings } from '../money/settings.js';

/**
 * Where "Start your application" goes.
 *
 * One constant, because it moved exactly once. It pointed at the inquiry form
 * while the application flow was unbuilt — genuinely where applying started,
 * rather than a placeholder — and now that the flow has landed (#31) it is the
 * flow's own address. Nothing else on the page changed with it, which is what
 * the constant was for.
 *
 * The bare path, with no `?inquiry=` on it: this button is reached by a family
 * browsing the site rather than by one following a link Jill sent, so there is
 * no inquiry to pre-fill from and the flow opens on a clean slate.
 */
export const APPLICATION_HREF: string = APPLICATION_PATH;

/** One thing a family pays, as the page lists it. */
export type AdmissionCost = {
  amount: string;
  /** The name of the charge — "Registration fee". */
  what: string;
  /** The sentence under it: when it is paid, to whom, and what it does. */
  detail: string;
};

/**
 * The three amounts a family hands over that are *not* tuition.
 *
 * Tuition is deliberately not in this list. It is per class and varies by
 * class, so quoting a single figure for it here would be a number that is wrong
 * for every family — the class pages carry the real one, computed from the same
 * rates.
 *
 * The deposit's sentence flips with `depositCreditedAgainstTuition`, because
 * that flag is arithmetic and not phrasing: on three classes it is the
 * difference between owing your instructors $1,300 and $900, and a family reads
 * this sentence to work out which.
 */
export function admissionCosts(settings: MoneySettings): AdmissionCost[] {
  const deposit = formatMoney(settings.classDeposit);
  return [
    {
      amount: formatMoney(settings.registrationFee),
      what: 'Registration fee',
      detail:
        'Once per student per year, by cheque with your application. It is not refundable, ' +
        'and it is what reserves your place in the intake.',
    },
    {
      amount: deposit,
      what: 'Deposit, per class',
      detail:
        'By cheque with your application, one for each class. It holds the seat, and it ' +
        (settings.depositCreditedAgainstTuition
          ? 'comes off what you owe your instructor for that class.'
          : 'is on top of what you owe your instructor for that class.'),
    },
    {
      amount: formatMoney(settings.lateFee),
      what: 'Late fee, per class',
      detail:
        'Only if a quarterly payment is missed. Nobody is charged this for asking for more ' +
        'time — talk to us first.',
    },
  ];
}
