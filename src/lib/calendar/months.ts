import type { Course } from '../courses/course.js';
import { minutesOfDay, timeLabel } from '../courses/schedule.js';
import { meetingDatesOn } from '../courses/slots.js';
import { classPath } from '../courses/views.js';
import { eventTimeLabel, type CalendarEvent } from './event.js';
import {
  addDays,
  dayLabel,
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
 * The year as a month grid — the whole of the calendar page's screen (#186,
 * #237).
 *
 * It answers "what is happening in October", which is the question a family
 * asks in October, and no arrangement of four columns of dates has ever
 * answered it. It used to share the page with two such arrangements; they are
 * deleted (ADR-0018), and "every date my course meets" is answered on the
 * course page, where the course has a name.
 *
 * **The four tracks do not share a cell, because they never meet in one.** A day
 * track *is* a weekday and a column of this grid *is* a weekday, so the thing
 * that makes the tracks hard — their own week numbering — has nowhere to land
 * here and does not try to. With the sheet deleted the week number has no
 * public surface at all, and it is deliberately not given one here.
 *
 * **A cell prints what is exceptional and reveals what is routine** (#235,
 * ADR-0018). A one-off and a closure happen once and are printed; a **meeting**
 * of an **offering** is the same fact restated every week of a term, so it sits
 * behind a labelled control the cell carries instead. That is why the courses
 * are an input here rather than on the page: the wide grid, the phone list and
 * the printed list are all drawn from this one return value, which is why no two
 * of them can disagree about what meets on a Wednesday.
 *
 * Nothing here is stored. The months, the school days and the closed days are
 * all computed from the same eight numbers and the same closure list the
 * meeting dates are, so a cell and a course page cannot disagree about whether
 * the school is open — and there is still exactly one place to correct a date.
 * The meeting dates are not computed here either: they come from
 * `meetingDatesOn`, the one the clash check and the course page already use.
 *
 * Pure, and unit-tested without rendering: given a school year, the one-offs the
 * site holds and the catalogue, it returns the months.
 */

/** One offering in a cell's panel, as the link that reaches its own page. */
export type CellOffering = {
  /** The school's own title. */
  title: string;
  /** `/classes/<slug>`. */
  href: string;
};

/**
 * One time slot on one date, and the offerings meeting in it.
 *
 * Grouped rather than flat, and that is the point: the five electives at 10:40
 * are **alternatives to each other**, not a sequence one child attends in turn,
 * and a flat list of six names says the wrong thing about a Wednesday morning.
 */
export type CellSlot = {
  /** `HH:MM` — what the slots are ordered by, never printed. */
  start: string;
  end: string;
  /** "10:40-11:40 a.m.", in the school's own way of writing a time. */
  time: string;
  /** The offerings meeting then, by title. */
  offerings: CellOffering[];
};

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
  /** What meets on this date, grouped by time slot, earliest slot first. */
  slots: CellSlot[];
  /**
   * "6 classes" — what the control naming the panel says, or null for no control.
   *
   * Null rather than "0 classes" because the **day track** running nothing is a
   * routine state, not an empty one: the Tuesday track carries no courses at all,
   * and a control that opens onto nothing is a promise the cell cannot keep. Such
   * a cell is not ambiguous either — closures are marked, so an unmarked weekday
   * with no control reads as open with nothing scheduled, which is true.
   */
  classLabel: string | null;
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
 *
 * The **courses do not widen the span**, and they cannot: every date they meet
 * on is one of the year's own meeting dates, which are already in it.
 */
export function monthGrid(
  year: SchoolYear,
  events: readonly CalendarEvent[],
  courses: readonly Course[],
): MonthBlock[] {
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

  const taught = coursesByDate(year, courses);

  const cellOf = (date: string): MonthCell => {
    const slots = slotsOf(taught.get(date) ?? []);
    const count = slots.reduce((total, slot) => total + slot.offerings.length, 0);
    return {
      date,
      day: Number(date.slice(8)),
      label: weekdayDateLabel(date),
      events: held.get(date) ?? [],
      noSchool: isNoSchool(date, meets, terms),
      closure: closures.get(date) ?? null,
      slots,
      classLabel: count === 0 ? null : `${count} ${count === 1 ? 'class' : 'classes'}`,
    };
  };

  return monthsBetween(dates[0]!, dates[dates.length - 1]!).map((id) => ({
    id,
    heading: monthLabel(id),
    weeks: weeksOf(id, cellOf),
  }));
}

/**
 * Which courses meet on which date — the whole catalogue, walked once.
 *
 * **No date is computed here.** `meetingDatesOn` is asked, because it is the
 * same function the editor's clash check, the application's picker and the
 * course page's own list already ask, and a second computation of "when does
 * this meet" is how a cell comes to name a Wednesday the course page does not.
 * The **enrolment unit** it takes is what makes a fall course contribute nothing
 * to February and a block contribute only its own run.
 *
 * The dates of a two-track course are deduplicated before they are recorded: the
 * tracks of a `year` course are disjoint, but a **block**'s picked dates are its
 * own whichever track is asked, so a two-track block would otherwise be counted
 * twice on each of its days.
 *
 * A block with no start date yet is `null` and contributes nothing. That is not
 * a course drawn nowhere by accident — the dates it would be drawn on are the
 * dates it has not got, and the clash check refuses to guess at them too.
 */
function coursesByDate(year: SchoolYear, courses: readonly Course[]): Map<string, Course[]> {
  const byDate = new Map<string, Course[]>();
  for (const course of courses) {
    const dates = new Set<string>();
    for (const track of course.days) {
      for (const date of meetingDatesOn(year, track, course.enrolment, course.dates) ?? []) {
        dates.add(date);
      }
    }
    for (const date of dates) byDate.set(date, [...(byDate.get(date) ?? []), course]);
  }
  return byDate;
}

/**
 * One date's courses, grouped into the slots they meet in, earliest first.
 *
 * The slot is the start *and* the end, not the start alone: two courses opening
 * at 9:00 and running to different times are two slots, and the school's own way
 * of writing a meeting time (`timeLabel`) names both ends. Within a slot the
 * offerings are alphabetical, which is the order the catalogue is read in
 * everywhere else on the site.
 */
function slotsOf(courses: readonly Course[]): CellSlot[] {
  const slots = new Map<string, CellSlot>();
  for (const course of courses) {
    const key = `${course.start}-${course.end}`;
    const slot = slots.get(key) ?? {
      start: course.start,
      end: course.end,
      time: timeLabel(course.start, course.end),
      offerings: [],
    };
    slot.offerings.push({ title: course.title, href: classPath(course.slug) });
    slots.set(key, slot);
  }

  for (const slot of slots.values()) {
    slot.offerings.sort((a, b) => a.title.localeCompare(b.title));
  }
  return [...slots.values()].sort(
    (a, b) =>
      minutesOfDay(a.start) - minutesOfDay(b.start) || minutesOfDay(a.end) - minutesOfDay(b.end),
  );
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
 * at all; those Tuesdays are school days here because the year says the school
 * is open on them, and the feed a family subscribed to says so too. A track
 * that genuinely runs nothing is a fact to
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
    const ends = taughtIn(meetings, semester);
    if (starts.length === 0 || ends.length === 0) return [];

    return [{ from: starts[0]!, to: ends[ends.length - 1]! }];
  });
}

/**
 * The dates one semester is actually taught on, all four tracks, in order.
 *
 * Both the shading above and the boundaries below ask this, and they must get
 * the same answer: a semester that ended on one date for the tint and another
 * for the line would be one sheet disagreeing with itself.
 */
function taughtIn(meetings: readonly Meeting[], semester: Semester): string[] {
  return meetings
    .filter((meeting) => meeting.semester === semester)
    .map((meeting) => meeting.date)
    .sort();
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

/*
 * The year on paper: a dated list, month by month (#236).
 *
 * This is the artefact the school already hand-maintains — the sheet pinned up
 * in an office, which a family reads from across a hallway. What print used to
 * put on paper was the four-column semester sheet, and the fundraisers, the
 * picture days and the open houses were on the half of the page print hid.
 *
 * **Derived from the grid rather than from the year again.** A month on paper
 * carries exactly what the same month carries on screen, minus one thing, so
 * there is no second reading of the school's dates to drift from the first. The
 * exception is a one-off's note: prose in a two-column list is what breaks the
 * page, and it is the only thing paper keeps behind a press it does not have.
 *
 * It carries one thing the screen does not: the **term boundaries** (#271). The
 * grid says when the year opens by shading everything either side of it, which
 * is geometry a list has none of, so paper names the four days instead. They are
 * computed from the same meetings the grid is shaded from.
 *
 * The **offerings are not here at all**, which is not an omission. The reference
 * the school keeps has none on it, a calendar prints what is exceptional and
 * reveals what is routine, and paper is where space is scarcest.
 *
 * Pure and rendered by nobody, so the folding below is unit-tested as arithmetic
 * rather than asserted through a stylesheet.
 */

/**
 * What one printed line is about: a term boundary, the school being shut, or a
 * one-off.
 */
export type PrintedEntry =
  | {
      kind: 'term';
      /**
       * The school's own wording for the boundary — "First day of classes",
       * "Classes resume", "Last day of the fall semester", "Last day of
       * classes".
       */
      label: string;
    }
  | {
      kind: 'closure';
      /** What the school calls it, where it has named it. */
      label: string | null;
    }
  | {
      kind: 'one-off';
      title: string;
      /** "6.30pm", or null where the one-off is an all-day one. */
      time: string | null;
      place: string | null;
    };

/** One line of the printed list: some dates, and one thing that is on them. */
export type PrintedLine = {
  /** The first date the line covers, `YYYY-MM-DD` — its key and its order. */
  date: string;
  /** The last date it covers. The same date, unless a run of closures folded. */
  through: string;
  /** "17", "25–26", or "30 November–1 December" where a run crosses a month. */
  days: string;
  entry: PrintedEntry;
};

/** One month of the printed list. A month carrying nothing is not drawn. */
export type PrintedMonth = { id: string; heading: string; lines: PrintedLine[] };

/**
 * The grid, folded down to the lines paper wants.
 *
 * **Consecutive closures sharing a name are one line.** Thanksgiving is six
 * closures that happen to sit next to each other, and six lines saying "No
 * school — Thanksgiving" is a list nobody reads to the end of; *"25–30"* is how
 * the school writes it by hand. The name is what says two shut days are one
 * thing — the year stores no run and no span — so a run breaks where the name
 * changes, and two adjacent days off called different things stay two lines.
 *
 * A month is dropped when it holds nothing. The grid draws an empty October so
 * that November is not read as October; a list has no such geometry to keep, and
 * a heading with nothing under it is a line of paper spent saying nothing.
 *
 * **The year comes in beside the grid, for the term boundaries alone** (#271).
 * A boundary is a fact about a *semester* — which day it opened on and which day
 * it closed — and a cell carries no semester, so the grid genuinely cannot
 * answer it. Nothing else is read from the year here: the closures and the
 * one-offs still come off the cells, so paper still cannot say something the
 * screen does not.
 */
export function printedYear(months: readonly MonthBlock[], year: SchoolYear): PrintedMonth[] {
  const cells = months.flatMap((month) =>
    month.weeks.flat().filter((cell): cell is MonthCell => cell !== null),
  );

  const lines = [...termLines(year), ...closureLines(cells), ...oneOffLines(cells)]
    .sort((a, b) => a.date.localeCompare(b.date) || rankOf(a.entry) - rankOf(b.entry))
    // The dates are written once, here, so a folded run and a single day cannot
    // come out in two formats.
    .map((line) => ({ ...line, days: daysLabel(line.date, line.through) }));

  return months
    .map((month) => ({
      id: month.id,
      heading: month.heading,
      lines: lines.filter((line) => line.date.slice(0, 7) === month.id),
    }))
    .filter((month) => month.lines.length > 0);
}

/**
 * The stated order of the three kinds where they share a date: **term boundary,
 * then closure, then one-off**.
 *
 * It runs from what the date *is* to what merely happens on it. A boundary names
 * the day itself — the year opened, or it closed — and a family scanning the
 * line for "31: First day of classes" should not read past a bake sale to find
 * it. A closure is the next such fact, because whether the school is open
 * governs everything else the date carries; a one-off is last, and there may be
 * several of them, in the order the date holds them.
 *
 * A term line and a closure cannot in fact meet: a boundary is a day the school
 * taught on and a closure is a day it did not. The rank still states which wins,
 * because "it cannot happen" is not something a sort should rely on.
 */
function rankOf(entry: PrintedEntry): number {
  if (entry.kind === 'term') return 0;
  return entry.kind === 'closure' ? 1 : 2;
}

/** A line before its dates are written out: what the two builders below return. */
type UnwrittenLine = Omit<PrintedLine, 'days'>;

/**
 * The four days the year turns on: each semester's first and last teaching day
 * (#271).
 *
 * The reference sheet the school supplied sets its own first day of school in
 * the heavier weight, and it is the one thing on a pinned-up calendar that is
 * neither a day off nor an event — a family reading down a column of closures
 * has nowhere else to learn when the year opens or when it lets out.
 *
 * **Derived from the meetings, like everything else.** The first teaching day is
 * the earliest date any track meets in that semester and the last is the latest,
 * across all four — not the `firstClassDate` the school typed, which is the
 * Monday track's own and is a day earlier than the Wednesday track's. It is also
 * not the *span* `semesterSpans` computes above: that one deliberately opens on
 * the typed date so a term opening on a closed day still marks it, which is the
 * right answer for shading a cell and the wrong one for a line reading "First
 * day of classes".
 *
 * **The wording is positional, not per-semester.** The first semester the year
 * actually has opens the year; a later one resumes it, which is the reference's
 * own distinction and the one a family reads for in January. Likewise the last
 * semester present closes the year and an earlier one closes only itself. A year
 * with one semester therefore says "First day of classes" and "Last day of
 * classes" and never invents a gap to resume from.
 */
function termLines(year: SchoolYear): UnwrittenLine[] {
  const meetings = meetingsOf(year);

  const spans = SEMESTERS.flatMap((semester: Semester) => {
    const dates = taughtIn(meetings, semester);
    if (dates.length === 0) return [];

    return [{ semester, first: dates[0]!, last: dates[dates.length - 1]! }];
  });

  const boundary = (date: string, label: string): UnwrittenLine => ({
    date,
    through: date,
    entry: { kind: 'term', label },
  });

  return spans.flatMap((span, index) => [
    boundary(span.first, index === 0 ? 'First day of classes' : 'Classes resume'),
    boundary(
      span.last,
      index === spans.length - 1
        ? 'Last day of classes'
        : `Last day of the ${span.semester} semester`,
    ),
  ]);
}

/**
 * The days off, with the runs folded.
 *
 * Adjacency is the calendar's and not the school week's: a run continues where
 * the next day is the next date, so Thanksgiving's Wednesday and Thursday fold
 * and the Monday on the far side of the weekend opens a new line. That is the
 * honest reading — the school did not say it was shut on the Saturday, and a
 * range that swallowed it would be the site inventing a closure.
 *
 * **The cells must arrive in date order**, which is what the grid hands over:
 * only the line still open is offered the next shut day, so an out-of-order
 * cell would open a second line for a day that belongs to a run above it.
 *
 * **A shut day the school has not named never folds.** The grid marks a weekday
 * in term time that nobody meets on even where no closure names it, and two of
 * those in a row are two facts about an empty timetable rather than one thing
 * with two days in it. The name is what says a run is a run, so an absent name
 * cannot say it — folding on `null === null` would print a range the school
 * never gave a reason for.
 */
function closureLines(cells: readonly MonthCell[]): UnwrittenLine[] {
  const lines: UnwrittenLine[] = [];

  for (const cell of cells) {
    if (!cell.noSchool) continue;

    const open = lines[lines.length - 1];
    const continues =
      open !== undefined &&
      open.entry.kind === 'closure' &&
      open.entry.label !== null &&
      open.entry.label === cell.closure &&
      addDays(open.through, 1) === cell.date;

    if (continues) open.through = cell.date;
    else {
      lines.push({
        date: cell.date,
        through: cell.date,
        entry: { kind: 'closure', label: cell.closure },
      });
    }
  }

  return lines;
}

/**
 * The one-offs, each its own line, in the order the date holds them.
 *
 * Title, time and place — the rule #234 sets on the grid, which paper keeps
 * rather than restates: a one-off prints its title and its time everywhere it
 * appears, and an absent time is a real state rather than a gap to apologise
 * for. A pinned-up sheet saying "Fall Open House" and not whether it is an
 * evening is the same complaint the cell answered.
 *
 * The place comes with them because a printed sheet has no panel to put it in
 * and a family reading it is not standing at the school.
 */
function oneOffLines(cells: readonly MonthCell[]): UnwrittenLine[] {
  return cells.flatMap((cell) =>
    cell.events.map((event) => ({
      date: cell.date,
      through: cell.date,
      entry: {
        kind: 'one-off' as const,
        title: event.title,
        time: event.startTime ? eventTimeLabel(event.startTime) : null,
        place: event.place,
      },
    })),
  );
}

/**
 * "17", "25–26", or "30 November–1 December".
 *
 * A bare number while the month heading above is still saying which month it
 * is, and both months written out when the run crosses one — a range reading
 * "30–1" is a range read as a typo.
 */
function daysLabel(date: string, through: string): string {
  const day = (one: string) => String(Number(one.slice(8)));
  if (date === through) return day(date);
  if (date.slice(0, 7) === through.slice(0, 7)) return `${day(date)}–${day(through)}`;
  return `${dayLabel(date)}–${dayLabel(through)}`;
}

