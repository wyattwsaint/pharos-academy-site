import { DAY_TRACKS, type DayTrack } from '../courses/schedule.js';

/**
 * The school year, computed rather than typed (#23).
 *
 * Jill types eight first-class dates, two week counts and a list of closed
 * days; everything a family reads — all 112 meeting dates and each track's own
 * week numbering — comes out of this module. The five hand-made PDFs it retires
 * are what a hand-kept calendar looks like: they already disagree with
 * themselves (the Monday sheet's "EASTER MONDAY OFF / March 26, 2026" is a
 * Friday, in the wrong year).
 *
 * **A flat week number is wrong.** The four tracks skip only their own
 * holidays, so week 10 of the fall is 9 November on Monday, 10 November on
 * Tuesday, 4 November on Wednesday and 5 November on Thursday, and all four are
 * correct. Every function here numbers per track for that reason.
 *
 * Pure, and deliberately so: the admin's live preview imports it into the
 * browser, the public page renders from it on the server, and the ICS feed is
 * built from its output. One computation, three surfaces.
 */

/**
 * Where the school is, for every question the calendar asks a clock.
 *
 * Two of them ask one: the ICS feed turns a published time into the instant it
 * actually is, and the public page decides whether an event is still ahead. Both
 * have to mean *Enola's* day rather than the server's — a lambda in UTC calls
 * half past nine on a fundraiser evening "tomorrow", and the event a family
 * came to the page for is gone hours early.
 *
 * Exported from `ics.ts` too, under the name that module's callers already use.
 */
export const SCHOOL_TIMEZONE = 'America/New_York';

export type Semester = 'fall' | 'spring';

/** Fall then spring — the order every surface prints them in. */
export const SEMESTERS = ['fall', 'spring'] as const;

/** What one track does in one semester: when it starts, and for how many weeks. */
export type Term = {
  semester: Semester;
  track: DayTrack;
  /** `YYYY-MM-DD`, and it must be that track's own weekday. */
  firstClassDate: string;
  /** Meetings, not calendar weeks — closures are skipped, not counted. */
  weeks: number;
};

/**
 * A day the school is closed: the date, and what it is called.
 *
 * A closure carries no track. It does not need one — it falls on a weekday, and
 * the track that meets that weekday is the track that loses it. That is why
 * Thanksgiving is three rows here (25, 26 and 30 November) and takes a week off
 * three different tracks, while Election Day is one row and touches only
 * Tuesday.
 */
export type Closure = { date: string; label: string };

export type SchoolYear = {
  /** '2026–2027', as the school writes it on its own sheets. */
  label: string;
  /** Up to eight — four tracks, two semesters. A missing track is a valid year. */
  terms: Term[];
  closures: Closure[];
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** One class date on one track, with the number that track prints beside it. */
export type Meeting = {
  track: DayTrack;
  semester: Semester;
  /** `YYYY-MM-DD`. */
  date: string;
  /** That track's own week number, continuing across the year: 1–28. */
  week: number;
};

/**
 * The 2026–2027 year the school has already published.
 *
 * Seeded like the courses, the people and the money settings are: this is what
 * the five PDFs say, so the site is correct from the first deploy rather than
 * empty until somebody types it. Jill overwrites any of it from the admin.
 *
 * Easter Monday is the one value that is **not** the PDF's. The published
 * Monday sheet reads "EASTER MONDAY OFF / March 26, 2026" — a Friday, and the
 * wrong year — and the school confirmed the real closure is Monday 29 March
 * 2027 (#23). The PDF's own surrounding dates prove it: week 26 is 22 March and
 * week 27 is 5 April, which only follows if 29 March is skipped.
 */
export const SEEDED_SCHOOL_YEAR: SchoolYear = {
  label: '2026–2027',
  terms: [
    { semester: 'fall', track: 'Monday', firstClassDate: '2026-08-31', weeks: 14 },
    { semester: 'fall', track: 'Tuesday', firstClassDate: '2026-09-01', weeks: 14 },
    { semester: 'fall', track: 'Wednesday', firstClassDate: '2026-09-02', weeks: 14 },
    { semester: 'fall', track: 'Thursday', firstClassDate: '2026-09-03', weeks: 14 },
    { semester: 'spring', track: 'Monday', firstClassDate: '2027-01-04', weeks: 14 },
    { semester: 'spring', track: 'Tuesday', firstClassDate: '2027-01-05', weeks: 14 },
    { semester: 'spring', track: 'Wednesday', firstClassDate: '2027-01-06', weeks: 14 },
    { semester: 'spring', track: 'Thursday', firstClassDate: '2027-01-07', weeks: 14 },
  ],
  closures: [
    { date: '2026-09-07', label: 'Labor Day' },
    { date: '2026-11-03', label: 'Election Day' },
    { date: '2026-11-25', label: 'Thanksgiving' },
    { date: '2026-11-26', label: 'Thanksgiving' },
    { date: '2026-11-30', label: 'Thanksgiving' },
    /*
     * The Tuesday of Thanksgiving week off, which no published sheet says.
     *
     * The Tuesday PDF runs week 12 on 24 November and week 13 on 8 December
     * with no notice in between, and the full sheet's Thanksgiving row has
     * three cells and an empty Tuesday one. The dates are the school's, so
     * 1 December is a closure whichever way it is read — and this row is what
     * makes the computed Tuesday column agree with the sheet a family holds.
     * It is exactly the kind of fact a hand-made calendar loses.
     */
    { date: '2026-12-01', label: 'Thanksgiving' },
    { date: '2027-03-29', label: 'Easter Monday' },
  ],
  lastEditedBy: null,
  lastEditedAt: null,
};

/** Which weekday a date falls on, in the vocabulary of a day track. */
export function trackOfDate(date: string): DayTrack | null {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 4 ? DAY_TRACKS[day - 1]! : null;
}

/**
 * Every meeting date the year produces, all four tracks — 112 of them for
 * 2026–27, and fewer for a year with an empty track.
 *
 * Track order, then semester, then date: the order the public page's columns
 * and the ICS feed both want.
 */
export function meetingsOf(year: SchoolYear): Meeting[] {
  return DAY_TRACKS.flatMap((track) => trackColumn(year, track));
}

/**
 * One track's whole year, in order, numbered as that track numbers it.
 *
 * The spring continues from this track's *own* fall count — 14 fall weeks means
 * the spring opens at 15 — which is what the published sheets do. A track with
 * no fall term starts its spring at 1, because a week number is a count of that
 * track's meetings and there are no earlier ones to count.
 */
export function trackColumn(year: SchoolYear, track: DayTrack): Meeting[] {
  const closed = new Set(year.closures.map((closure) => closure.date));
  const meetings: Meeting[] = [];

  for (const semester of SEMESTERS) {
    const term = year.terms.find((one) => one.track === track && one.semester === semester);
    if (!term) continue;

    let date = term.firstClassDate;
    for (let taken = 0; taken < term.weeks; ) {
      if (!closed.has(date)) {
        meetings.push({ track, semester, date, week: meetings.length + 1 });
        taken += 1;
      }
      date = addDays(date, 7);
    }
  }

  return meetings;
}

/** A row of the four-column sheet: a week of dates, or a week nobody met. */
export type PreviewRow =
  | {
      kind: 'week';
      week: number;
      /** The date each track met, or null where that track has no such week. */
      cells: Record<DayTrack, string | null>;
    }
  | {
      kind: 'closure';
      /** What each track was off for, already named — or null if it was not. */
      cells: Record<DayTrack, string | null>;
    };

/**
 * One semester as the sheet Jill recognises: a week per row, four columns, and
 * the closures written in between exactly where they interrupt.
 *
 * A closure row carries a cell per track rather than one label across all four,
 * because Thanksgiving is genuinely three different days off — Wednesday the
 * 25th, Thursday the 26th and Monday the 30th — landing in the same gap. Where
 * the row's closures share one date the date is left off the label, since the
 * row already sits between the weeks it separates; where they do not, each cell
 * says which day it means.
 */
export function previewRows(year: SchoolYear, semester: Semester): PreviewRow[] {
  const columns = new Map<DayTrack, { meetings: Meeting[]; skipped: Skipped[] }>();
  for (const track of DAY_TRACKS) {
    const all = trackColumn(year, track);
    columns.set(track, {
      meetings: all.filter((meeting) => meeting.semester === semester),
      skipped: skippedBy(year, track, semester),
    });
  }

  const weeks = [
    ...new Set(
      [...columns.values()].flatMap((column) => column.meetings.map((meeting) => meeting.week)),
    ),
  ].sort((a, b) => a - b);

  const rows: PreviewRow[] = [];
  const taken = new Map<DayTrack, number>(DAY_TRACKS.map((track) => [track, 0]));

  for (const week of weeks) {
    // Everything each track skipped on its way to this week, as one row.
    const pending = new Map<DayTrack, Closure[]>();
    for (const track of DAY_TRACKS) {
      const column = columns.get(track)!;
      const meeting = column.meetings.find((one) => one.week === week);
      if (!meeting) continue;
      const before = column.skipped.filter(
        (skip) => skip.date < meeting.date && skip.date > (lastDate(rows, track) ?? ''),
      );
      if (before.length > 0) pending.set(track, before.map((skip) => skip.closure));
      taken.set(track, week);
    }
    if (pending.size > 0) rows.push(closureRow(pending));

    rows.push({
      kind: 'week',
      week,
      cells: cellsOf((track) => columns.get(track)!.meetings.find((one) => one.week === week)?.date ?? null),
    });
  }

  return rows;
}

/** A closed day one track would otherwise have met on. */
type Skipped = { date: string; closure: Closure };

/**
 * The closures one track actually loses in one semester.
 *
 * Computed by walking the same weekly step `trackColumn` walks, so a closure
 * outside the term — a Friday, or a date after the last meeting — is not
 * reported as a week off that never was.
 */
function skippedBy(year: SchoolYear, track: DayTrack, semester: Semester): Skipped[] {
  const term = year.terms.find((one) => one.track === track && one.semester === semester);
  if (!term) return [];

  const byDate = new Map(year.closures.map((closure) => [closure.date, closure]));
  const skipped: Skipped[] = [];

  let date = term.firstClassDate;
  for (let taken = 0; taken < term.weeks; ) {
    const closure = byDate.get(date);
    if (closure) skipped.push({ date, closure });
    else taken += 1;
    date = addDays(date, 7);
  }

  return skipped;
}

/** The date a track last met, walking back up the rows already emitted. */
function lastDate(rows: PreviewRow[], track: DayTrack): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind === 'week' && row.cells[track]) return row.cells[track];
  }
  return null;
}

/** One closure row, with each track's cell named the way that row needs. */
function closureRow(pending: Map<DayTrack, Closure[]>): PreviewRow {
  const dates = new Set([...pending.values()].flat().map((closure) => closure.date));
  const sameDay = dates.size === 1;

  return {
    kind: 'closure',
    cells: cellsOf((track) => {
      const closures = pending.get(track);
      if (!closures) return null;
      return closures
        .map((closure) => (sameDay ? closure.label : `${closure.label} (${dayLabel(closure.date)})`))
        .join(' · ');
    }),
  };
}

function cellsOf(value: (track: DayTrack) => string | null): Record<DayTrack, string | null> {
  return Object.fromEntries(DAY_TRACKS.map((track) => [track, value(track)])) as Record<
    DayTrack,
    string | null
  >;
}

/** "30 November" — the day inside a closure cell, never the year. */
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * "31 August 2026" — how every date on the calendar and beside every event is
 * printed.
 *
 * One function for both, because they are one format and a second copy is a
 * second thing to notice when the school asks for American order.
 *
 * Parsed as UTC, like every other date on the site: `new Date('2026-08-31')` is
 * midnight UTC, and printing it in a timezone behind Greenwich gives 30 August
 * — a calendar one day wrong on all 112 rows, west of London, forever.
 */
export function fullDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "November 2026" and "Wednesday 25 November" — the two labels the month grid
 * prints (#186).
 *
 * Here, beside the other three, rather than in `months.ts` where they are used.
 * The reason is the note on {@link americanDateLabel}: the calendar's dates are
 * being moved to American order a flow at a time, and a date format kept in the
 * module that happens to want it is one the sweep does not find.
 *
 * Their formatters are built once and the others' are not, which is the one
 * difference. A grid of nine months asks for a label seven hundred times where
 * the sheet asks for one a hundred and twelve times, and `Intl` construction is
 * the expensive half of the call.
 */
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const WEEKDAY_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "November 2026" — a month, from a `YYYY-MM`. */
export function monthLabel(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * "Wednesday 25 November" — the weekday and the day, without the year.
 *
 * What a phone prints where a grid prints a bare number: the column heading and
 * the month heading are what say the rest, and a list has neither.
 */
export function weekdayDateLabel(date: string): string {
  return WEEKDAY_DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

/**
 * "9 Sep" — the day and an abbreviated month, for a line that holds two dates.
 *
 * The course page's summary line (#233) says a course's first and last meeting
 * in one breath — *"28 Wednesdays, 9 Sep to 20 May"* — and two full months in
 * one sentence is the length that stops it being read at a glance. Here rather
 * than in `courses/`, for the reason on {@link americanDateLabel}: a date format
 * kept in the module that happens to want it is one the sweep does not find.
 *
 * British order is a debt rather than a preference. The classes flow has not
 * been moved to American order yet — the fact list beside this line prints
 * "14 October" — and "Sep 2" above "14 October" would read as an error rather
 * than as a house style. It moves when its flow does, and this is the docstring
 * that sweep will find.
 */
export function shortDateLabel(date: string): string {
  const parts = SHORT_DATE_FORMAT.formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: 'day' | 'month') => parts.find((one) => one.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}`;
}

/**
 * American English for the abbreviation and British order for the parts, which
 * is not a muddle: `en-GB` abbreviates September as "Sept", and one four-letter
 * month in a line of three-letter ones reads as a typo. `en-US` gives "Sep",
 * and the day-first order comes from listing the parts rather than the locale.
 */
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  // `formatToParts` order is the locale's; `format` is not asked, so the parts
  // are joined here in the order the rest of this flow prints dates in.
});

/**
 * "August 31, 2026" — the same day in the order an American family reads it.
 *
 * The date half of the house style (#110). It sits beside {@link fullDateLabel}
 * rather than replacing it because the conversion is being done a flow at a
 * time: the Apply flow reads American now (#113), and the calendar, the news
 * and the admin still read British until their own batches move them here. When
 * the last caller has moved, this becomes the only one and the British form
 * goes.
 *
 * Parsed as UTC for the same reason its neighbour is — see there.
 */
export function americanDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Errors keyed by the form field that caused them; empty means the year saves. */
export type SchoolYearErrors = Record<string, string>;

/**
 * What a school year has to be before it is worth computing from.
 *
 * The rule that is *not* here is the one worth naming: **there is no rule that
 * every track must be present.** A year in which the Tuesday track has no first
 * class date and no courses is complete, and the school confirmed on #14 that
 * this is data it types rather than a fact to bake in. A validator that
 * required eight terms would be the site refusing to record a real year.
 */
export function validateSchoolYear(year: SchoolYear): SchoolYearErrors {
  const errors: SchoolYearErrors = {};

  if (!year.label.trim()) errors.label = 'Name the year — “2026–2027”, as it is on the sheets.';

  for (const term of year.terms) {
    const key = `${term.semester}.${term.track}`;

    if (!isCalendarDate(term.firstClassDate)) {
      errors[`${key}.firstClassDate`] = 'Give the first class date as a day on the calendar.';
    } else {
      const falls = trackOfDate(term.firstClassDate);
      if (falls !== term.track) {
        errors[`${key}.firstClassDate`] =
          `That is a ${falls ?? weekdayName(term.firstClassDate)}. The ${term.track} track starts on a ${term.track}.`;
      }
    }

    if (!Number.isInteger(term.weeks) || term.weeks < 1) {
      errors[`${key}.weeks`] = 'A semester runs for at least one week of classes.';
    }

    if (term.semester === 'spring') {
      const fall = year.terms.find((one) => one.track === term.track && one.semester === 'fall');
      if (fall && term.firstClassDate <= fall.firstClassDate) {
        errors[`${key}.firstClassDate`] = 'The spring starts after the fall does.';
      }
    }
  }

  year.closures.forEach((closure, index) => {
    if (!isCalendarDate(closure.date)) {
      errors[`closures.${index}.date`] = 'Give the closed day as a day on the calendar.';
    }
    if (!closure.label.trim()) {
      errors[`closures.${index}.label`] =
        'Say what the school is closed for — the sheet prints the name beside the gap.';
    }
  });

  return errors;
}

/**
 * Today, as the school's own day — `YYYY-MM-DD` in {@link SCHOOL_TIMEZONE}.
 *
 * The one date on the calendar that is *not* parsed as UTC, and the exception is
 * the point: every other date here is a day the school typed, and this is the
 * day it currently is. Read from the clock at 8pm in Enola, UTC has already
 * turned over, and anything comparing a stored date against it is a day ahead of
 * the families reading the page.
 *
 * `en-CA` because its long-standing format is `YYYY-MM-DD` — the same shape the
 * stored dates have, so the two compare as strings with nothing to parse.
 */
export function schoolToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * An instant, as the day and the time it is **in Enola** (#153).
 *
 * The inverse of `schoolTimeToUtc` in `ics.ts`, and the direction the incoming
 * Google calendar needs: that feed states its timed events as UTC instants, and
 * a fundraiser stored from `20260819T210000Z` without this conversion is a
 * fundraiser the page announces for 9pm.
 *
 * The date crosses as readily as the time does — an event at 8pm in Enola is
 * already tomorrow in UTC — so the two are returned together and from one
 * format pass, rather than left to a caller to combine and get wrong at
 * midnight.
 */
export function schoolWallClock(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);

  const of = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${of('year')}-${of('month')}-${of('day')}`,
    // `h23` still prints midnight as `24` in some ICU versions. The date is
    // already right; only the hour needs bringing back into range.
    time: `${of('hour') === '24' ? '00' : of('hour')}:${of('minute')}`,
  };
}

/** `YYYY-MM-DD` plus seven days, as `YYYY-MM-DD`. UTC throughout. */
export function addDays(date: string, days: number): string {
  const stepped = new Date(`${date}T00:00:00Z`);
  stepped.setUTCDate(stepped.getUTCDate() + days);
  return stepped.toISOString().slice(0, 10);
}

/**
 * A real day on the calendar, not merely four digits and two dashes.
 *
 * The same check the announcements and the money settings make, and for the
 * same reason: `2026-02-30` passes a pattern and is not a date. Here it would
 * be a closure that never arrives and a week that never comes off.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** "Friday" — for the days that are not a track's, in the error that says so. */
function weekdayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}
