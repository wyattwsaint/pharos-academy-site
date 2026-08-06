/**
 * A person at the school — the whole of it (#26).
 *
 * **One list, not two.** Leadership and instructors are the same kind of thing
 * and live in the same table: a name, a role, an optional bio and an optional
 * photograph. Pastor George Jensen is the reason. He is the school's chaplain
 * *and* teaches Algebra 1, so a separate `instructors` table would hold a
 * second copy of him that drifts the first time his name is corrected in one
 * place and not the other. Eight instructors teach the nineteen courses and one
 * of them teaches eight; a second list would drift immediately.
 *
 * Being an instructor is therefore **not a column**. It is a fact about the
 * catalogue: a person is an instructor exactly when some course names them
 * (`instructorsAmong`). Nothing has to be kept in sync because there is nothing
 * to keep in sync.
 *
 * Being leadership *is* a column — `leadershipRank` — because it carries an
 * order the staff page renders in, and that order is a decision the school
 * makes rather than a fact derivable from anything else.
 */

import type { Course } from '../courses/course.js';

export type Person = {
  /** The key courses reference, and the anchor on the staff page. */
  slug: string;
  /** The name as the school writes it, honorific and all — "Mrs. Mandy Saint". */
  name: string;
  /** "Head of School", "Instructor". Always present; a person has a role. */
  role: string;
  /**
   * The school's own paragraph about them, or nothing.
   *
   * **Optional by design.** Three of the ten have one today because those are
   * the three the live site publishes. An empty bio is a valid state, not a gap
   * to fill with filler, and the staff page renders a person without one
   * correctly rather than apologising for it.
   */
  bio: string | null;
  /**
   * A photograph in `public/`, or nothing — and today it is nothing.
   *
   * Slot 4 (#13) is blocked on the client: it must be photographs of real
   * consenting adults. No generated image of a person goes here and no
   * placeholder face substitutes for one, so the column exists, is null for
   * everybody, and the page ships with the slot honest rather than filled.
   */
  photo: string | null;
  /** Position on the staff page, low first. Null means not leadership. */
  leadershipRank: number | null;
  /** The stamp (CONTEXT.md): overwritten by each save, never appended. */
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** A person as the seed writes them — everything but the stamp, which is a save. */
export type SeedPerson = Omit<Person, 'lastEditedBy' | 'lastEditedAt'>;

/** What an instructor's role reads as when the school has given them no other. */
export const INSTRUCTOR_ROLE = 'Instructor';

/**
 * The school's people, as published today.
 *
 * The three with bios are `docs/mirror/pages/team_4.txt` — the live staff page —
 * carried unedited. The eight instructors are the distinct names on
 * `docs/mirror/data/courses.json`, which is where the site already prints them;
 * this ticket does not invent a person, a role or a sentence about anybody.
 *
 * George Jensen appears **once**, with his leadership role, and teaches
 * Algebra 1 through `Course.instructorSlug`. That single row is the whole
 * argument for this module.
 */
export const PEOPLE: readonly SeedPerson[] = [
  {
    slug: 'jill-kilker',
    name: 'Jill Kilker',
    role: 'Head of School',
    bio:
      'Mrs. Kilker earned her bachelor’s degree in elementary education from Bloomsburg ' +
      'University of Pennsylvania and her master’s degree in special education from ' +
      'Shippensburg University of Pennsylvania. She taught in public schools, worked at a ' +
      'private school, and homeschooled her children. Mrs. Kilker is also a homeschool ' +
      'evaluator and consultant in Pennsylvania. She serves as Director of Children and Youth ' +
      'Ministries at Enola First Church of God in Enola, PA. She has a passion for education ' +
      'and brings a wealth of knowledge and experience to Pharos Academy. She and her husband ' +
      'Joe are the parents of adult children, Elaina and Luke.',
    photo: null,
    leadershipRank: 1,
  },
  {
    slug: 'george-jensen',
    name: 'Pastor George Jensen',
    role: 'Chaplain & Spiritual Advisor',
    bio:
      'Pastor Jensen earned his bachelors in secondary education mathematics from Millersville ' +
      'University and received an M.Div. from Winebrenner Theological Seminary. He is an ' +
      'ordained pastor in the Eastern Regional Conference of the Churches of God. He taught in ' +
      'a Christian school and served as a developmental adjunct instructor at Harrisburg ' +
      'Community College. He currently serves as Lead Pastor at Enola First Church of God. He ' +
      'brings educational and ministry experience to Pharos Academy. He and his wife, Judi are ' +
      'the parents of adult children, Shana, Tiffany and Christine.',
    photo: null,
    leadershipRank: 2,
  },
  {
    slug: 'kathy-liddick',
    name: 'Kathy Liddick',
    role: 'Director of Business Administration',
    bio:
      'Kathy Liddick earned her bachelor’s degree in Accounting from Messiah College ' +
      '(University). She worked for Pennsylvania Housing Finance Agency for 35 years as well ' +
      'as serving as the Administrative Assistant and Treasurer for Enola First Church of God ' +
      'for many years. She currently serves at the Leader of the Navigator’s Team ' +
      '(Discipleship) at the church as well as volunteering for various other areas of the ' +
      'church and is a member of the Praise Team where she plays Tenor Sax. She also ' +
      'volunteers for the East Pennsboro Twp Meals on Wheels program. She loves accounting ' +
      'work as well as many other administrative type activities. She is a mother of two adult ' +
      'children, Joshua Sr. and Tara as well as a Nana to 4 grandchildren and 2 great ' +
      'grandchildren.',
    photo: null,
    leadershipRank: 3,
  },
  // The eight instructors. No bio, no photograph and no invented role: the
  // school has published none of the three, and the staff page says so by
  // showing their name and what they teach rather than a paragraph of filler.
  { slug: 'angela-fecteau', name: 'Mrs. Angela Fecteau', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'chelsea-miller', name: 'Mrs. Chelsea Miller', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'elizabeth-hayes', name: 'Mrs. Elizabeth Hayes', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'lanette-johnson', name: 'Mrs. Lanette Johnson', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'mandy-saint', name: 'Mrs. Mandy Saint', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'rachel-holderman', name: 'Mrs. Rachel Holderman', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
  { slug: 'robyn-lach', name: 'Ms. Robyn Lach', role: INSTRUCTOR_ROLE, bio: null, photo: null, leadershipRank: null },
] as const;

/**
 * The seed's name for a slug.
 *
 * Only the migration uses this — statement 0002 writes the course's instructor
 * as a name because that is the column it created, and rewriting history is not
 * how migrations work. Everything at runtime reads names out of the `people`
 * table instead, where Jill's edits actually are.
 */
export function seededName(slug: string): string {
  const person = PEOPLE.find((candidate) => candidate.slug === slug);
  if (!person) throw new Error(`No seeded person with the slug "${slug}".`);
  return person.name;
}

/** People by slug — the lookup every surface that prints a name goes through. */
export function bySlug(people: readonly Person[]): ReadonlyMap<string, Person> {
  return new Map(people.map((person) => [person.slug, person]));
}

/**
 * The person a course is taught by.
 *
 * Throws rather than printing an empty instructor line. The column is a foreign
 * key, so a course can only name somebody who exists; if this ever fires it
 * means the page was handed a partial list of people, and a class page quietly
 * missing its instructor is worse than a loud failure.
 */
export function instructorOf(directory: ReadonlyMap<string, Person>, course: Course): Person {
  const person = directory.get(course.instructorSlug);
  if (!person) throw new Error(`No person with the slug "${course.instructorSlug}".`);
  return person;
}

/** Leadership, in the order the school put them in. */
export function leadershipAmong(people: readonly Person[]): Person[] {
  return people
    .filter((person) => person.leadershipRank !== null)
    .sort((a, b) => (a.leadershipRank ?? 0) - (b.leadershipRank ?? 0));
}

/**
 * The people who actually teach something, with what they teach.
 *
 * Derived from the catalogue rather than stored, which is what makes "no second
 * instructor entity to keep in sync" true instead of aspirational: assign a
 * course to somebody and they are an instructor, on every surface, at once.
 */
export function instructorsAmong(
  people: readonly Person[],
  courses: readonly Course[],
): { person: Person; courses: Course[] }[] {
  return people
    .map((person) => ({
      person,
      courses: courses.filter((course) => course.instructorSlug === person.slug),
    }))
    .filter((entry) => entry.courses.length > 0)
    .sort((a, b) => a.person.name.localeCompare(b.person.name));
}

/**
 * A slug for a name Jill has just typed, for a person the school has hired.
 *
 * Stable, lowercase, and stripped of the honorific — "Mrs. Mandy Saint" is
 * `mandy-saint`, because the honorific is a form of address rather than part of
 * the address of a page, and "Mrs." changing to "Dr." should not change a URL.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(mr|mrs|ms|miss|dr|pastor|rev|reverend)\.?\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
