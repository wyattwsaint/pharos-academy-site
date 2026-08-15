import type { Course } from '../courses/course.js';
import { retireCourse, unretireCourse } from '../courses/store.js';
import type { Db } from '../db/client.js';
import type { Banner } from './banner.js';
import { isrBypassToken } from './isr-token.js';
import { describeRevalidation, revalidateAll, revalidationOrigin } from './revalidate.js';

/**
 * The Retire button, read off a posted form (#263).
 *
 * Two screens press it — the Classes list, where the button carries the slug of
 * the row it sits beside, and the course's own editor, where the slug is the
 * address. One reader for both, so "what does Retire mean" is answered once and
 * the two screens cannot answer it differently.
 *
 * It is deliberately its own field rather than a value of some shared `action`.
 * The editor's Save posts the whole course form to the same address; a form
 * with no `retire` field in it is that save, and this returns null so the
 * screen falls through to the parser. A shared field name would make the
 * question "which of the two did Jill press?" depend on what else happened to
 * be in the body.
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
 * The retirement a form asks for, or null when it is not asking for one.
 *
 * Null is also what an unreadable one gets — a `retire` with no slug beside it,
 * or a `retire` that says neither of the two words. Neither is a thing the
 * office can have done, and reading an unrecognised word as *either* direction
 * would mean a garbled post quietly moving a class: the lenient reading would
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
 * Apply it, and hand back the class as it now stands.
 *
 * The whole course rather than the two fields the banner reads: the editor
 * re-renders its form from this, and a narrower return would only send it back
 * to the store for the row it was just handed.
 */
export async function applyRetirement(
  db: Db,
  retirement: Retirement,
  editorName: string,
): Promise<Course> {
  return retirement.retire
    ? await retireCourse(db, retirement.slug, editorName)
    : await unretireCourse(db, retirement.slug, editorName);
}

/**
 * What the screen says it did, before the republish answer is added to it.
 *
 * Named for what the office reads next rather than for the button it pressed:
 * a retired class is off three surfaces and still at its own address, and that
 * second half is the part nobody would guess.
 */
export function retirementMessage(course: Course): string {
  return course.retiredAt
    ? `${course.title} is retired — off the class lists and the timetable, still at its own address.`
    : `${course.title} is running again, on every list it left.`;
}

/**
 * The whole press: read it, apply it, republish, and say what happened.
 *
 * Both screens did this identically — apply, revalidate the site, join the two
 * sentences, and report a refusal in the same words — and two copies of a
 * sequence whose last step is "tell the office whether the live site updated"
 * is two places for that answer to be dropped or reworded. The screens keep
 * only what is theirs: where the slug comes from, and where the banner goes.
 *
 * Null means the form was not asking for a retirement, which is how the course
 * editor's Save falls through to its own parser.
 */
export async function pressRetirement(options: {
  db: Db;
  form: FormData;
  /** Set on a class's own screen, where the address is the slug. */
  slug?: string;
  actorName: string;
  /** The screen's own URL — what the republish is aimed back at. */
  url: URL;
}): Promise<{ banner: Banner; course?: Course } | null> {
  const asked = parseRetirement(options.form, options.slug);
  if (!asked) return null;

  try {
    const course = await applyRetirement(options.db, asked, options.actorName);
    const result = await revalidateAll({
      origin: revalidationOrigin(options.url),
      bypassToken: isrBypassToken(),
    });
    return {
      course,
      banner: {
        ok: result.ok,
        message: `${retirementMessage(course)} ${describeRevalidation(result)}`,
      },
    };
  } catch (error) {
    /*
     * Reported verbatim, the way `saveErrorMessage` reports anything it does
     * not recognise. That helper is not borrowed here because its one special
     * case is a duplicate, and there is no such thing as retiring a class
     * twice — the only failure this write has is the row not being there.
     */
    const detail = error instanceof Error ? error.message : String(error);
    return { banner: { ok: false, message: `Nothing changed — ${detail}` } };
  }
}
