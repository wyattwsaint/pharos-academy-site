/**
 * The meeting slots the course editor picks from, and the collision check it
 * runs while Jill types (#24).
 *
 * "Day and time selected from real meeting slots" (spec #18 §10) has two
 * halves, and each comes from the place that actually knows it. The **days**
 * come from the School Year screen: a track the year gives no term is a day
 * the school does not meet, and the editor must not offer it. The **times**
 * come from the timetable itself — the distinct meeting times the catalogue
 * already runs on that track — because those are the school's real slots, not
 * a grid this site invented.
 *
 * The collision check **warns and never blocks**. The Wednesday 10:40 slot
 * carries five electives by design (CONTEXT.md, "clash"), so an occupied slot
 * is a fact Jill is told, not a save she is refused. What makes the warning
 * exact rather than approximate is dates: two courses collide only when they
 * would meet at the same time **on the same real day**, which is why a fall
 * course and a spring course sharing a time never warn, and why a block whose
 * start date is not set yet warns as *possible* — the truthful third state —
 * rather than being guessed either way.
 */

import { trackColumn, type Meeting, type SchoolYear } from '../calendar/year.js';
import type { Course, EnrolmentUnit } from './course.js';
import { coursesOnTrack, DAY_TRACKS, minutesOfDay, type DayTrack } from './schedule.js';

/** One pickable time on one track, with whoever already meets then. */
export type MeetingSlot = {
  track: DayTrack;
  /** `HH:MM`, 24-hour, like everywhere else. */
  start: string;
  end: string;
  /** The courses already meeting at exactly this time on this track. */
  occupants: Course[];
};

/** The day tracks the year actually runs — the only days the editor offers. */
export function runningTracks(year: SchoolYear): DayTrack[] {
  return DAY_TRACKS.filter((track) => year.terms.some((term) => term.track === track));
}

/**
 * Every real meeting slot, track by track in calendar order.
 *
 * A running track with no courses yet contributes no slots but is still a
 * pickable day — the Tuesday track's routine state. A track the year does not
 * run contributes nothing at all, even if a course row still names it: the
 * slot list is what the School Year screen says, not what a stale row does.
 */
export function meetingSlots(year: SchoolYear, courses: readonly Course[]): MeetingSlot[] {
  return runningTracks(year).flatMap((track) => {
    const slots = new Map<string, MeetingSlot>();
    for (const course of coursesOnTrack(courses, track)) {
      const key = `${course.start}-${course.end}`;
      const slot = slots.get(key) ?? { track, start: course.start, end: course.end, occupants: [] };
      slot.occupants.push(course);
      slots.set(key, slot);
    }
    return [...slots.values()];
  });
}

/**
 * What the editor knows about the course being typed, before it is saved.
 *
 * `slug` is null on the add form; on the edit form it is the course's own,
 * so a class is never reported as colliding with itself. `dates` is a block's
 * picked meeting dates, and empty means the start date is not chosen yet —
 * which is exactly the state that makes a collision *possible* rather than
 * certain.
 */
export type CandidateSchedule = {
  slug: string | null;
  days: readonly DayTrack[];
  start: string;
  end: string;
  enrolment: EnrolmentUnit;
  dates: readonly string[];
};

/**
 * One occupied slot the candidate lands on.
 *
 * `certain` means the two would really meet at once — same track, overlapping
 * times, and at least one shared meeting date. `possible` means the times
 * overlap but one side is a block with no dates yet, so the truth is unknown
 * (CONTEXT.md, "possible clash").
 */
export type CollisionWarning = {
  track: DayTrack;
  course: Course;
  severity: 'certain' | 'possible';
  /** The real days both would meet, oldest first. Empty when `possible`. */
  sharedDates: string[];
};

/**
 * The authoring-time collision check (#24 AC 4).
 *
 * Time overlap is real overlap, not adjacency, exactly as the timetable
 * measures it. Term overlap is measured in **meeting dates**, not semester
 * names: a year course's dates are its track's whole column, a semester
 * course's are that semester's, a block's are the dates it was given. Two
 * courses whose date sets never touch — fall against spring, or two blocks
 * run back to back — share a time slot without colliding, which is the
 * distinction that keeps this warning honest enough to leave on.
 */
export function collisionWarnings(
  candidate: CandidateSchedule,
  courses: readonly Course[],
  year: SchoolYear,
): CollisionWarning[] {
  const warnings: CollisionWarning[] = [];

  for (const track of DAY_TRACKS) {
    if (!candidate.days.includes(track)) continue;
    const candidateDates = meetingDatesOn(year, track, candidate.enrolment, candidate.dates);

    for (const course of coursesOnTrack(courses, track)) {
      if (course.slug === candidate.slug) continue;
      if (!intervalsOverlap(candidate.start, candidate.end, course.start, course.end)) continue;

      const courseDates = meetingDatesOn(year, track, course.enrolment, course.dates);
      if (candidateDates === null || courseDates === null) {
        warnings.push({ track, course, severity: 'possible', sharedDates: [] });
        continue;
      }

      const shared = candidateDates.filter((date) => courseDates.includes(date));
      if (shared.length > 0) {
        warnings.push({ track, course, severity: 'certain', sharedDates: shared });
      }
    }
  }

  return warnings;
}

/**
 * The dates a block may start on: that track's real meeting dates, in that
 * track's own order and numbering. The picker offers these and nothing else,
 * so a block cannot begin on a day the school does not meet (#24 AC 6).
 */
export function blockStartChoices(year: SchoolYear, track: DayTrack): Meeting[] {
  return trackColumn(year, track);
}

/**
 * A block's whole run: `weeks` consecutive meetings of its track, from the
 * picked start. Closures are already skipped — the column walked here is the
 * same one the calendar prints — so a six-week block over Thanksgiving simply
 * runs a calendar week longer, exactly as the school's own sheets have it.
 *
 * Refused rather than shortened when the start is not one of that track's
 * meeting dates or the year ends before the block does: a block the year
 * cannot hold is a fact for Jill, not a quiet truncation.
 */
export function blockMeetingDates(
  year: SchoolYear,
  track: DayTrack,
  startDate: string,
  weeks: number,
): string[] {
  const column = trackColumn(year, track).map((meeting) => meeting.date);
  const from = column.indexOf(startDate);
  if (from === -1) {
    throw new Error(`The ${track} track does not meet on ${startDate} — pick a real meeting date.`);
  }
  const dates = column.slice(from, from + weeks);
  if (dates.length < weeks) {
    throw new Error(
      `A ${weeks}-week block starting ${startDate} outruns the ${track} track's year — ` +
        `only ${dates.length} meeting${dates.length === 1 ? '' : 's'} remain.`,
    );
  }
  return dates;
}

/** The computed end date the form shows — the block's last meeting (#24 AC 6). */
export function blockEndDate(
  year: SchoolYear,
  track: DayTrack,
  startDate: string,
  weeks: number,
): string {
  return blockMeetingDates(year, track, startDate, weeks).at(-1)!;
}

/**
 * The days one course actually meets on one track, or null for "unknown".
 *
 * Null is only ever a block with no dates yet. An empty list is different and
 * real: a semester course on a track the year gives no term meets on no days,
 * and no days means no collision — the school is not meeting, so nobody is
 * double-booked.
 */
function meetingDatesOn(
  year: SchoolYear,
  track: DayTrack,
  enrolment: EnrolmentUnit,
  dates: readonly string[],
): string[] | null {
  if (enrolment === 'block') return dates.length > 0 ? [...dates] : null;
  return trackColumn(year, track)
    .filter((meeting) => enrolment === 'year' || meeting.semester === enrolment)
    .map((meeting) => meeting.date);
}

/** Real overlap, not adjacency — the same rule `schedule.ts` applies. */
function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutesOfDay(aStart) < minutesOfDay(bEnd) && minutesOfDay(bStart) < minutesOfDay(aEnd);
}
