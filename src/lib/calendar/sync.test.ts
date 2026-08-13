import { readFile } from 'node:fs/promises';

import { asc } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { syncedEvents } from '../db/schema.js';
import type { SyncedEvent } from './google.js';
import { reconcileSyncedEvents, runCalendarSync } from './sync.js';

/**
 * The school's Google calendar, mirrored (#153).
 *
 * Against real Postgres and against the school's own captured feed, and never
 * against the network: `docs/mirror/data/google-calendar.ics` is the same bytes
 * the live calendar served on 13 August 2026, and the fetch is a stub in every
 * test here.
 *
 * What these prove is the three promises the ticket makes that nobody can read
 * off the code — an event amended in Google is amended here rather than
 * replaced, an event removed in Google is removed here, and a calendar that
 * cannot be reached changes nothing at all.
 */

const fixture = await readFile('docs/mirror/data/google-calendar.ics', 'utf8');

/** The day the fixture was captured. One event in it is still ahead. */
const CAPTURED_ON = new Date('2026-08-13T12:00:00Z');

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

const rows = () => db.select().from(syncedEvents).orderBy(asc(syncedEvents.heldOn));

const feedOf = (...events: Partial<SyncedEvent>[]): SyncedEvent[] =>
  events.map((event, index) => ({
    uid: `event-${index}@google.com`,
    heldOn: '2026-09-10',
    title: 'Open house',
    startTime: null,
    place: null,
    note: null,
    ...event,
  }));

describe('mirroring the school’s calendar', () => {
  it('writes the events that are still ahead, and leaves the archive behind', async () => {
    const stub = async () => new Response(fixture);

    const report = await runCalendarSync({
      db,
      calendarId: 'pharosacademy.net@gmail.com',
      now: CAPTURED_ON,
      fetchImpl: stub as unknown as typeof fetch,
    });

    // Seventeen of the eighteen one-offs in this calendar are already over —
    // one of them the Texas Roadhouse night the school withdrew.
    expect(report.added).toBe(1);
    const [only] = await rows();
    expect(only).toMatchObject({
      title: 'Chick-fil-A Fundraiser',
      heldOn: '2026-08-19',
      startTime: '17:00',
    });
  });

  it('reports what it left behind, so the cron log says why a count is small', async () => {
    const report = await runCalendarSync({
      db,
      calendarId: 'pharosacademy.net@gmail.com',
      now: CAPTURED_ON,
      fetchImpl: (async () => new Response(fixture)) as unknown as typeof fetch,
    });

    expect(report.skipped).toMatchObject({ recurring: 4, termDates: 2 });
    expect(report.past).toBe(17);
  });

  it('asks Google for the calendar the environment names', async () => {
    const asked: string[] = [];
    const stub = async (url: string) => {
      asked.push(String(url));
      return new Response(fixture);
    };

    await runCalendarSync({
      db,
      calendarId: 'pharosacademy.net@gmail.com',
      now: CAPTURED_ON,
      fetchImpl: stub as unknown as typeof fetch,
    });

    expect(asked).toEqual([
      'https://calendar.google.com/calendar/ical/pharosacademy.net%40gmail.com/public/basic.ics',
    ]);
  });
});

describe('a second run', () => {
  const twice = async (first: SyncedEvent[], second: SyncedEvent[]) => {
    await reconcileSyncedEvents(db, first, CAPTURED_ON);
    return reconcileSyncedEvents(db, second, CAPTURED_ON);
  };

  it('changes nothing when the calendar has not moved', async () => {
    const feed = feedOf({});

    const report = await twice(feed, feed);

    expect(report).toMatchObject({ added: 0, amended: 0, removed: 0, changed: false });
  });

  it('amends an event rather than replacing it, because the key is Google’s own', async () => {
    const report = await twice(
      feedOf({ uid: 'same@google.com', title: 'Open house' }),
      feedOf({ uid: 'same@google.com', title: 'Open house — now with cake' }),
    );

    expect(report).toMatchObject({ added: 0, amended: 1, removed: 0, changed: true });
    const [only] = await rows();
    expect(only?.title).toBe('Open house — now with cake');
  });

  it('moves an event that moved, and keeps its address on this site', async () => {
    await reconcileSyncedEvents(db, feedOf({ uid: 'same@google.com' }), CAPTURED_ON);

    const report = await reconcileSyncedEvents(
      db,
      feedOf({ uid: 'same@google.com', heldOn: '2026-09-17', startTime: '18:30' }),
      CAPTURED_ON,
    );

    expect(report.amended).toBe(1);
    const [only] = await rows();
    expect(only).toMatchObject({ uid: 'same@google.com', heldOn: '2026-09-17', startTime: '18:30' });
  });

  it('removes an event the school removed in Google', async () => {
    const report = await twice(feedOf({ uid: 'gone@google.com' }), []);

    expect(report).toMatchObject({ removed: 1, changed: true });
    expect(await rows()).toEqual([]);
  });

  it('keeps a synced event after its date goes by rather than deleting it for being over', async () => {
    await reconcileSyncedEvents(db, feedOf({ uid: 'held@google.com', heldOn: '2026-09-10' }), CAPTURED_ON);

    // A fortnight later, and Google has dropped it off the end of its own
    // feed. The site keeps its record: the page filters the past out, and the
    // subscribed feed is the year.
    const report = await reconcileSyncedEvents(db, [], new Date('2026-09-24T12:00:00Z'));

    expect(report).toMatchObject({ removed: 0, changed: false });
    expect(await rows()).toHaveLength(1);
  });

  it('records when the calendar was last read, on every row it confirmed', async () => {
    await reconcileSyncedEvents(db, feedOf({ uid: 'same@google.com' }), CAPTURED_ON);
    const later = new Date('2026-08-14T09:00:00Z');

    await reconcileSyncedEvents(db, feedOf({ uid: 'same@google.com' }), later);

    const [only] = await rows();
    expect(only?.syncedAt).toEqual(later);
  });
});

describe('what the sync will not import', () => {
  it('leaves an event Google holds in the past alone, in both directions', async () => {
    const report = await reconcileSyncedEvents(
      db,
      feedOf({ uid: 'old@google.com', heldOn: '2026-06-10' }),
      CAPTURED_ON,
    );

    expect(report).toMatchObject({ added: 0, past: 1, changed: false });
    expect(await rows()).toEqual([]);
  });

  it('counts today as ahead, because a fundraiser is most useful on its own morning', async () => {
    const report = await reconcileSyncedEvents(
      db,
      feedOf({ uid: 'tonight@google.com', heldOn: '2026-08-13' }),
      CAPTURED_ON,
    );

    expect(report.added).toBe(1);
  });
});

describe('a calendar that cannot be reached', () => {
  const sync = (fetchImpl: unknown) =>
    runCalendarSync({
      db,
      calendarId: 'pharosacademy.net@gmail.com',
      now: CAPTURED_ON,
      fetchImpl: fetchImpl as typeof fetch,
    });

  const seed = () => reconcileSyncedEvents(db, feedOf({ uid: 'known@google.com' }), CAPTURED_ON);

  it('keeps what the site already knows when Google answers with an error', async () => {
    await seed();

    await expect(sync(async () => new Response('Not found', { status: 404 }))).rejects.toThrow(/404/);
    expect(await rows()).toHaveLength(1);
  });

  it('keeps what the site already knows when the request never lands', async () => {
    await seed();

    await expect(
      sync(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    ).rejects.toThrow(/ENOTFOUND/);
    expect(await rows()).toHaveLength(1);
  });

  it('refuses a body that is not a calendar rather than emptying the page', async () => {
    await seed();

    // A sign-in page, an error document, a truncated download: all of them
    // parse to nothing, and "nothing" must not be read as "the school deleted
    // its whole calendar".
    await expect(sync(async () => new Response('<html>Sign in</html>'))).rejects.toThrow(/calendar/i);
    expect(await rows()).toHaveLength(1);
  });

  it('accepts a calendar whose every entry is one this sync leaves behind', async () => {
    await seed();

    // A real calendar with nothing publishable in it — here, one cancelled
    // event. That is an ordinary state and not a failed read, so the removal
    // goes through: the school cancelled its evening and the site says so.
    const cancelled = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:known@google.com',
      'DTSTART;VALUE=DATE:20260910',
      'SUMMARY:Open house',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const report = await sync(async () => new Response(cancelled));

    expect(report.removed).toBe(1);
    expect(await rows()).toEqual([]);
  });
});

describe('republishing', () => {
  const syncWith = (republish: () => Promise<void>) =>
    runCalendarSync({
      db,
      calendarId: 'pharosacademy.net@gmail.com',
      now: CAPTURED_ON,
      fetchImpl: (async () => new Response(fixture)) as unknown as typeof fetch,
      republish,
    });

  it('republishes the site when something in the calendar moved', async () => {
    let republished = 0;
    const report = await syncWith(async () => {
      republished += 1;
    });

    expect(report.changed).toBe(true);
    expect(republished).toBe(1);
  });

  it('does not republish a night when nothing moved', async () => {
    let republished = 0;
    await syncWith(async () => {
      republished += 1;
    });
    await syncWith(async () => {
      republished += 1;
    });

    // The calendar page is cached; republishing it nightly for an unchanged
    // calendar is a rebuild nobody asked for and no family sees.
    expect(republished).toBe(1);
  });
});
