/**
 * The homepage's remaining hard-coded copy: the staff, the fee figures, the
 * verse and the H.O.P.E. row.
 *
 * Same standing as `timetable.ts` — every string is the school's own, carried
 * from `docs/mirror/` through the prototype, and a later slice moves the
 * editable ones into the database. Two exceptions are called out where they
 * appear, because they are *not* the school's words and a reader needs to know
 * which lines still need George and Jill's sign-off (#13).
 */

/** One instructor on the "who teaches" row. */
export type Instructor = {
  name: string;
  /** Their role, set as the gold eyebrow under the name. */
  role: string;
  /** One sentence of credentials, as the school states them. */
  credentials: string;
};

/**
 * Three of the nine, on the homepage.
 *
 * Portraits are deliberately absent: slot 4 needs photographs of real
 * consenting adults, which is Jill's to supply (#13), and a generated painting
 * of a person standing in for a named member of staff is the one substitution
 * that would be dishonest. The circles render as an empty tint until then.
 */
export const INSTRUCTORS: readonly Instructor[] = [
  {
    name: 'Jill Kilker',
    role: 'Head of School',
    credentials:
      'M.Ed. special education, Shippensburg. Homeschool evaluator in Pennsylvania.',
  },
  {
    name: 'Pastor George Jensen',
    role: 'Chaplain · Algebra 1',
    credentials: 'B.S. secondary mathematics, Millersville. M.Div., Winebrenner.',
  },
  {
    name: 'Mrs. Mandy Saint',
    role: 'Instructor · six classes',
    credentials: 'Letter of the Week, Kingdom Math, and early elementary science.',
  },
];

/** The whole of the fee schedule, which is the point of the section. */
export type Figure = { amount: string; note: string };

export const FIGURES: readonly Figure[] = [
  { amount: '$90–840', note: 'per class per year, paid directly to your instructor' },
  { amount: '$25', note: 'registration, once per student per year' },
  { amount: '$100', note: 'deposit per class, by cheque, holds the seat' },
];

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
 * The hero's sub-brand line.
 *
 * "Homeschool", not "Microschool", on the owner's instruction during the
 * prototype. The nineteen mirrored pages all say microschool, so this is a
 * positioning change the client has not confirmed in writing — flagged here
 * rather than buried in a template so it stays visible until it is.
 */
export const SUB_BRAND = 'A Christian Classical Hybrid Homeschool';

/** Also invented copy, taken deliberately — see `prototypes/README.md`. */
export const HERO_CAPS = 'Faith. Family. Learning. Together.';
