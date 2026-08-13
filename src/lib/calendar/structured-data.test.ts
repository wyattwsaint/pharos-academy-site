import { describe, expect, it } from 'vitest';

import { schoolId } from '../structured-data.js';
import { SEEDED_EVENTS, upcomingEvents, type CalendarEvent } from './event.js';
import { renderCalendarFeed } from './ics.js';
import { eventJsonLd } from './structured-data.js';
import { SEEDED_SCHOOL_YEAR } from './year.js';

/**
 * #151 AC 2 — each published event describes itself, with its date and its place.
 *
 * The two things that go wrong are a wrong hour and an invented place, so both
 * are checked against something independent: the hour against the same feed a
 * parent's phone subscribes to, and the place against the school's own decision
 * to publish none (#146).
 */
const SITE = 'https://example.org';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    slug: '2026-10-17-fall-open-house',
    heldOn: '2026-10-17',
    title: 'Fall open house',
    startTime: null,
    place: null,
    note: null,
    lastEditedBy: null,
    lastEditedAt: null,
    ...overrides,
  };
}

function nodeFor(overrides: Partial<CalendarEvent> = {}) {
  return eventJsonLd({ event: event(overrides), site: SITE }) as Record<string, any>;
}

describe('an event’s structured data', () => {
  it('is an in-person Event on the calendar page, at its own anchor', () => {
    const node = nodeFor();
    expect(node['@type']).toBe('Event');
    expect(node['@id']).toBe(`${SITE}/current-families/calendar#2026-10-17-fall-open-house`);
    expect(node.url).toBe(`${SITE}/current-families/calendar#events`);
    expect(node.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
  });

  // AC 4 again: the school is referred to, not described a second time.
  it('is organised by the school, by its existing identifier', () => {
    expect(nodeFor().organizer).toEqual({ '@id': schoolId(SITE) });
  });

  it('carries the school’s own title and note', () => {
    const node = nodeFor({ note: 'Bring the whole family.' });
    expect(node.name).toBe('Fall open house');
    expect(node.description).toBe('Bring the whole family.');
  });

  it('leaves out a note the school has not written', () => {
    expect(nodeFor().description).toBeUndefined();
  });
});

describe('when an event is', () => {
  it('is a plain date when the school published no time', () => {
    const node = nodeFor();
    expect(node.startDate).toBe('2026-10-17');
    // A bare date already means the whole day. An end date would be a second
    // claim about a day that needs one.
    expect(node.endDate).toBeUndefined();
  });

  /*
   * The instant, not the wall clock. 6.30pm in Enola on 17 October is 22:30 UTC
   * and the same 6.30 in January is 23:30, so a floating "18:30" is an event an
   * hour wrong for half the year — and wrong by five for anyone reading it in
   * their own zone.
   */
  it('resolves a timed event through the school’s own zone', () => {
    const node = nodeFor({ startTime: '18:30' });
    expect(node.startDate).toBe('2026-10-17T22:30:00.000Z');
    expect(node.endDate).toBe('2026-10-17T23:30:00.000Z');
  });

  it('crosses the changeover the same way the year does', () => {
    // The same 6.30, in January: an hour further from UTC.
    const winter = nodeFor({ heldOn: '2027-01-16', startTime: '18:30' });
    expect(winter.startDate).toBe('2027-01-16T23:30:00.000Z');
  });

  /*
   * The independent check. The subscribed calendar is generated from its own
   * code path, and a family holds both — so the two agreeing is the property
   * worth asserting, rather than this test restating the arithmetic.
   */
  it('agrees with the calendar a parent has subscribed to', () => {
    const timed = event({ startTime: '18:30' });
    const feed = renderCalendarFeed({
      year: SEEDED_SCHOOL_YEAR,
      events: [timed],
      now: new Date('2026-08-01T00:00:00Z'),
    });
    const node = eventJsonLd({ event: timed, site: SITE }) as Record<string, any>;

    const asFeedStamp = String(node.startDate).replace(/[-:]/g, '').slice(0, 15) + 'Z';
    expect(feed).toContain(`DTSTART:${asFeedStamp}`);
  });
});

describe('where an event is', () => {
  it('names the place when the school has published one', () => {
    expect(nodeFor({ place: 'Enola First Church of God' }).location).toEqual({
      '@type': 'Place',
      name: 'Enola First Church of God',
    });
  });

  /*
   * #146, in markup. The school published a name and a day for the dine-to-donate
   * and nothing else. Defaulting the location to the school's own address would
   * put a family outside a church hall on an evening when the event is at a
   * restaurant — a wrong fact published confidently, which is worse than the
   * missing one. Google will decline to show a location-less event richly, and
   * the fix is Jill typing the branch on the Events screen.
   */
  /*
   * A guard on the seed rather than on the code. `e2e/structured-data.spec.ts`
   * asserts that the markup describes exactly the events the calendar page shows;
   * if the seeded event ever falls behind the clock, both sides become zero and
   * that assertion passes on nothing. This is what says so instead.
   */
  it('still has something ahead of the clock to describe', () => {
    expect(upcomingEvents(SEEDED_EVENTS, new Date()).length).toBeGreaterThan(0);
  });

  it('publishes no place rather than guessing one', () => {
    expect(nodeFor().location).toBeUndefined();
    const seeded = SEEDED_EVENTS[0]!;
    const node = eventJsonLd({
      event: { ...seeded, lastEditedBy: null, lastEditedAt: null },
      site: SITE,
    }) as Record<string, any>;
    expect(node.location).toBeUndefined();
    expect(JSON.stringify(node)).not.toContain('Sherwood');
  });
});
