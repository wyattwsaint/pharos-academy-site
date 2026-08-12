import { fullDateLabel, schoolToday } from './year.js';

/**
 * A one-off on the school's calendar (#23).
 *
 * Deliberately a different shape from the term dates. A meeting date is one of
 * 112 computed from eight numbers and belongs to a day track; an event is a
 * concert, a picture day or a parents' evening, happens once, and belongs to
 * nothing. Forcing the two into one model would give every meeting a place and
 * a note it never has, and every event a week number that means nothing.
 *
 * The time is optional and its absence is a real state — "Field day, 12 May" is
 * a complete event. So are a missing place and a missing note.
 */

export type CalendarEvent = {
  /** `2026-10-17-fall-open-house` — the date first, so the list sorts itself. */
  slug: string;
  /** `YYYY-MM-DD`. */
  heldOn: string;
  title: string;
  /** `HH:MM`, 24-hour. Null is an all-day event, not an unfinished one. */
  startTime: string | null;
  place: string | null;
  note: string | null;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** An event as the seed writes it — everything but the stamp, which is a save. */
export type SeedEvent = Omit<CalendarEvent, 'lastEditedBy' | 'lastEditedAt'>;

/**
 * What the school has on the calendar today, carried from its own material.
 *
 * Seeded for the reason the announcements and the policies are: the school has
 * a real event days away, and a calendar page that says nothing is scheduled
 * while it is being planned is the site being wrong in public (#146). Jill
 * edits or removes it from the Events screen like any other row — the seed is
 * the starting point, not the truth.
 *
 * **The time, the place and the note are all absent, and none of them is
 * unfinished.** The school published a name and a day and has published nothing
 * else, so this is the whole event; inventing an hour or a branch address would
 * put a family outside the wrong restaurant at the wrong time. Each is a field
 * Jill fills in when the school confirms it.
 */
export const SEEDED_EVENTS: readonly SeedEvent[] = [
  {
    slug: '2026-08-19-chick-fil-a-dine-to-donate',
    heldOn: '2026-08-19',
    title: 'Chick-fil-A dine-to-donate',
    startTime: null,
    place: null,
    note: null,
  },
] as const;

/**
 * The events still ahead, in the order they were given (#146).
 *
 * An event is kept through the whole of its own day and dropped the morning
 * after, which is the boundary the school would draw: a fundraiser is at its
 * most useful to a family on the morning it happens, and a calendar that has
 * already forgotten tonight's event is a calendar nobody trusts by lunchtime.
 *
 * Read from the clock rather than written by a job, for the reason ADR-0008
 * gives about an overdue cheque: a nightly job that stops running leaves the
 * page advertising a fundraiser that has been and gone, and nobody notices
 * until a family turns up.
 *
 * The **page** filters and the **feed** does not. A subscribed calendar is a
 * record of the year and its clients drop what is past on their own; a page is
 * what is on.
 */
export function upcomingEvents<T extends { heldOn: string }>(
  events: readonly T[],
  now: Date,
): T[] {
  const today = schoolToday(now);
  return events.filter((event) => event.heldOn >= today);
}

/** What a save may change. The slug is the key and is not one of them. */
export type CalendarEventEdit = {
  heldOn: string;
  title: string;
  startTime: string | null;
  place: string | null;
  note: string | null;
};

/**
 * How long a timed event runs on a subscribed calendar: one hour.
 *
 * The school types a start time and nothing else, because that is what it
 * publishes — "Open house, 6:30" is the whole notice. An hour is the shape that
 * puts a readable block on a parent's phone; a zero-length event is drawn as a
 * hairline by most clients and read as a bug. The admin screen says this in
 * words rather than leaving it to be discovered.
 */
export const TIMED_EVENT_MINUTES = 60;

/**
 * The address of a new event: its date, then its title.
 *
 * Dated first so the admin list and the slug agree about order, and so two
 * "Picture day"s in one year are two different rows rather than a collision.
 */
export function eventSlug(heldOn: string, title: string): string {
  const words = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return words ? `${heldOn}-${words}` : heldOn;
}

/**
 * "17 October 2026" — how a date is printed wherever an event is shown.
 *
 * The same format, and the same function, a meeting date is printed in: one
 * date format on the calendar, in one place.
 */
export { fullDateLabel as eventDateLabel };

/**
 * "6.30pm" — the school's own way of writing a time, from `HH:MM`.
 *
 * Not `18:30`, which no American school publishes, and not "6:30 PM", which is
 * not how the existing site writes it either.
 */
export function eventTimeLabel(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number) as [number, number];
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour}${suffix}` : `${hour}.${String(minutes).padStart(2, '0')}${suffix}`;
}
