import { describe, expect, it } from 'vitest';

import {
  eventSlug,
  eventTimeLabel,
  SEEDED_EVENTS,
  upcomingEvents,
  type CalendarEvent,
} from './event.js';
import { schoolToday } from './year.js';

/**
 * A one-off, and the rule that takes it off the page again (#146).
 *
 * The interesting boundary is the day of the event itself: a fundraiser is at
 * its most useful on the morning it happens, so "past" has to mean yesterday
 * and not "any time today". That is asserted here against a fixed clock rather
 * than against the real one, because a test that passes only until August is a
 * test that reports a regression it invented.
 */

const event = (heldOn: string, title = 'Something'): CalendarEvent => ({
  slug: eventSlug(heldOn, title),
  heldOn,
  title,
  startTime: null,
  place: null,
  note: null,
  lastEditedBy: null,
  lastEditedAt: null,
});

describe('what is still ahead', () => {
  // Half past nine at night in Enola on 19 August 2026 — and already the 20th
  // in UTC, which is the case a naive `new Date()` gets wrong.
  const thatEvening = new Date('2026-08-20T01:30:00Z');

  it('keeps an event through the whole of its own day, in the school’s own zone', () => {
    expect(schoolToday(thatEvening)).toBe('2026-08-19');
    expect(upcomingEvents([event('2026-08-19')], thatEvening)).toHaveLength(1);
  });

  it('drops one the morning after', () => {
    const nextMorning = new Date('2026-08-20T13:00:00Z');
    expect(upcomingEvents([event('2026-08-19')], nextMorning)).toEqual([]);
  });

  it('keeps the order it was given, which is the store’s order', () => {
    const list = [event('2026-09-01', 'Later'), event('2026-08-25', 'Sooner')];
    expect(upcomingEvents(list, thatEvening).map((one) => one.title)).toEqual(['Later', 'Sooner']);
  });

  it('is empty when every event has been and gone, which is an ordinary year', () => {
    expect(upcomingEvents([event('2026-08-19')], new Date('2027-01-01T12:00:00Z'))).toEqual([]);
  });
});

describe('the events the school already published', () => {
  it('has the Chick-fil-A fundraiser on the day the school gave', () => {
    const fundraiser = SEEDED_EVENTS.find((one) => one.title.includes('Chick-fil-A'));
    expect(fundraiser?.heldOn).toBe('2026-08-19');
  });

  it('carries no Texas Roadhouse night, which this one replaced', () => {
    expect(SEEDED_EVENTS.map((one) => one.title).join(' | ')).not.toContain('Roadhouse');
  });

  it('addresses each one by its own date and title', () => {
    for (const one of SEEDED_EVENTS) {
      expect(one.slug, one.slug).toBe(eventSlug(one.heldOn, one.title));
    }
  });

  it('publishes a time only where the school published one', () => {
    for (const one of SEEDED_EVENTS) {
      if (one.startTime !== null) expect(eventTimeLabel(one.startTime), one.slug).toBeTruthy();
    }
  });
});
