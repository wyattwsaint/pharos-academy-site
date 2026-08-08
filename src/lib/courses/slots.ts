/**
 * The meeting slots the course editor picks from, and the clash check it
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
 * The clash check **warns and never blocks**. The Wednesday 10:40 slot
 * carries five electives by design (CONTEXT.md, "clash"), so an occupied slot
 * is a fact Jill is told, not a save she is refused. What makes the warning
 * exact rather than approximate is dates: two courses clash only when they
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
 * so a class is never reported as clashing with itself. `dates` is a block's
 * picked meeting dates, and empty means the start date is not chosen yet —
 * which is exactly the state that makes a clash *possible* rather than
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
 * `clash` means the two would really meet at once — same track, overlapping
 * times, and at least one shared meeting date. `possible` means the times
 * overlap but one side is a block with no dates yet, so the truth is unknown
 * (CONTEXT.md, "possible clash").
 */
export type ClashWarning = {
  track: DayTrack;
  course: Course;
  severity: 'clash' | 'possible';
  /** The real days both would meet, oldest first. Empty when `possible`. */
  sharedDates: string[];
};

/**
 * The authoring-time clash check (#24 AC 4).
 *
 * Time overlap is real overlap, not adjacency, exactly as the timetable
 * measures it. Term overlap is measured in **meeting dates**, not semester
 * names: a year course's dates are its track's whole column, a semester
 * course's are that semester's, a block's are the dates it was given. Two
 * courses whose date sets never touch — fall against spring, or two blocks
 * run back to back — share a time slot without clashing, which is the
 * distinction that keeps this warning honest enough to leave on.
 */
export function clashWarnings(
  candidate: CandidateSchedule,
  courses: readonly Course[],
  year: SchoolYear,
): ClashWarning[] {
  const warnings: ClashWarning[] = [];

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
        warnings.push({ track, course, severity: 'clash', sharedDates: shared });
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

/** A block's run, or the domain's own words for why the picked start gives none. */
export type BlockRun = {
  /** The block's real meeting dates, and empty when the form has not described a run. */
  dates: string[];
  /** Why the picked start gives no run, or null — including for a start not picked yet. */
  refusal: string | null;
};

/**
 * The run a form describes, asked in the one way both callers need it (#60).
 *
 * `blockMeetingDates` throws, which is right for a parser and wrong for the
 * editor's GET, where the same refusal has to be rendered beside the field. Both
 * the parser and `courseFormView` want the dates when there are dates and the
 * message when there are not, so they ask here rather than each wrapping the
 * throw — two `catch` blocks are two chances for the POST and the GET to say
 * different things about one form.
 *
 * A start not picked yet, or a week count not typed yet, is not a refusal: it is
 * a form that has not asked. That is `{ dates: [], refusal: null }`, and the
 * callers read it as "no run described" rather than "no run possible".
 */
export function blockRun(
  year: SchoolYear,
  track: DayTrack,
  startDate: string,
  weeks: number,
): BlockRun {
  if (!startDate || weeks < 1) return { dates: [], refusal: null };
  try {
    return { dates: blockMeetingDates(year, track, startDate, weeks), refusal: null };
  } catch (error) {
    return { dates: [], refusal: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The days one course actually meets on one track, or null for "unknown".
 *
 * Null is only ever a block with no dates yet. An empty list is different and
 * real: a semester course on a track the year gives no term meets on no days,
 * and no days means no clash — the school is not meeting, so nothing can be
 * held twice over.
 *
 * Exported because the application flow's clash check (#31) has to measure term
 * overlap by exactly this rule. Two implementations of "do these two share a
 * real day?" is how the editor comes to warn Jill about a pair the family's
 * picker clears, or the reverse.
 */
export function meetingDatesOn(
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
