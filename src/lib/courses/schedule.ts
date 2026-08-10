/**
 * The week as time, not as rows.
 *
 * The live site's timetable is a list of consecutive rows, and that is the one
 * known way it misstates the school's own schedule (#22): Monday's *God Made
 * Everything* (9:00–10:30) and *Principles of Drawing* (10:10–11:10) overlap by
 * twenty minutes, and *Kingdom Math* (10:40–12:10) overlaps *Algebra 1*
 * (11:20–12:20) by fifty. Drawn as consecutive rows, a parent plans around an
 * overlap that is really there and is wrong.
 *
 * So the model here is time-proportional. Every course is an interval in
 * minutes; a day is laid out by packing those intervals into lanes, exactly as
 * a calendar does. Two courses that overlap in time cannot land in one lane, so
 * the layout *cannot* draw them as consecutive — the geometry carries the fact,
 * rather than a warning string carrying it.
 *
 * Nothing here flags anything. The Wednesday 10:40 slot carries five electives
 * by design (CONTEXT.md, "clash"), and oversubscription is not an error: it
 * gets five lanes and no message. A *clash* — which needs term overlap too — is
 * the application flow's job, not the catalogue's.
 */

import type { Course } from './course.js';

/**
 * The school's four day tracks, in calendar order (CONTEXT.md, "day track").
 *
 * All four, not the three that currently run: a track with no courses is
 * **complete, not incomplete**, and the Tuesday track is routinely empty. The
 * canonical list lives here, next to the intervals, and the homepage timetable
 * imports it rather than keeping a second copy.
 */
export const DAY_TRACKS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] as const;
export type DayTrack = (typeof DAY_TRACKS)[number];

/**
 * `HH:MM` on a 24-hour clock — the shape every stored time already has.
 *
 * Here rather than in the admin parser because two callers now ask it: the
 * parser, to refuse a badly typed time, and the editor's form view, to know
 * whether there is yet a real slot to check for clashes. `minutesOfDay` throws
 * on anything else, so asking first is how a half-typed form stays quiet.
 */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** `HH:MM` on a 24-hour clock to minutes past midnight. */
export function minutesOfDay(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Not an HH:MM time: ${time}`);
  const [, hours, mins] = match as unknown as [string, string, string];
  return Number(hours) * 60 + Number(mins);
}

/** How long one meeting runs, in hours. 90 minutes is 1.5. */
export function meetingHours(course: Course): number {
  return (minutesOfDay(course.end) - minutesOfDay(course.start)) / 60;
}

/**
 * Contact hours for the whole course — the number the price is computed from.
 *
 * Derived, never typed: weeks × meetings a week × the length of a meeting.
 * Algebra 1 meets twice a week for 28 weeks of one hour, which is the 56 the
 * school publishes; a typed 56 would be a second place for that to be wrong.
 */
export function contactHours(course: Course): number {
  return course.weeks * course.days.length * meetingHours(course);
}

/**
 * The school's own way of writing a meeting time — "9:00-10:00 a.m.",
 * "11:20 a.m.-12:20 p.m.".
 *
 * Derived from the two 24-hour times rather than stored, and the meridiem is
 * written once when both ends share it and twice when they do not, which is
 * precisely the school's own habit. `catalogue.test.ts` regenerates all
 * nineteen of these and compares them against the published strings.
 */
export function timeLabel(start: string, end: string): string {
  const from = clockParts(start);
  const to = clockParts(end);
  return from.meridiem === to.meridiem
    ? `${from.clock}-${to.clock} ${to.meridiem}`
    : `${from.clock} ${from.meridiem}-${to.clock} ${to.meridiem}`;
}

function clockParts(time: string): { clock: string; meridiem: 'a.m.' | 'p.m.' } {
  const total = minutesOfDay(time);
  const hours24 = Math.floor(total / 60);
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mins = String(total % 60).padStart(2, '0');
  return { clock: `${hours}:${mins}`, meridiem: hours24 < 12 ? 'a.m.' : 'p.m.' };
}

/** Real overlap, not adjacency: 10:00–11:00 and 11:00–12:00 do not overlap. */
export function overlaps(a: Course, b: Course): boolean {
  return (
    minutesOfDay(a.start) < minutesOfDay(b.end) && minutesOfDay(b.start) < minutesOfDay(a.end)
  );
}

/** Every pair of courses on one day track whose meeting times overlap. */
export function overlappingPairs(courses: readonly Course[]): [Course, Course][] {
  const pairs: [Course, Course][] = [];
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const a = courses[i] as Course;
      const b = courses[j] as Course;
      if (overlaps(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** The courses meeting on one day track, earliest first. */
export function coursesOnTrack(courses: readonly Course[], track: DayTrack): Course[] {
  return courses
    .filter((course) => course.days.includes(track))
    .sort(
      (a, b) =>
        minutesOfDay(a.start) - minutesOfDay(b.start) ||
        minutesOfDay(a.end) - minutesOfDay(b.end) ||
        a.title.localeCompare(b.title),
    );
}

/** The day tracks that actually run a class. An empty track is not drawn. */
export function activeTracks(courses: readonly Course[]): DayTrack[] {
  return DAY_TRACKS.filter((track) => courses.some((course) => course.days.includes(track)));
}

/** One course, placed: where it starts, how long it runs, and in which lane. */
export type PlacedCourse = {
  course: Course;
  /** Minutes past midnight. */
  startMinutes: number;
  endMinutes: number;
  /** 0-based column within the day. Overlapping courses never share one. */
  lane: number;
};

export type DayLayout = {
  track: DayTrack;
  /** The extent the day is drawn over, rounded out to the half hour. */
  startMinutes: number;
  endMinutes: number;
  /** How many lanes the day needs — its busiest moment, by count. */
  laneCount: number;
  /** Half-hour marks between `startMinutes` and `endMinutes`, inclusive. */
  marks: number[];
  placed: PlacedCourse[];
};

/** The half hour a day is drawn from and to, so the axis lands on round marks. */
const MARK_INTERVAL = 30;

/**
 * Lay out one day track.
 *
 * Lanes are assigned greedily in start order: a course takes the leftmost lane
 * whose previous occupant has already finished. That is the standard interval
 * packing, and its one guarantee is the one that matters here — two courses
 * that overlap in time are never given the same lane, so the rendering cannot
 * present them as consecutive even if someone later restyles it.
 */
export function layoutDay(courses: readonly Course[], track: DayTrack): DayLayout {
  const onTrack = coursesOnTrack(courses, track);
  const laneEnds: number[] = [];
  const placed: PlacedCourse[] = onTrack.map((course) => {
    const startMinutes = minutesOfDay(course.start);
    const endMinutes = minutesOfDay(course.end);
    let lane = laneEnds.findIndex((end) => end <= startMinutes);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endMinutes;
    return { course, startMinutes, endMinutes, lane };
  });

  const startMinutes = floorTo(Math.min(...placed.map((item) => item.startMinutes)), MARK_INTERVAL);
  const endMinutes = ceilTo(Math.max(...placed.map((item) => item.endMinutes)), MARK_INTERVAL);

  const marks: number[] = [];
  for (let mark = startMinutes; mark <= endMinutes; mark += MARK_INTERVAL) marks.push(mark);

  return { track, startMinutes, endMinutes, laneCount: laneEnds.length, marks, placed };
}

/** Every day that runs a class, laid out. */
export function layoutWeek(courses: readonly Course[]): DayLayout[] {
  return activeTracks(courses).map((track) => layoutDay(courses, track));
}

/** A mark on the axis, as the school would write it: "10:40 a.m.". */
export function markLabel(minutes: number): string {
  const parts = clockParts(
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  );
  return `${parts.clock} ${parts.meridiem}`;
}

function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}
