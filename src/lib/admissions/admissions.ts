/**
 * What the Admissions page says, derived (#29 AC 6).
 *
 * The page is one long piece of honest prose, and prose is exactly where a fee
 * gets retyped and then quietly goes stale. So none of the figures, dates,
 * ages or mornings on it are written into the template: they come through the
 * four functions here, from the money settings and the catalogue.
 *
 * The page exists because the application asks a stranger for a great deal —
 * two cheques, four signatures and a year of their child's mornings — and one
 * page of plain explanation before that is the cheapest possible mitigation of
 * the worst moment on this site.
 */

import type { Course } from '../courses/course.js';
import { activeTracks } from '../courses/schedule.js';
import { formatMoney, INSTALMENT_COUNT, type MoneySettings } from '../money/settings.js';

/**
 * Where "Start your application" goes.
 *
 * One constant, because it is going to move exactly once. The application flow
 * is its own ticket (#18 §11) and its entry point is warm and pre-filled from
 * the inquiry — so until it exists this points at the inquiry form, which is
 * genuinely where applying starts today rather than a placeholder. When the
 * flow lands, this one value becomes `/admissions/apply` and nothing else on
 * the page changes.
 */
export const APPLICATION_HREF = '/#inquiry';

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

/** How tuition is paid, and on which four dates. Read from the settings. */
export function instalmentSentence(settings: MoneySettings): string {
  const dates = settings.instalmentDates.map(longDate);
  return `Tuition is paid to your instructor in ${numberWord(INSTALMENT_COUNT)} quarterly payments, due ${list(dates)}.`;
}

/**
 * The ages the catalogue is actually written for — "4 to 18".
 *
 * Null when no class publishes a numeric range, in which case the page simply
 * does not make the claim. A course gated on proficiency rather than age
 * (Algebra 1) contributes nothing here, which is correct: its own page states
 * the prerequisite in the school's words.
 */
export function agesLabel(courses: readonly Course[]): string | null {
  const lows = courses.map((course) => course.ageMin).filter((age): age is number => age !== null);
  const highs = courses.map((course) => course.ageMax).filter((age): age is number => age !== null);
  if (lows.length === 0 || highs.length === 0) return null;
  return `${Math.min(...lows)} to ${Math.max(...highs)}`;
}

/** The mornings classes run on — "Monday, Wednesday and Thursday". */
export function morningsLabel(courses: readonly Course[]): string {
  return list(activeTracks(courses));
}

/** "a, b and c" — the school's own serial form, with no Oxford comma. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** `2026-08-24` as "24 August 2026", the form the rest of the site prints. */
function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The instalment count in words, because the sentence reads it aloud. */
function numberWord(count: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][count] ?? String(count);
}
