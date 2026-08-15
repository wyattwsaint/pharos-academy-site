import { parseIcalEvents, unescapeIcalText, type IcalEvent } from './ical.js';
import { schoolWallClock } from './year.js';

/**
 * The school's Google calendar, turned into this site's one-offs (#153).
 *
 * The school keeps its calendar in Google and wants to go on keeping it there.
 * Everything in this module is the translation between that calendar and the
 * site's own vocabulary — and the translation is deliberately lossy in one
 * direction, because Google carries things this site must not restate.
 *
 * **The school year is not read from here.** The live calendar carries four
 * weekly "Classes in session" series, one per day track, and this sync skips
 * every one of them. The meeting dates are computed from eight numbers on the
 * admin's School Year screen (`year.ts`) and the four tracks do not align;
 * restating them from a Google recurrence would put a second, disagreeing
 * source of truth beside the first. The Tuesday series is the
 * proof — it is in Google and the Tuesday track is routinely empty.
 *
 * What is read is the **one-offs**: fundraisers, board meetings, parent
 * information evenings. Those are exactly the rows an admin would otherwise be
 * retyping, which is the whole of what the ticket asks for.
 */

/** Google's own address for a public calendar, by its id. */
const GOOGLE_ICAL_BASE = 'https://calendar.google.com/calendar/ical';

/**
 * Where to read the calendar, from whatever the environment holds.
 *
 * Two accepted shapes, because the school has two ways to make its calendar
 * readable and this site should not care which it picked. A bare **calendar
 * id** — `pharosacademy.net@gmail.com` — is the public route and the one the
 * school took; a whole **URL** is the secret iCal address, for a calendar that
 * is not public. Neither is a credential this repository holds: both live in
 * the deployment's environment, as `GOOGLE_CALENDAR_ID` in `docs/handoff.md`.
 *
 * An address that is neither is refused loudly rather than fetched. The value
 * comes from an environment variable somebody typed, and a typo that silently
 * fetches a stranger's URL is a page publishing a stranger's events.
 */
export function googleFeedUrl(idOrUrl: string): string {
  const value = idOrUrl.trim();

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com') {
      throw new Error(
        `A calendar URL must be an https address on calendar.google.com. Got "${value}".`,
      );
    }
    return value;
  }

  if (!value.includes('@')) {
    throw new Error(
      `"${value}" is neither a Google calendar id nor an https calendar address.`,
    );
  }

  return `${GOOGLE_ICAL_BASE}/${encodeURIComponent(value)}/public/basic.ics`;
}

/**
 * One of the school's one-offs as Google holds it.
 *
 * Keyed on `uid` — Google's own identity for the event, which survives a
 * retitle and a move. That is what makes "an event amended in Google is amended
 * on the site" an amendment rather than a delete and a re-add, and it is why
 * the key is not the date-and-title slug an admin-entered event gets.
 */
export type SyncedEvent = {
  /** Google's UID, verbatim. The primary key of `synced_events`. */
  uid: string;
  /** `YYYY-MM-DD`, in the school's own timezone. */
  heldOn: string;
  title: string;
  /** `HH:MM`, 24-hour, in the school's timezone. Null is a whole day. */
  startTime: string | null;
  place: string | null;
  note: string | null;
};

/**
 * The titles Google states the school year under, which this sync never carries.
 *
 * A second rule beside the recurrence one, and it is needed because the
 * recurrence rule only catches four of the six: the calendar also holds a plain
 * "Classes in session" on 2026-09-14 and a plain "First day of classes" on
 * 2026-08-31, neither recurring and both restating dates the School Year screen
 * computes from eight numbers.
 *
 * **Matched on the whole title, not on a phrase inside one.** "Come and see
 * classes in session" is an open house and is published; the two exact titles
 * are Google's own wording for the year and are not.
 *
 * Rejected: skipping on `TRANSP:TRANSPARENT`, which all six carry. It is a flag
 * anybody can flip from Google's own interface without knowing it means
 * anything here, and its failure mode is a real fundraiser vanishing from the
 * page with nothing said. This list fails the other way — a term-date title
 * nobody anticipated publishes as a visible duplicate somebody notices and
 * reports.
 */
const TERM_DATE_TITLES: readonly string[] = ['classes in session', 'first day of classes'];

/** What was left behind, and why. Reported into the cron log, never silent. */
export type SkippedCounts = {
  /**
   * A series, or one instance of one — the school year's business, not this
   * sync's.
   *
   * Both halves, because Google states a moved or edited instance as its own
   * VEVENT carrying a `RECURRENCE-ID` and the *series'* UID. Publishing one
   * would put a stray Wednesday on the page with no series around it, and
   * because the UID is the key here, two instances of one series read together
   * would be two rows claiming one primary key.
   */
  recurring: number;
  /** Titled as the school year, however it recurs. See {@link TERM_DATE_TITLES}. */
  termDates: number;
  /** `STATUS:CANCELLED`. A cancelled event is a family driving to a dark school. */
  cancelled: number;
  /** No identity, no date or no title. Nothing publishable in it. */
  unusable: number;
};

export type GoogleCalendarRead = {
  events: SyncedEvent[];
  skipped: SkippedCounts;
};

/**
 * Every publishable one-off in a calendar body.
 *
 * Total: nothing here throws on a bad event, because one malformed entry in a
 * calendar of thirty must not cost the school the other twenty-nine. What it
 * cannot use it counts, and the count is what the cron route reports.
 */
export function readGoogleCalendar(body: string): GoogleCalendarRead {
  const events: SyncedEvent[] = [];
  const skipped: SkippedCounts = { recurring: 0, termDates: 0, cancelled: 0, unusable: 0 };

  for (const raw of parseIcalEvents(body)) {
    // Order matters only for the counts: a cancelled series is reported as
    // recurring, which is the more useful thing to know about it.
    if (raw.RRULE || raw['RECURRENCE-ID']) {
      skipped.recurring += 1;
      continue;
    }
    if (raw.STATUS?.value.toUpperCase() === 'CANCELLED') {
      skipped.cancelled += 1;
      continue;
    }

    const event = toSyncedEvent(raw);
    if (!event) {
      skipped.unusable += 1;
      continue;
    }
    if (TERM_DATE_TITLES.includes(event.title.toLowerCase())) {
      skipped.termDates += 1;
      continue;
    }
    events.push(event);
  }

  return { events, skipped };
}

/** One VEVENT, or undefined where it is missing something it cannot be published without. */
function toSyncedEvent(raw: IcalEvent): SyncedEvent | undefined {
  const uid = raw.UID?.value.trim();
  const title = tidy(text(raw.SUMMARY?.value));
  const when = raw.DTSTART && startOf(raw.DTSTART.value, raw.DTSTART.params);
  if (!uid || !title || !when) return undefined;

  return {
    uid,
    title,
    heldOn: when.heldOn,
    startTime: when.startTime,
    place: tidy(text(raw.LOCATION?.value)) || null,
    note: tidy(text(raw.DESCRIPTION?.value)) || null,
  };
}

/**
 * DTSTART, as the day and the time the school means.
 *
 * Three shapes arrive, and the difference between them is the difference
 * between a fundraiser at 5pm and a fundraiser at 9pm:
 *
 * - `VALUE=DATE:20260831` — a whole day. No time, and its absence is real.
 * - `20260819T210000Z` — a **UTC instant**, which is what Google's public feed
 *   emits for everything timed. Converted through the school's own zone, date
 *   included: an event at 8pm in Enola is already tomorrow in UTC.
 * - `TZID=…:20260819T170000` — a floating wall clock. Read as the clock it
 *   says. The school is in one timezone and its calendar is set to it, so
 *   resolving an arbitrary TZID would be machinery for a case that cannot
 *   arise; a wrong-by-an-hour event would be visible on the page.
 */
function startOf(
  value: string,
  params: Record<string, string>,
): { heldOn: string; startTime: string | null } | undefined {
  const date = value.slice(0, 8);
  if (!/^\d{8}$/.test(date)) return undefined;
  const heldOn = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

  if (params.VALUE === 'DATE' || value.length === 8) return { heldOn, startTime: null };

  const time = value.slice(9, 13);
  if (value[8] !== 'T' || !/^\d{4}$/.test(time)) return undefined;
  const wallClock = `${time.slice(0, 2)}:${time.slice(2, 4)}`;

  if (!value.endsWith('Z')) return { heldOn, startTime: wallClock };

  const instant = new Date(`${heldOn}T${wallClock}:00Z`);
  if (Number.isNaN(instant.getTime())) return undefined;
  const local = schoolWallClock(instant);
  return { heldOn: local.date, startTime: local.time };
}

/** A text property, unescaped. Empty for one that is not there. */
function text(value: string | undefined): string {
  return value === undefined ? '' : unescapeIcalText(value);
}

/**
 * The school's own words, with only the whitespace tidied.
 *
 * A title in the live calendar reads `Fundraiser at Texas Roadhouse:  3-10pm --`
 * with a double space and a trailing one. Collapsing runs and trimming the ends
 * is the whole of what is done to it: this is the school's copy and the house
 * style does not reach it (CONTEXT.md, *verbatim copy*). Rewriting the dashes
 * or the capitals here would be this site editing the school's calendar from
 * the outside, where nobody at the school could see the change or undo it.
 */
function tidy(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/**
 * The address a synced event has on this site.
 *
 * Derived from Google's UID rather than from the date and the title, which is
 * what an admin-entered event uses (`eventSlug`). The difference is deliberate:
 * a slug built from the title changes when the title does, and this site would
 * then remove one event and add another every time somebody at the school fixed
 * a typo — visible to a subscriber as a deletion and a new invitation.
 *
 * Prefixed, and reduced to characters that are safe in a URL fragment and in an
 * iCalendar UID, because Google's identity for an event is opaque and this one
 * ends up in both.
 */
export function syncedEventSlug(uid: string): string {
  const local = uid
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `google-${local || 'event'}`;
}
