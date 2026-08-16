import type { Course } from '../courses/course.js';
import { retireCourse, unretireCourse } from '../courses/store.js';
import type { Db } from '../db/client.js';
import type { Person } from '../people/person.js';
import { retirePerson, unretirePerson } from '../people/store.js';
import type { Banner } from './banner.js';
import { isrBypassToken } from './isr-token.js';
import { describeRevalidation, revalidateAll, revalidationOrigin } from './revalidate.js';

/**
 * The Retire button, read off a posted form (#263, #266).
 *
 * Four screens press it — the Classes list and a class's own editor, the People
 * list and a person's own editor — and each pair works the same way: the list's
 * button carries the slug of the row it sits beside, and the editor's takes the
 * slug from the address. One reader for all four, so "what does Retire mean" is
 * answered once and no screen can answer it differently.
 *
 * It is deliberately its own field rather than a value of some shared `action`.
 * Both editors' Save posts the whole form to the same address; a form with no
 * `retire` field in it is that save, and this returns null so the screen falls
 * through to its parser. A shared field name would make the question "which of
 * the two did Jill press?" depend on what else happened to be in the body.
 *
 * What the two records do *not* share is the sentence afterwards, and that is
 * the whole of `RetirementSubject`: retiring a class takes it off three
 * surfaces and leaves its page up, where retiring a person takes them off the
 * staff page and unnames them on the classes they teach. Same press, different
 * consequence, and the office is told the one that happened.
 */

export type Retirement = {
  slug: string;
  /** True to retire, false to bring it back. */
  retire: boolean;
};

/**
 * The hidden field's value for each direction, so no screen spells it itself.
 *
 * Two words rather than a present-or-absent field, because the way back is a
 * press too and a missing field has to keep meaning "this is the Save form".
 */
export const RETIRE_VALUES = { retire: 'yes', unretire: 'no' } as const;

/**
 * What kind of record is being retired: its two writers and its own sentence.
 *
 * A value rather than a branch on a string, so adding a third retirable record
 * is a constant beside these two rather than an `if` in the middle of the press
 * — and so the two screens of a pair cannot pick different words for what just
 * happened.
 */
export type RetirementSubject<T> = {
  retire: (db: Db, slug: string, editorName: string) => Promise<T>;
  unretire: (db: Db, slug: string, editorName: string) => Promise<T>;
  /** What the office reads next. Named for the consequence, not for the button. */
  message: (record: T) => string;
};

/**
 * A class, and what a retired one still is.
 *
 * The sentence is named for what the office reads next rather than for the
 * button it pressed: a retired class is off three surfaces and still at its own
 * address, and that second half is the part nobody would guess.
 */
export const COURSE_RETIREMENT: RetirementSubject<Course> = {
  retire: retireCourse,
  unretire: unretireCourse,
  message: (course) =>
    course.retiredAt
      ? `${course.title} is retired — off the class lists and the timetable, still at its own address.`
      : `${course.title} is running again, on every list it left.`,
};

/**
 * A person, and the consequence the school actually asks about.
 *
 * The classes are in the sentence because they are the question retiring
 * somebody raises — "what happens to what they teach?" — and the answer is one
 * a screen should not make the office go and check. A class the school still
 * runs stops naming them; a retired one goes on saying who taught it
 * (`instructorOf`).
 */
export const PERSON_RETIREMENT: RetirementSubject<Person> = {
  retire: retirePerson,
  unretire: unretirePerson,
  message: (person) =>
    person.retiredAt
      ? `${person.name} is retired — off the staff page, and the classes the school still runs no longer name them.`
      : `${person.name} is back on the staff page, and named again on the classes they teach.`,
};

/**
 * The retirement a form asks for, or null when it is not asking for one.
 *
 * Null is also what an unreadable one gets — a `retire` with no slug beside it,
 * or a `retire` that says neither of the two words. Neither is a thing the
 * office can have done, and reading an unrecognised word as *either* direction
 * would mean a garbled post quietly moving a record: the lenient reading would
 * bring one back, which is the half nobody would notice.
 */
export function parseRetirement(form: FormData, slug?: string): Retirement | null {
  const asked = form.get('retire');
  if (asked !== RETIRE_VALUES.retire && asked !== RETIRE_VALUES.unretire) return null;

  const target = slug ?? form.get('slug');
  if (typeof target !== 'string' || !target.trim()) return null;

  return { slug: target.trim(), retire: asked === RETIRE_VALUES.retire };
}

/**
 * Apply it, and hand back the record as it now stands.
 *
 * The whole record rather than the two fields the banner reads: the editor
 * re-renders its form from this, and a narrower return would only send it back
 * to the store for the row it was just handed.
 */
export async function applyRetirement<T>(
  db: Db,
  subject: RetirementSubject<T>,
  retirement: Retirement,
  editorName: string,
): Promise<T> {
  return retirement.retire
    ? await subject.retire(db, retirement.slug, editorName)
    : await subject.unretire(db, retirement.slug, editorName);
}

/**
 * The whole press: read it, apply it, republish, and say what happened.
 *
 * Every screen that has one did this identically — apply, revalidate the site,
 * join the two sentences, and report a refusal in the same words — and four
 * copies of a sequence whose last step is "tell the office whether the live
 * site updated" is four places for that answer to be dropped or reworded. The
 * screens keep only what is theirs: where the slug comes from, and where the
 * banner goes.
 *
 * Null means the form was not asking for a retirement, which is how an editor's
 * Save falls through to its own parser.
 */
export async function pressRetirement<T>(options: {
  db: Db;
  subject: RetirementSubject<T>;
  form: FormData;
  /** Set on a record's own screen, where the address is the slug. */
  slug?: string;
  actorName: string;
  /** The screen's own URL — what the republish is aimed back at. */
  url: URL;
}): Promise<{ banner: Banner; record?: T } | null> {
  const asked = parseRetirement(options.form, options.slug);
  if (!asked) return null;

  try {
    const record = await applyRetirement(options.db, options.subject, asked, options.actorName);
    const result = await revalidateAll({
      origin: revalidationOrigin(options.url),
      bypassToken: isrBypassToken(),
    });
    return {
      record,
      banner: {
        ok: result.ok,
        message: `${options.subject.message(record)} ${describeRevalidation(result)}`,
      },
    };
  } catch (error) {
    /*
     * Reported verbatim, the way `saveErrorMessage` reports anything it does
     * not recognise. That helper is not borrowed here because its one special
     * case is a duplicate, and there is no such thing as retiring a record
     * twice — the only failure this write has is the row not being there.
     */
    const detail = error instanceof Error ? error.message : String(error);
    return { banner: { ok: false, message: `Nothing changed — ${detail}` } };
  }
}
