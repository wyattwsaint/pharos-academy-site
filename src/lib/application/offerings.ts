/**
 * What the family's picker offers, and what it warns about (#31).
 *
 * An **offering** is a course paired with an enrolment unit (CONTEXT.md): *Latin
 * I, Fall* and *Latin I, Year* are two different purchases of one course, and
 * the application operates on offerings rather than on courses because the unit
 * is the thing being bought. The units come from `course.enrolmentUnits`, ticked
 * in the editor (#24) — never inferred from the course's shape, so the picker
 * cannot guess a semester the school does not sell into existence.
 *
 * The clash rule is the sharp part. A clash needs a shared **day track**, a real
 * **time overlap**, and a **term overlap** — all three. Measuring the third in
 * semester names ("both are year courses") is the naive check that clears
 * Algebra 1 against Beginner Latin (5-6) the moment somebody moves Latin to one
 * semester, and sells the family a $280 clash: Algebra 1 runs the whole
 * year, so it still meets on every Monday the fall Latin does. So term overlap
 * is measured in **real meeting dates**, by the same function the course editor
 * uses (`meetingDatesOn`), and the two surfaces cannot disagree.
 *
 * The third state survives on purpose. A block whose start date the school has
 * not set has no dates to compare, so the honest answer is **possible clash**
 * rather than an invented clash or a hidden one.
 *
 * Nothing here reports oversubscription. The Wednesday 10:40 slot carries five
 * electives by design; five families in one room is the school's arrangement,
 * and only two of them in *one family's* selection is a fact worth a warning.
 */

import { americanDateLabel, type SchoolYear } from '../calendar/year.js';
import type { Course, EnrolmentUnit } from '../courses/course.js';
import { meetingDatesOn } from '../courses/slots.js';
import { DAY_TRACKS, minutesOfDay, type DayTrack } from '../courses/schedule.js';

/** A course and how much of it is being bought — the thing a family selects. */
export type Offering = {
  course: Course;
  unit: EnrolmentUnit;
};

/**
 * How an offering travels through a form: `<slug>:<unit>`.
 *
 * A single value per checkbox rather than a pair of fields, because the pair is
 * one choice and a form that posts them separately can post half of one.
 */
export function offeringKey(offering: Offering): string {
  return `${offering.course.slug}:${offering.unit}`;
}

/**
 * Every offering in the catalogue, in catalogue order, each course's units in
 * the canonical order rather than whatever order they were ticked in.
 *
 * A course with no ticked units contributes nothing — it is in the catalogue and
 * is not on sale, which is a real state the picker has to be able to show as
 * "not currently open" rather than as a missing row.
 */
export function offeringsOf(courses: readonly Course[]): Offering[] {
  return courses.flatMap((course) =>
    UNIT_ORDER.filter((unit) => course.enrolmentUnits.includes(unit)).map((unit) => ({
      course,
      unit,
    })),
  );
}

/** Year, then the two semesters in calendar order, then blocks. */
const UNIT_ORDER: readonly EnrolmentUnit[] = ['year', 'fall', 'spring', 'block'];

/** Read a posted key back, or null if it names a course or unit that is not offered. */
export function findOffering(offerings: readonly Offering[], key: string): Offering | null {
  return offerings.find((offering) => offeringKey(offering) === key) ?? null;
}

/**
 * Resolve a list of posted keys, dropping anything that is not on sale.
 *
 * Dropping rather than throwing: the keys come from a form, a form can be stale
 * by a republish, and a family whose selection includes a class withdrawn this
 * morning should see the rest of their selection rather than an error page.
 */
export function selectedOfferings(
  offerings: readonly Offering[],
  keys: readonly string[],
): Offering[] {
  return keys
    .map((key) => findOffering(offerings, key))
    .filter((offering): offering is Offering => offering !== null);
}

/**
 * The words the school's own duration line uses for a unit, for the picker.
 *
 * "Full year" rather than "Year": the label is read by a parent choosing, not by
 * a developer reading a type.
 */
export function unitLabel(unit: EnrolmentUnit): string {
  switch (unit) {
    case 'year':
      return 'Full year';
    case 'fall':
      return 'Fall semester';
    case 'spring':
      return 'Spring semester';
    case 'block':
      return 'Block';
  }
}

/**
 * Two selected offerings that cannot both be attended, or might not be.
 *
 * `clash` is a fact — same track, overlapping times, and at least one real day
 * they both meet. `possible` is the truthful third state: the times overlap and
 * at least one side is a block whose dates the school has not set, so whether
 * they ever land on the same day is genuinely unknown.
 */
export type OfferingClash = {
  a: Offering;
  b: Offering;
  track: DayTrack;
  severity: 'clash' | 'possible';
  /** The real days both would meet, oldest first. Empty when `possible`. */
  sharedDates: string[];
};

/**
 * Every clash in one selection, worst first.
 *
 * Pairwise over the selection, and per track — Algebra 1 meets on Monday *and*
 * Wednesday, and a course clashing with it on one of those is a clash even if
 * the other day is free. One pair can therefore produce two warnings, on two
 * tracks, which is what a family needs to hear: it is two mornings, not one.
 *
 * The same course selected twice as two different units is a clash with itself
 * and is reported as one. It is a real mistake — nobody buys the year and the
 * fall of the same class — and it is the one an unwary picker makes easiest.
 */
export function clashesAmong(
  selection: readonly Offering[],
  year: SchoolYear,
): OfferingClash[] {
  const clashes: OfferingClash[] = [];

  for (let i = 0; i < selection.length; i += 1) {
    for (let j = i + 1; j < selection.length; j += 1) {
      const a = selection[i] as Offering;
      const b = selection[j] as Offering;

      for (const track of DAY_TRACKS) {
        if (!a.course.days.includes(track) || !b.course.days.includes(track)) continue;
        if (!intervalsOverlap(a.course, b.course)) continue;

        const aDates = datesOf(a, year, track);
        const bDates = datesOf(b, year, track);

        if (aDates === null || bDates === null) {
          clashes.push({ a, b, track, severity: 'possible', sharedDates: [] });
          continue;
        }

        const shared = aDates.filter((date) => bDates.includes(date));
        if (shared.length > 0) {
          clashes.push({ a, b, track, severity: 'clash', sharedDates: shared });
        }
      }
    }
  }

  // Certain before possible, so the family reads the thing that is true first.
  return clashes.sort((one, other) => severityRank(one) - severityRank(other));
}

/**
 * How a clash reads to the family.
 *
 * Names both classes, the morning, and — for a certain clash — the first day it
 * happens, because "they collide" is an assertion and "they both meet on August
 * 31, 2026" is evidence. That day is written out rather than left as the
 * `2026-08-31` the row stores: this is the one date in the Apply flow a family
 * reads, and it reads it in their own order (#113). A possible clash says *why*
 * it is only possible, so the answer is "ask the school when the block runs"
 * rather than "ignore this".
 */
export function clashSentence(clash: OfferingClash): string {
  const both = `${title(clash.a)} and ${title(clash.b)}`;
  if (clash.severity === 'clash') {
    const first = clash.sharedDates[0];
    const days = clash.sharedDates.length;
    return (
      `${both} meet at the same time on ${clash.track} mornings — ` +
      `${days} ${days === 1 ? 'day' : 'days'} together, from ${americanDateLabel(first!)}. ` +
      'One child cannot attend both.'
    );
  }
  return (
    `${both} share a ${clash.track} time, and one of them is a block whose dates ` +
    'the school has not set yet — so they may or may not collide. Ask us before you post the check.'
  );
}

/** "Algebra 1 (full year)" — the class and the unit, as one name. */
export function title(offering: Offering): string {
  return `${offering.course.title} (${unitLabel(offering.unit).toLowerCase()})`;
}

/**
 * The real days one offering meets on one track, or null for "unknown".
 *
 * The **selected unit** decides, not the course's own shape: a year course
 * bought by the fall meets on the fall's dates, and that is precisely the case
 * the naive same-slot check gets wrong. The computation itself is the course
 * editor's (`meetingDatesOn`), so the family's picker and Jill's warning are one
 * rule with two callers.
 */
function datesOf(offering: Offering, year: SchoolYear, track: DayTrack): string[] | null {
  return meetingDatesOn(year, track, offering.unit, offering.course.dates);
}

/** Real overlap, not adjacency — the rule `schedule.ts` sets for the whole site. */
function intervalsOverlap(a: Course, b: Course): boolean {
  return minutesOfDay(a.start) < minutesOfDay(b.end) && minutesOfDay(b.start) < minutesOfDay(a.end);
}

function severityRank(clash: OfferingClash): number {
  return clash.severity === 'clash' ? 0 : 1;
}
