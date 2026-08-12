/**
 * The homepage's remaining hard-coded copy: the fee figures, the verse and the
 * H.O.P.E. row.
 *
 * Same standing as `timetable.ts` — every string is the school's own, carried
 * from `docs/mirror/` through the prototype, and a later slice moves the
 * editable ones into the database. Two exceptions are called out where they
 * appear, because they are *not* the school's words and a reader needs to know
 * which lines still need George and Jill's sign-off (#13).
 *
 * The one thing that is *not* copy is the fee figures. They are computed from
 * the money settings (#29) — see `costFigures`.
 */

import type { Course } from '../courses/course.js';
import { priceRange } from '../money/owed.js';
import { formatMoney, type MoneySettings } from '../money/settings.js';

/*
 * The homepage's three instructor cards — name, role and a line of credentials
 * each — used to live here. #142 replaced that band with one invitation and a
 * link to the staff page, so the copy is gone rather than left unused: the
 * people are the staff page's, read from the one list (ADR-0004).
 */

/** The whole of the fee schedule, which is the point of the section. */
export type Figure = { amount: string; note: string };

/**
 * The three figures the costs band prints, computed from the school's settings
 * (#29 AC 1).
 *
 * A function rather than a constant, and that is the whole change: the three
 * amounts used to be typed strings, so raising the registration fee in the
 * admin left the homepage quoting the old one to every parent who scrolled past
 * it. The notes are still the school's own wording — what is derived is the
 * money, not the sentence around it.
 *
 * The range is the cheapest and dearest whole course in the catalogue, written
 * the way the school writes it: one dollar sign, then the two numbers.
 */
export function costFigures(
  courses: readonly Course[],
  settings: MoneySettings,
): Figure[] {
  const range = priceRange(courses, settings);
  return [
    // An empty catalogue has no range, and no figure is better than "$0–0".
    ...(range
      ? [
          {
            amount: `${formatMoney(range.low)}–${range.high}`,
            note: 'Varies by course selection',
          },
        ]
      : []),
    {
      amount: formatMoney(settings.registrationFee),
      note: 'Annual registration',
    },
    {
      amount: formatMoney(settings.classDeposit),
      note: 'Deposit for each class',
    },
  ];
}

/** The verse the faith band is built around. */
export const VERSE = {
  text:
    'Honor Christ the Lord as holy, always being prepared to make a defense for the hope ' +
    'that is within.',
  citation: '1 Peter 3:15',
};

/** One letter of H.O.P.E. and the card behind it. */
export type HopeLetter = {
  letter: string;
  word: string;
  /** The card image in `public/imagery/`. */
  image: string;
  /**
   * NOT the school's words. Nothing in `docs/mirror/` expands the acronym past
   * "Helping Our Parents Educate"; these four sentences are the prototype's
   * drafts, standing in so the row can be seen working, and #13 asks George and
   * Jill to approve or replace them.
   */
  gloss: string;
};

export const HOPE: readonly HopeLetter[] = [
  {
    letter: 'H',
    word: 'Helping',
    image: '/imagery/hope-h.webp',
    gloss: 'We come alongside families to support and encourage.',
  },
  {
    letter: 'O',
    word: 'Our',
    image: '/imagery/hope-o.webp',
    gloss: 'A community of families learning and growing together.',
  },
  {
    letter: 'P',
    word: 'Parents',
    image: '/imagery/hope-p.webp',
    gloss: 'Parents are the primary educators. We equip and empower you.',
  },
  {
    letter: 'E',
    word: 'Educate',
    image: '/imagery/hope-e.webp',
    gloss: 'Cultivating truth, goodness, and beauty in every subject.',
  },
];

/**
 * The hero's sub-brand line used to be a second copy of the school description,
 * and read "Homeschool" while every other surface said microschool. It is
 * `SCHOOL_DESCRIPTION` in `site.ts` now (#137) and the hero reads it directly —
 * a second name for one string is what let the two disagree.
 */

/** Invented copy, taken deliberately — see `prototypes/README.md`. */
export const HERO_CAPS = 'Faith. Family. Learning. Together.';
