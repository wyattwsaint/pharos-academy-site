import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from './event.js';
import { CALENDAR_PRODID, renderCalendarFeed, unfold } from './ics.js';
import { meetingsOf, SEEDED_SCHOOL_YEAR } from './year.js';

/**
 * The feed, as a calendar client reads it (#23 AC 6).
 *
 * This is the acceptance criterion a headless session can actually own.
 * Subscribing the address in a real client is #56's, and nothing here pretends
 * to cover it — what is asserted is the structure a client parses: one VEVENT
 * per meeting date and per event, a whole DTSTART/DTEND pair on each, UIDs that
 * survive regeneration, the PRODID, and lines folded to 75 octets.
 */

const NOW = new Date('2026-08-01T12:00:00Z');

const EVENTS: CalendarEvent[] = [
  {
    slug: '2026-10-17-fall-open-house',
    heldOn: '2026-10-17',
    title: 'Fall open house',
    startTime: '18:30',
    place: 'Enola Church of God, 9 Sherwood Drive',
    note: 'Come and meet the instructors; bring the whole family.',
    lastEditedBy: 'Jill Kilker',
    lastEditedAt: NOW,
  },
  {
    slug: '2027-05-12-field-day',
    heldOn: '2027-05-12',
    title: 'Field day',
    startTime: null,
    place: null,
    note: null,
    lastEditedBy: 'Jill Kilker',
    lastEditedAt: NOW,
  },
];

const feed = () => renderCalendarFeed({ year: SEEDED_SCHOOL_YEAR, events: EVENTS, now: NOW });

/** The feed's VEVENT blocks, unfolded, as a client would see them. */
function events(text = feed()): string[][] {
  const lines = unfold(text).split('\r\n');
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT') {
      if (current) blocks.push(current);
      current = null;
    } else current?.push(line);
  }
  return blocks;
}

/** One property of one block, or undefined. `DTSTART;VALUE=DATE` counts as `DTSTART`. */
function property(block: string[], name: string): string | undefined {
  const line = block.find((one) => one === name || one.startsWith(`${name}:`) || one.startsWith(`${name};`));
  return line?.slice(line.indexOf(':') + 1);
}

describe('the calendar feed', () => {
  it('carries one VEVENT per meeting date and per event', () => {
    expect(events()).toHaveLength(meetingsOf(SEEDED_SCHOOL_YEAR).length + EVENTS.length);
    expect(events()).toHaveLength(114);
  });

  it('opens and closes as one VCALENDAR, with the school’s PRODID', () => {
    const text = feed();
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(unfold(text)).toContain(`PRODID:${CALENDAR_PRODID}`);
    expect(unfold(text)).toContain('VERSION:2.0');
  });

  it('gives every VEVENT a whole DTSTART and DTEND', () => {
    for (const block of events()) {
      expect(property(block, 'DTSTART')).toMatch(/^\d{8}(T\d{6}Z)?$/);
      expect(property(block, 'DTEND')).toMatch(/^\d{8}(T\d{6}Z)?$/);
      expect(property(block, 'DTSTAMP')).toMatch(/^\d{8}T\d{6}Z$/);
      expect(property(block, 'UID')).toBeTruthy();
      expect(property(block, 'SUMMARY')).toBeTruthy();
    }
  });

  it('writes a meeting as the whole day it is, named by track and week', () => {
    const first = events()[0]!;
    expect(property(first, 'DTSTART')).toBe('20260831');
    // Exclusive end, which is what a whole-day VEVENT means: the next day.
    expect(property(first, 'DTEND')).toBe('20260901');
    expect(property(first, 'SUMMARY')).toBe('Pharos Monday — Week 1');
  });

  it('writes a timed event in real time, an hour long, and an untimed one as a day', () => {
    const openHouse = events().find((block) => property(block, 'SUMMARY') === 'Fall open house')!;
    // 18:30 in Enola on 17 October 2026 is 22:30 UTC — eastern daylight time.
    expect(property(openHouse, 'DTSTART')).toBe('20261017T223000Z');
    expect(property(openHouse, 'DTEND')).toBe('20261017T233000Z');
    expect(property(openHouse, 'LOCATION')).toBe('Enola Church of God\\, 9 Sherwood Drive');

    const fieldDay = events().find((block) => property(block, 'SUMMARY') === 'Field day')!;
    expect(property(fieldDay, 'DTSTART')).toBe('20270512');
    expect(property(fieldDay, 'DTEND')).toBe('20270513');
    expect(fieldDay.some((line) => line.startsWith('LOCATION'))).toBe(false);
  });

  it('keeps every UID stable across regeneration, and unique within the feed', () => {
    const later = renderCalendarFeed({
      year: SEEDED_SCHOOL_YEAR,
      events: EVENTS,
      now: new Date('2027-02-14T09:00:00Z'),
    });

    const uids = (text: string) => events(text).map((block) => property(block, 'UID'));
    expect(uids(later)).toEqual(uids(feed()));
    expect(new Set(uids(feed())).size).toBe(114);

    // The stamp is the one thing that moves, and it has to.
    expect(later).not.toEqual(feed());
  });

  it('folds every line to 75 octets, continuing with a single space', () => {
    const long: CalendarEvent = {
      ...EVENTS[0]!,
      note: 'A note long enough to need folding: '.repeat(6),
    };
    const text = renderCalendarFeed({ year: SEEDED_SCHOOL_YEAR, events: [long], now: NOW });

    for (const line of text.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(text).toContain('\r\n ');
    // Unfolding puts it back together, so a client reads one DESCRIPTION.
    expect(unfold(text)).toContain(`DESCRIPTION:${long.note!.replace(/,/g, '\\,').trimEnd()}`);
  });

  it('escapes what iCalendar reserves rather than emitting a broken line', () => {
    const awkward: CalendarEvent = {
      ...EVENTS[1]!,
      title: 'Concert; strings, brass\\ and a\nsecond line',
    };
    const text = renderCalendarFeed({ year: SEEDED_SCHOOL_YEAR, events: [awkward], now: NOW });
    expect(unfold(text)).toContain(
      'SUMMARY:Concert\\; strings\\, brass\\\\ and a\\nsecond line',
    );
  });

  it('is a whole feed for a year with no Tuesday track', () => {
    const withoutTuesday = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.track !== 'Tuesday'),
    };
    const text = renderCalendarFeed({ year: withoutTuesday, events: [], now: NOW });
    expect(events(text)).toHaveLength(84);
    expect(unfold(text)).not.toContain('Pharos Tuesday');
  });
});
