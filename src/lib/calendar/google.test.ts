import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { googleFeedUrl, readGoogleCalendar, syncedEventSlug } from './google.js';

/**
 * The school's own calendar, read the way the sync reads it (#153).
 *
 * The fixture is `docs/mirror/data/google-calendar.ics`, captured whole from
 * the live feed rather than written here. That is the point of it: the shapes
 * that break a reader are the ones a real calendar has and an invented one does
 * not — folded titles, escaped addresses, four weekly series, an event with a
 * trailing double space in its title.
 */

const fixture = await readFile('docs/mirror/data/google-calendar.ics', 'utf8');

describe('the address of the feed', () => {
  it('builds the public ICS address from a calendar id', () => {
    expect(googleFeedUrl('pharosacademy.net@gmail.com')).toBe(
      'https://calendar.google.com/calendar/ical/pharosacademy.net%40gmail.com/public/basic.ics',
    );
  });

  it('escapes an id, because a group calendar id is an address with an @ in it', () => {
    expect(googleFeedUrl('abc123@group.calendar.google.com')).toContain(
      'abc123%40group.calendar.google.com',
    );
  });

  it('takes a whole URL as given, so a secret iCal address still works', () => {
    const secret = 'https://calendar.google.com/calendar/ical/abc/private-9f8e/basic.ics';
    expect(googleFeedUrl(secret)).toBe(secret);
  });

  it('trims what somebody pasted into the environment', () => {
    expect(googleFeedUrl('  pharosacademy.net@gmail.com \n')).toBe(
      googleFeedUrl('pharosacademy.net@gmail.com'),
    );
  });

  it('refuses an address that is not Google and not obviously a calendar', () => {
    expect(() => googleFeedUrl('http://example.com/evil')).toThrow(/https/);
  });
});

describe('reading the school’s calendar', () => {
  const read = () => readGoogleCalendar(fixture);

  it('reads every one-off the school has published', () => {
    const { events } = read();
    // Twenty-four VEVENTs, less the four weekly "Classes in session" series and
    // the two term-date statements that recur not at all.
    expect(events).toHaveLength(18);
  });

  it('puts a timed event at the hour it is in Enola, not the hour it is in UTC', () => {
    const chickFilA = read().events.find((event) => event.title.startsWith('Chick-fil-A'));

    // DTSTART:20260819T210000Z — nine in the evening UTC, five in the
    // afternoon in Enola, on a date that has not yet turned over.
    expect(chickFilA).toMatchObject({ heldOn: '2026-08-19', startTime: '17:00' });
  });

  it('keeps an all-day event as a whole day with no time, which is a real state', () => {
    const mcallisters = read().events.find((event) => event.title.startsWith('Fundraiser at McC'));

    expect(mcallisters).toMatchObject({ heldOn: '2026-04-23', startTime: null });
  });

  it('unescapes an address the school typed with commas in it', () => {
    const board = read().events.find((event) => event.title === 'Pharos Academy School Board Meeting');

    expect(board?.place).toBe('Enola First Church of God, 9 Sherwood Dr, Enola, PA 17025, USA');
  });

  it('carries the school’s own description across as the note', () => {
    const note = read().events.find((event) => event.note)?.note;

    expect(note).toContain('A percentage of your purchase will go towards Pharos Academy.');
  });

  it('leaves a missing place and a missing description null rather than empty', () => {
    const panera = read().events.find((event) => event.title === 'Panera Bread Fundraiser');

    expect(panera?.place).toBeNull();
    expect(panera?.note).toBeNull();
  });

  it('reads a title that Google folded across two lines back as one', () => {
    const titles = read().events.map((event) => event.title);

    expect(titles).toContain(
      'Pharos Academy Reps Making a Presentation at Eastern Regional Conference',
    );
  });

  it('tidies the whitespace the school left on a title, and changes nothing else', () => {
    const roadhouse = read().events.find((event) => event.title.includes('Texas Roadhouse'));

    // Typed as `Fundraiser at Texas Roadhouse:  3-10pm -- ` — two spaces and a
    // trailing dash. The trailing space goes; the school’s own words stay.
    expect(roadhouse?.title).toBe('Fundraiser at Texas Roadhouse: 3-10pm --');
  });

  it('keys each event on the identity Google gave it, not on its title', () => {
    const chickFilA = read().events.find((event) => event.title.startsWith('Chick-fil-A'));

    expect(chickFilA?.uid).toBe('5jbbma4mv3fodj7v1banr43b1o@google.com');
  });
});

describe('what the sync deliberately does not carry', () => {
  it('skips the four weekly class series, because the school year owns those dates', () => {
    const { events, skipped } = readGoogleCalendar(fixture);

    expect(skipped.recurring).toBe(4);
    // The four series are "Classes in session" on Monday, Tuesday, Wednesday
    // and Thursday — the day tracks, which the admin’s School Year screen
    // computes from eight numbers and which this sync must never restate.
    expect(events.some((event) => event.uid === '0e07ofasob1pfmv1ofd4o2v1oa@google.com')).toBe(
      false,
    );
  });

  it('skips one moved evening out of a series, because the series itself is skipped', () => {
    // Google states a rescheduled instance as its own VEVENT carrying a
    // RECURRENCE-ID and the *series'* UID. Publishing it would put a lone
    // Wednesday on the page with no series around it — and, since the UID is
    // the key, would collide with any other instance in the same read.
    const { events, skipped } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:series@google.com',
        'RECURRENCE-ID;VALUE=DATE:20260916',
        'DTSTART;VALUE=DATE:20260917',
        'SUMMARY:Chess club',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events).toEqual([]);
    expect(skipped.recurring).toBe(1);
  });

  it('skips the term dates Google states without recurring, which the RRULE rule misses', () => {
    const { events, skipped } = readGoogleCalendar(fixture);
    const titles = events.map((event) => event.title);

    // "Classes in session" on 2026-09-14 and "First day of classes" on
    // 2026-08-31 are both plain one-offs in Google, and both restate the year
    // the School Year screen computes.
    expect(titles).not.toContain('Classes in session');
    expect(titles).not.toContain('First day of classes');
    expect(skipped.termDates).toBe(2);
  });

  it('skips a term-date title whatever case and spacing the school typed it in', () => {
    const { events, skipped } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:shouted@google.com',
        'DTSTART;VALUE=DATE:20260914',
        'SUMMARY:CLASSES IN SESSION ',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events).toEqual([]);
    expect(skipped.termDates).toBe(1);
  });

  it('keeps an event that merely mentions classes, because only the exact titles are the year', () => {
    const { events } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:open-house@google.com',
        'DTSTART;VALUE=DATE:20260914',
        'SUMMARY:Come and see classes in session',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events).toHaveLength(1);
  });

  it('skips a cancelled event rather than announcing one', () => {
    const { events, skipped } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:gone@google.com',
        'DTSTART;VALUE=DATE:20260914',
        'SUMMARY:Concert',
        'STATUS:CANCELLED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events).toEqual([]);
    expect(skipped.cancelled).toBe(1);
  });

  it('skips an event with no identity, no date or no title rather than storing a blank', () => {
    const { events, skipped } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:no-date@google.com',
        'SUMMARY:Concert',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:no-title@google.com',
        'DTSTART;VALUE=DATE:20260914',
        'SUMMARY:   ',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20260914',
        'SUMMARY:No identity',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events).toEqual([]);
    expect(skipped.unusable).toBe(3);
  });

  it('reads a floating local time as the wall clock it says, not as UTC', () => {
    const { events } = readGoogleCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:floating@google.com',
        'DTSTART;TZID=America/New_York:20260819T170000',
        'SUMMARY:Open house',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(events[0]).toMatchObject({ heldOn: '2026-08-19', startTime: '17:00' });
  });
});

describe('the address a synced event gets on this site', () => {
  it('is derived from Google’s identity, so a retitle amends rather than replaces', () => {
    const before = syncedEventSlug('5jbbma4mv3fodj7v1banr43b1o@google.com');
    expect(before).toBe('google-5jbbma4mv3fodj7v1banr43b1o');
    expect(syncedEventSlug('5jbbma4mv3fodj7v1banr43b1o@google.com')).toBe(before);
  });

  it('is safe to put in a URL and an iCalendar UID whatever Google sends', () => {
    expect(syncedEventSlug('weird id/with:punctuation@google.com')).toMatch(/^google-[a-z0-9-]+$/);
  });
});
