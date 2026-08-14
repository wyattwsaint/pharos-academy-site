/**
 * The one line under a class's title in the week grid (#183).
 *
 * A function rather than three expressions inside the component, because what
 * it decides is a claim about the site and not about markup: which facts the
 * grid states, and in which order. `WeekSection.astro` renders what this
 * returns.
 *
 * Two of the facts are *looked up* — the semester and the price — and the third
 * is the timetable's own wording. That split is the whole design. The hand-kept
 * `TIMETABLE` says what meets when, because the school keeps the grid by hand;
 * the catalogue says what a class costs and how long it runs, because those can
 * change without anybody touching the grid. A semester typed here is a semester
 * that can disagree with the class's own page, which is the drift #22 removed
 * everywhere else.
 */

import { semesterLabel, type Course } from '../courses/course.js';
import { priceSummary } from '../courses/pricing.js';
import type { RateCard } from '../money/settings.js';
import type { ClassEntry } from './timetable.js';

/**
 * "Ages 5–10 · fall · $140/sem".
 *
 * The semester sits between the ages and the price rather than after either,
 * because a parent scanning the grid is reading one question — is this class
 * for my child, when does it run, what does it cost — in that order.
 *
 * A cell with no slug has no course to read and gets neither fact: the two the
 * school quotes by length already say "12 weeks" and "rotating" in `meta`, and
 * are complete as they are.
 */
export function cellMeta(entry: ClassEntry, course: Course | undefined, rates: RateCard): string {
  if (!course) return entry.meta;
  const semester = semesterLabel(course);
  return [entry.meta, ...(semester ? [semester] : []), priceSummary(course, rates)].join(' · ');
}
