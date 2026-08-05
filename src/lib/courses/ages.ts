/**
 * Age is the primary axis (#22). Grades are approximations, and the school
 * says so itself — every published age line reads "10-14 (approximately 5th-8th
 * grades)", with the ages first and the grades hedged.
 *
 * So the default landing view groups by age band, and a band is a range of
 * ages rather than a grade. A course belongs to every band its own age range
 * touches: *Backyard Botany* is 5–10 and therefore appears under 4–6, 7–9 and
 * 10–13, because a nine-year-old's parent must find it under nine.
 *
 * The load-bearing rule is the other one. **Algebra 1 publishes no numeric age
 * range** — "8th Grade and older (or younger students who demonstrate
 * proficiency)" — because its real gate is a prerequisite, not an age. A filter
 * that needs a number would drop it from every band, which is the worst
 * possible answer: the course with the widest door becomes the one nobody is
 * shown. It appears in **every** band instead.
 */

import type { Course } from './course.js';

export type AgeBand = {
  /** The anchor a band heading carries, so a band can be linked to directly. */
  id: string;
  /** "Ages 4–6". En dash, and no grade equivalent — grades are per-course. */
  label: string;
  min: number;
  max: number;
};

/**
 * The bands, covering 4 to 18 with no gap.
 *
 * The edges are the school's own: *Letter of the Week* starts at 4, the high
 * school courses run to 18, and the two breaks in between fall where the
 * published ranges cluster — the early-elementary courses stop at 8 or 10, and
 * the middle-school ones start at 10.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  { id: 'ages-4-6', label: 'Ages 4–6', min: 4, max: 6 },
  { id: 'ages-7-9', label: 'Ages 7–9', min: 7, max: 9 },
  { id: 'ages-10-13', label: 'Ages 10–13', min: 10, max: 13 },
  { id: 'ages-14-18', label: 'Ages 14–18', min: 14, max: 18 },
] as const;

/** Whether the school publishes a numeric range for this course at all. */
export function hasNumericAges(course: Course): boolean {
  return course.ageMin !== null && course.ageMax !== null;
}

/**
 * Does this course belong in this band?
 *
 * A course with no numeric range belongs in all of them. See the note above:
 * this is Algebra 1, and it is not an edge case to be tidied away.
 */
export function courseInBand(course: Course, band: AgeBand): boolean {
  if (!hasNumericAges(course)) return true;
  return (course.ageMin as number) <= band.max && (course.ageMax as number) >= band.min;
}

/**
 * The age line as a surface prints it.
 *
 * "Ages 5-8" for a published range, and Algebra 1's own sentence — "8th Grade
 * and older (or younger students who demonstrate proficiency)" — untouched.
 * Prefixing that with "Ages" would produce "Ages 8th Grade and older", which is
 * the kind of small nonsense a parent reads as carelessness about everything
 * else on the page.
 */
export function ageLine(course: Course): string {
  return hasNumericAges(course) ? `Ages ${course.ageLabel}` : course.ageLabel;
}

/** Every band a course is shown under. */
export function bandsFor(course: Course): AgeBand[] {
  return AGE_BANDS.filter((band) => courseInBand(course, band));
}

/**
 * The courses in one band, youngest first.
 *
 * The ones with no numeric range sort last — not because they matter less, but
 * because they are the courses whose age line is a sentence rather than a
 * number, and a sentence reads better at the end of a list than in the middle
 * of one.
 */
export function coursesInBand(courses: readonly Course[], band: AgeBand): Course[] {
  return courses
    .filter((course) => courseInBand(course, band))
    .sort(
      (a, b) =>
        Number(hasNumericAges(b)) - Number(hasNumericAges(a)) ||
        (a.ageMin ?? 0) - (b.ageMin ?? 0) ||
        (a.ageMax ?? 0) - (b.ageMax ?? 0) ||
        a.title.localeCompare(b.title),
    );
}

/** Every band with its courses — the whole By Age surface, in one call. */
export function coursesByBand(courses: readonly Course[]): { band: AgeBand; courses: Course[] }[] {
  return AGE_BANDS.map((band) => ({ band, courses: coursesInBand(courses, band) }));
}
