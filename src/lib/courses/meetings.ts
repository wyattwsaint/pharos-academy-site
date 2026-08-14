/**
 * When a course meets, said on the course's own page (#233, spec #215).
 *
 * A parent asks this in August, and until now the only public answer was the
 * two semester sheets on the calendar page: a table of week rows and day-track
 * columns that **never says the word "Art"**. To read it a parent had to
 * already know that Art is a Wednesday-track course. This answers the same
 * question on the page where the course is already named, so the **day track**
 * never has to be known at all.
 *
 * **Nothing here computes a date.** The dates come from `meetingDatesOn`, the
 * one the editor's clash check and the application's picker already use, so a
 * course page and a clash warning cannot disagree about when a course meets.
 * What is new is presentation — a summary line and a by-month grouping — and it
 * is pure, so it is proved date by date without rendering.
 *
 * The **enrolment unit** is what makes the dates right: a fall-only offering has
 * no meetings in February, and a block shows its own short run, in which a
 * **closure** pushes the last meeting later rather than dropping it. All three
 * fall out of asking `meetingDatesOn` and none is re-decided here.
 */

import {
  monthLabel,
  shortDateLabel,
  trackOfDate,
  weekdayDateLabel,
  type SchoolYear,
} from '../calendar/year.js';
import type { Course } from './course.js';
import { DAY_TRACKS, type DayTrack } from './schedule.js';
import { meetingDatesOn } from './slots.js';

/** One meeting, as a line under its month's heading. */
export type MeetingDate = {
  /** `YYYY-MM-DD` — also the `datetime` the page prints it with. */
  date: string;
  /** "Wednesday 9 September". */
  label: string;
};

/** One month of a course's run. */
export type MeetingMonth = {
  /** `2026-09`. */
  id: string;
  /** "September 2026". */
  heading: string;
  dates: MeetingDate[];
};

/**
 * A course's run, as the page shows it.
 *
 * `summary` is null in the two states that have no dates to summarise, and
 * `unknown` is what separates them. A block whose start date is not picked yet
 * is *unknown* — the same third state the clash check refuses to guess at — and
 * a semester course on a track the year gives no term genuinely meets on no
 * days. A page that said "no dates" to both would be claiming a fact about the
 * first.
 */
export type CourseMeetings = {
  /** Every date the course meets, oldest first, each date once. */
  dates: string[];
  /** "28 Wednesdays, 9 Sep to 20 May", or null when there are no dates. */
  summary: string | null;
  /** Whether the dates cannot be known yet — a block with no start date. */
  unknown: boolean;
  months: MeetingMonth[];
};

/**
 * The dates one course meets on, ready to print.
 *
 * A course on two tracks — Algebra 1 meets Monday *and* Wednesday — is one run
 * of both tracks' dates merged, because a family enrols in the course and not
 * in a track. The merge dedupes, since a block's picked dates are its own
 * whichever track is asked.
 */
export function courseMeetings(year: SchoolYear, course: Course): CourseMeetings {
  const perTrack: string[][] = [];
  for (const track of course.days) {
    const onTrack = meetingDatesOn(year, track, course.enrolment, course.dates);
    // Null from any track is the block-with-no-dates state, and it is the whole
    // course's state: the dates it would show are the dates it has not got.
    if (onTrack === null) return { dates: [], summary: null, unknown: true, months: [] };
    perTrack.push(onTrack);
  }

  const dates = [...new Set(perTrack.flat())].sort();
  return {
    dates,
    summary: summaryOf(dates),
    unknown: false,
    months: monthsOf(dates),
  };
}

/**
 * "28 Wednesdays, 9 Sep to 20 May" — the whole answer in one line.
 *
 * The weekday is read off the **dates themselves** rather than off the course's
 * `days`, because a block's picked dates are the authority on which weekday it
 * really runs; a row still naming a track the block does not use would
 * otherwise put a wrong weekday on a right list of dates.
 *
 * A single meeting gets no range — "1 Wednesday, 9 Sep" — because "9 Sep to
 * 9 Sep" is a sentence no one writes.
 */
function summaryOf(dates: readonly string[]): string | null {
  if (dates.length === 0) return null;

  const first = shortDateLabel(dates[0]!);
  const last = shortDateLabel(dates[dates.length - 1]!);
  const span = dates.length === 1 ? first : `${first} to ${last}`;

  return `${countLabel(dates)}, ${span}`;
}

/** "28 Wednesdays", or "56 meetings on Mondays and Wednesdays" for two tracks. */
function countLabel(dates: readonly string[]): string {
  const weekdays = weekdaysOf(dates);
  const plural = dates.length === 1 ? '' : 's';

  if (weekdays.length === 1) return `${dates.length} ${weekdays[0]}${plural}`;
  if (weekdays.length === 0) return `${dates.length} meeting${plural}`;
  return `${dates.length} meeting${plural} on ${listLabel(weekdays.map((day) => `${day}s`))}`;
}

/**
 * The distinct weekdays the dates fall on, in the week's own order.
 *
 * A date outside Monday–Thursday belongs to no track, and one of those makes
 * the whole line fall back to "meetings": naming the weekdays of *most* of a
 * run is how "28 Wednesdays" comes to be printed over a list holding a Friday.
 */
function weekdaysOf(dates: readonly string[]): DayTrack[] {
  const tracks = dates.map(trackOfDate);
  if (tracks.some((track) => track === null)) return [];
  return DAY_TRACKS.filter((track) => tracks.includes(track));
}

/** "Mondays and Wednesdays" — the school writes two days out, never with a slash. */
function listLabel(items: readonly string[]): string {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The dates grouped by the month they fall in, oldest month first.
 *
 * Only the months the course actually meets in: an empty February on a fall
 * course's list would be the sheet's failure again in a new shape, saying
 * something about a month the course has nothing to do with.
 */
function monthsOf(dates: readonly string[]): MeetingMonth[] {
  const months: MeetingMonth[] = [];
  for (const date of dates) {
    const id = date.slice(0, 7);
    let month = months[months.length - 1];
    if (month?.id !== id) {
      month = { id, heading: monthLabel(id), dates: [] };
      months.push(month);
    }
    month.dates.push({ date, label: weekdayDateLabel(date) });
  }
  return months;
}
