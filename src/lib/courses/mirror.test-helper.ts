import { readFileSync } from 'node:fs';

/**
 * The reconciled capture of the live site, read straight off disk.
 *
 * The tests check the catalogue against **this**, not against a fixture written
 * beside them: `docs/mirror/data/courses.json` is what the school actually
 * publishes today, so a computed price that stops matching it is either a bug
 * here or a change there — and either way it is a thing a person must look at.
 *
 * Named `*.test-helper.ts` rather than `*.test.ts` so vitest does not try to
 * run it as a suite of its own.
 */

export type MirrorCourse = {
  title: string;
  time: string;
  ages: string;
  contactHours: number;
  days: string[];
  instructor: string;
  prerequisites: string;
  credit: string | null;
  materialsFee: number | null;
  assessmentFee: number | null;
  cost: { semester?: number; year?: number | null; flat?: number; rate: string };
};

const mirror = JSON.parse(
  readFileSync(new URL('../../../docs/mirror/data/courses.json', import.meta.url), 'utf8'),
) as { courses: MirrorCourse[]; rateCard: { standard: string; highSchoolCredit: string } };

export const MIRROR_COURSES = mirror.courses;
export const MIRROR_RATE_CARD = mirror.rateCard;

/**
 * Straight and curly apostrophes are the same apostrophe.
 *
 * The capture holds what Wix's editor produced; the catalogue is typed with
 * proper punctuation. Comparing titles through this is the difference between
 * a test that checks the school's data and one that checks a typographic
 * preference.
 */
export function sameText(value: string): string {
  return value.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

/** The mirror entry for a catalogue title, matched on the school's own title. */
export function mirrorFor(title: string): MirrorCourse {
  const found = MIRROR_COURSES.find((course) => sameText(course.title) === sameText(title));
  if (!found) throw new Error(`No course titled "${title}" in the mirror capture.`);
  return found;
}
