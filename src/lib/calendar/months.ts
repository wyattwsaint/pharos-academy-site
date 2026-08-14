import type { CalendarEvent } from './event.js';
import {
  meetingsOf,
  monthLabel,
  SEMESTERS,
  trackOfDate,
  weekdayDateLabel,
  type Meeting,
  type SchoolYear,
  type Semester,
} from './year.js';

/**
 * The year as a month grid — the second half of the calendar page (#186).
 *
 * The sheet above it answers "every date my track meets", which is the question
 * a family asks in August. This answers "what is happening in October", which is
 * the one they ask in October, and no arrangement of four columns of dates has
 * ever answered it.
 *
 * **The four tracks do not share a cell, because they never meet in one.** A day
 * track *is* a weekday and a column of this grid *is* a weekday, so the thing
 * that makes the tracks hard — their own week numbering — has nowhere to land
 * here and does not try to. Week numbers stay on the sheet, which is why the
 * sheet stays.
 *
 * Nothing here is stored. The months, the school days and the closed days are
 * all computed from the same eight numbers and the same closure list the sheet
 * is computed from, so the two halves of one page cannot disagree about whether
 * the school is open — and there is still exactly one place to correct a date.
 *
 * Pure, and unit-tested without rendering: given a school year and the one-offs
 * the site holds, it returns the months.
 */

/** One date on the grid, with everything that date carries. */
export type MonthCell = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** 1–31, which is the whole of what a wide cell prints. */
  day: number;
  /** "Wednesday 25 November" — what a phone prints instead of the grid. */
  label: string;
  /** The one-offs held on this date, past ones included, in the order given. */
  events: CalendarEvent[];
  /** Whether the school is shut on a day it would otherwise have taught. */
  noSchool: boolean;
  /** What it is shut for, where the school has named it. */
  closure: string | null;
};

/** One month of the grid: a heading, and whole weeks of cells. */
export type MonthBlock = {
  /** `2026-11` — the anchor, and the key the page draws it under. */
  id: string;
  /** "November 2026", as the block is headed. */
  heading: string;
  /** Whole rows of seven; a date belonging to a neighbouring month is null. */
  weeks: (MonthCell | null)[][];
};

/**
 * The seven columns, Monday first.
 *
 * Not the American Sunday-first week, and the reason is this school rather than
 * this country: its four day tracks are Monday to Thursday, so a Monday-first
 * grid puts every teaching day in the first four columns and leaves the two days
 * nothing ever happens on together at the end. A Sunday-first grid splits the
 * school week across the fold of the row.
 */
export const WEEKDAY_COLUMNS = [
  { long: 'Monday', short: 'Mon' },
  { long: 'Tuesday', short: 'Tue' },
  { long: 'Wednesday', short: 'Wed' },
  { long: 'Thursday', short: 'Thu' },
  { long: 'Friday', short: 'Fri' },
  { long: 'Saturday', short: 'Sat' },
  { long: 'Sunday', short: 'Sun' },
] as const;

/**
 * Every month the school year touches, with every date's one-offs and marks.
 *
 * **The span is derived, never typed.** It runs from the earliest date the site
 * holds for the year to the latest — meeting dates, closures and one-offs
 * together — and a month inside it that holds nothing is still drawn, because a
 * grid that skips October would have a family reading November as October.
 *
 * The one-offs are counted into the span rather than clipped to the term dates.
 * A one-off carries no year of its own, so there is no honest way to call one
 * "outside" the year; clipping would mean the site holding an event it never
 * draws, which is the one failure a calendar cannot have.
 */
export function monthGrid(year: SchoolYear, events: readonly CalendarEvent[]): MonthBlock[] {
  const meetings = meetingsOf(year);
  const dates = [
    ...meetings.map((meeting) => meeting.date),
    ...year.closures.map((closure) => closure.date),
    ...events.map((event) => event.heldOn),
  ].sort();
  if (dates.length === 0) return [];

  const meets = new Set(meetings.map((meeting) => meeting.date));
  const closures = new Map(year.closures.map((closure) => [closure.date, closure.label]));
  const terms = semesterSpans(year, meetings);
  const held = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    held.set(event.heldOn, [...(held.get(event.heldOn) ?? []), event]);
  }

  const cellOf = (date: string): MonthCell => ({
    date,
    day: Number(date.slice(8)),
    label: weekdayDateLabel(date),
    events: held.get(date) ?? [],
    noSchool: isNoSchool(date, meets, terms),
    closure: closures.get(date) ?? null,
  });

  return monthsBetween(dates[0]!, dates[dates.length - 1]!).map((id) => ({
    id,
    heading: monthLabel(id),
    weeks: weeksOf(id, cellOf),
  }));
}

/**
 * Whether a date is one the school would be teaching on and is not.
 *
 * Three conditions, and each earns its place:
 *
 * 1. **It is a Monday, Tuesday, Wednesday or Thursday.** No day track is a
 *    Friday, so a Friday marked "no school" would say nothing a family did not
 *    already know, and fifty of them would drown the days that mean something.
 * 2. **It falls inside a semester** — between that semester's earliest first
 *    class date and its latest meeting date. July is not a day off.
 * 3. **No track meets on it.**
 *
 * Condition 3 is about **meeting dates and not courses**, deliberately. The
 * Tuesday track meets fourteen times in the seeded year and carries no courses
 * at all; those Tuesdays are school days here because the sheet on the same page
 * already prints them, and two sections of one page must not disagree about
 * whether the school is open. A track that genuinely runs nothing is a fact to
 * correct on the School Year screen, not a fact for this grid to guess at.
 */
function isNoSchool(date: string, meets: Set<string>, terms: Span[]): boolean {
  if (!trackOfDate(date)) return false;
  if (meets.has(date)) return false;
  return terms.some((term) => date >= term.from && date <= term.to);
}

/** The stretch of the calendar one semester occupies, across all four tracks. */
type Span = { from: string; to: string };

/**
 * Each semester's stretch: its earliest first class date to its latest meeting.
 *
 * The near-miss worth naming is that the start is the **first class date** the
 * school typed rather than the first meeting computed from it. Where a term
 * opens on a closed day the two differ, and the school's own answer is that the
 * semester started — the day off belongs to it, and marking it is the point.
 */
function semesterSpans(year: SchoolYear, meetings: readonly Meeting[]): Span[] {
  return SEMESTERS.flatMap((semester: Semester) => {
    const starts = year.terms
      .filter((term) => term.semester === semester)
      .map((term) => term.firstClassDate)
      .sort();
    const ends = meetings
      .filter((meeting) => meeting.semester === semester)
      .map((meeting) => meeting.date)
      .sort();
    if (starts.length === 0 || ends.length === 0) return [];

    return [{ from: starts[0]!, to: ends[ends.length - 1]! }];
  });
}

/** `2026-08` through `2027-04` — every month the two dates touch, inclusive. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}

function nextMonth(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}

/**
 * One month as whole rows of seven, the 1st under its own weekday.
 *
 * The blanks are real cells rather than an offset, because the page draws this
 * as a table and a row of seven columns has to have seven of them.
 */
function weeksOf(month: string, cellOf: (date: string) => MonthCell): (MonthCell | null)[][] {
  const [year, index] = month.split('-').map(Number) as [number, number];
  // Day zero of the next month is the last day of this one.
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();

  const cells: (MonthCell | null)[] = [
    ...Array<null>(columnOf(`${month}-01`)).fill(null),
    ...Array.from({ length: days }, (_, offset) =>
      cellOf(`${month}-${String(offset + 1).padStart(2, '0')}`),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (MonthCell | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

/** Which of the seven columns a date belongs in — 0 is Monday. */
function columnOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

