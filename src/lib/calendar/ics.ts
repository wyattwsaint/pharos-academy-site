import { addDays, meetingsOf, type Meeting, type SchoolYear } from './year.js';
import { TIMED_EVENT_MINUTES, type CalendarEvent } from './event.js';

/**
 * `pharosacademy.net/calendar.ics` — the feed the school owns (#23).
 *
 * The subscribe link is the point of this module, and the address is the point
 * of the link: a parent subscribes to *the school's* URL, so the school can
 * change what is behind it forever without asking anyone to resubscribe. That
 * is the whole reason there is no calendar vendor here.
 *
 * Generated from the school year and the events, never stored. Regenerating it
 * an hour later produces the same UIDs against the same data — a client updates
 * events rather than duplicating them — and a different DTSTAMP, which RFC 5545
 * requires and which is what tells a client the feed was re-issued.
 */

/** What produced the file. A client shows this when something goes wrong. */
export const CALENDAR_PRODID = '-//Pharos Academy//School Calendar//EN';

/** The namespace every UID ends in. The school's domain, because it is the school's feed. */
export const UID_DOMAIN = 'pharosacademy.net';

/**
 * Where the school is, for the times it publishes.
 *
 * Timed events are emitted as UTC instants computed against this zone rather
 * than as floating local times with a VTIMEZONE beside them. Both are valid;
 * this one cannot be misread by a client whose zone database disagrees with
 * ours, and it needs no second component to stay in step.
 */
export const SCHOOL_TIMEZONE = 'America/New_York';

export type FeedInput = {
  year: SchoolYear;
  events: readonly CalendarEvent[];
  /** The moment the feed is generated — every DTSTAMP. Injected so tests can fix it. */
  now: Date;
};

/** The whole feed, CRLF-terminated and folded, ready to serve. */
export function renderCalendarFeed({ year, events, now }: FeedInput): string {
  const stamp = utcStamp(now);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${CALENDAR_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Pharos Academy — ${escapeText(year.label)}`,
    `X-WR-TIMEZONE:${SCHOOL_TIMEZONE}`,
    ...meetingsOf(year).flatMap((meeting) => meetingEvent(meeting, stamp)),
    ...events.flatMap((event) => oneOffEvent(event, stamp)),
    'END:VCALENDAR',
  ];

  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/**
 * One class day, as the whole day it is.
 *
 * A meeting is deliberately not given the times its courses run at: a family
 * whose child takes one 9am class should not have their calendar claim the
 * school day runs 9:00 to 15:10. The day is the fact the calendar carries; the
 * times are on the class page, where they belong to a course rather than to a
 * date.
 *
 * The summary names the track and that track's own week number, because that is
 * the thing the five PDFs exist to tell a family and the thing a flat calendar
 * loses: "Pharos Wednesday — Week 10" is 4 November, and Monday's week 10 is
 * five days later.
 */
function meetingEvent(meeting: Meeting, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:meeting-${meeting.track.toLowerCase()}-${meeting.date}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(meeting.date)}`,
    // Exclusive, as RFC 5545 requires for a whole-day event: the day after.
    `DTEND;VALUE=DATE:${compact(addDays(meeting.date, 1))}`,
    `SUMMARY:${escapeText(`Pharos ${meeting.track} — Week ${meeting.week}`)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/** One of the school's one-offs — timed if it has a time, a whole day if not. */
function oneOffEvent(event: CalendarEvent, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:event-${event.slug}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    ...whenLines(event),
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.place) lines.push(`LOCATION:${escapeText(event.place)}`);
  if (event.note) lines.push(`DESCRIPTION:${escapeText(event.note)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * DTSTART and DTEND for an event.
 *
 * With a time, the pair is an hour of real time in the school's zone
 * (`TIMED_EVENT_MINUTES`); without one, it is the whole day. There is no third
 * case: an event with a start and no end is what a client draws as a hairline
 * and a parent reads as a bug.
 */
function whenLines(event: CalendarEvent): string[] {
  if (!event.startTime) {
    return [
      `DTSTART;VALUE=DATE:${compact(event.heldOn)}`,
      `DTEND;VALUE=DATE:${compact(addDays(event.heldOn, 1))}`,
    ];
  }

  const start = schoolTimeToUtc(event.heldOn, event.startTime);
  const end = new Date(start.getTime() + TIMED_EVENT_MINUTES * 60_000);
  return [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];
}

/**
 * A wall-clock time in Enola, as the instant it actually is.
 *
 * Resolved through `Intl` rather than through a hard-coded −5/−4, because the
 * school's own calendar crosses two changeovers a year: an open house at 6.30
 * in October is 22:30 UTC and the same 6.30 in January is 23:30. Two passes,
 * because the offset depends on the instant and the instant depends on the
 * offset — the second pass settles anything the first got wrong at a boundary.
 */
export function schoolTimeToUtc(date: string, time: string): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);
  let instant = new Date(naive - zoneOffsetMs(new Date(naive)));
  instant = new Date(naive - zoneOffsetMs(instant));
  return instant;
}

/** How far ahead of UTC the school's zone is at a given instant, in ms. */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((all, part) => {
      all[part.type] = part.value;
      return all;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** `20261017T223000Z` — an instant, as iCalendar writes one. */
export function utcStamp(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** `2026-08-31` → `20260831`. */
function compact(date: string): string {
  return date.replace(/-/g, '');
}

/**
 * What iCalendar reserves inside a text value.
 *
 * Backslash first, or the escapes this adds would themselves be escaped. A
 * newline becomes a literal `\n`, because a real one would end the property and
 * make the rest of the note a line a client cannot parse.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold one line to 75 octets, continuing with a single space.
 *
 * Counted in **octets, not characters**, which is the whole difficulty: the
 * school's own copy is full of em dashes and curly apostrophes, and a fold
 * placed by character count both overruns the limit and can split a multi-byte
 * character down the middle — which is a line a client drops.
 */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let cursor = 0;
  // 75 for the first piece; 74 thereafter, since each continuation adds a space.
  let limit = 75;
  while (cursor < bytes.length) {
    let end = Math.min(cursor + limit, bytes.length);
    // Never split a UTF-8 sequence: back up off any continuation byte.
    while (end < bytes.length && (bytes[end]! & 0b1100_0000) === 0b1000_0000) end -= 1;
    pieces.push(bytes.subarray(cursor, end).toString('utf8'));
    cursor = end;
    limit = 74;
  }

  return pieces.join('\r\n ');
}

/** Put a folded feed back together — what a client does first, and what the tests do. */
export function unfold(text: string): string {
  return text.replace(/\r\n /g, '');
}
