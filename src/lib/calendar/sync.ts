import { and, gte, inArray, notInArray, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { syncedEvents } from '../db/schema.js';
import { googleFeedUrl, readGoogleCalendar, type SkippedCounts, type SyncedEvent } from './google.js';
import { schoolToday } from './year.js';

/**
 * The school's Google calendar, mirrored into `synced_events` (#153).
 *
 * The school keeps its calendar in Google and goes on keeping it there; this is
 * the thing that reads it once a day and republishes what changed. Everything
 * it writes is in one table of its own (ADR-0012), and that is what makes "the
 * sync never overwrites what an admin typed" a fact about the schema rather
 * than a `where` clause somebody has to keep right.
 *
 * Three rules govern the whole of it, and each of them is a decision somebody
 * made rather than an implementation detail:
 *
 * **Today and later, never the past.** The school's calendar is mostly an
 * archive — seventeen of its eighteen one-offs were already over the day this
 * was built, one of them a fundraiser the school withdrew — and importing it
 * would be the site asserting things about a year it was not party to. Rows
 * already here are *kept* after their date goes by; the page filters the past
 * and the feed is the record.
 *
 * **A failed read writes nothing.** Not an empty calendar, not a partial one: a
 * sign-in page, an error document and a truncated download all parse to zero
 * events, and treating that as "the school deleted everything" would empty the
 * page on a bad night. The sync throws, the cron logs it red, and the site goes
 * on publishing the last thing the school is known to have said.
 *
 * **A run that changed nothing republishes nothing.** The calendar page is
 * cached, so rows rewritten without a republish change nothing a family sees —
 * and a nightly rebuild for an unchanged calendar is the opposite mistake.
 */

/** What the reconcile did. Everything but what the reader left behind. */
export type ReconcileReport = {
  /** Events that were not on the site before. */
  added: number;
  /** Events Google now describes differently. Amended in place, on Google's own UID. */
  amended: number;
  /** Events Google no longer holds, and which had not yet happened. */
  removed: number;
  /** Events in the feed that are already over. Read, counted, never written. */
  past: number;
  /** Whether anything moved. The republish hangs on this and nothing else. */
  changed: boolean;
};

/** What one run did, in the words the cron log reports. */
export type SyncReport = ReconcileReport & {
  /** What the reader left behind — the term dates, the cancelled, the unusable. */
  skipped: SkippedCounts;
};

export type CalendarSyncOptions = {
  db: Db;
  /** `pharosacademy.net@gmail.com`, or a whole iCal URL. From the environment. */
  calendarId: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  /** Called once, and only when something moved. */
  republish?: () => Promise<unknown>;
};

/**
 * Read the calendar and mirror it, republishing if anything moved.
 *
 * Throws on anything that means "the calendar was not read" — a refused
 * connection, a 404, a body that is not a calendar. The message is the
 * diagnosis and it belongs in the cron log, which is the only place anybody
 * will look; nothing has been written by the time it is raised.
 */
export async function runCalendarSync(options: CalendarSyncOptions): Promise<SyncReport> {
  const { db, calendarId, now = new Date(), fetchImpl = fetch, republish } = options;

  const url = googleFeedUrl(calendarId);
  const response = await fetchImpl(url, { headers: { accept: 'text/calendar' } });
  if (!response.ok) {
    throw new Error(`The school's Google calendar answered ${response.status} at ${url}.`);
  }

  const body = await response.text();
  const { events, skipped } = readGoogleCalendar(body);

  /*
   * A body with no VEVENT in it at all is a failed read, not an empty calendar.
   *
   * A sign-in page, an error document and a truncated download all parse to
   * nothing, and reading that as "the school deleted everything" would empty the
   * page on a bad night — the failure AC 7 is about. Counted over every VEVENT
   * *seen* rather than over the ones that survived the rules, so a calendar
   * holding only cancelled events, or only its class series, is read as the
   * ordinary thing it is: a calendar with nothing to publish.
   */
  const seen =
    events.length +
    skipped.recurring +
    skipped.termDates +
    skipped.cancelled +
    skipped.unusable;
  if (seen === 0) {
    throw new Error(`Nothing at ${url} reads as a calendar. Nothing was written.`);
  }

  const report = { ...(await reconcileSyncedEvents(db, events, now)), skipped };
  if (report.changed && republish) await republish();
  return report;
}

/**
 * Make `synced_events` say what the calendar says, from today forward.
 *
 * Separate from the fetch so that every case below is provable against real
 * Postgres with no network anywhere near it: an amendment, a move, a removal,
 * and a run over an unchanged calendar.
 *
 * Written as a delete and an upsert rather than a truncate and a reinsert. The
 * difference is the one the ticket cares about: Google's UID is the key, so an
 * event whose title somebody fixed is *amended*, and a subscriber sees an
 * updated invitation rather than a cancellation and a new one.
 */
export async function reconcileSyncedEvents(
  db: Db,
  events: readonly SyncedEvent[],
  now: Date,
): Promise<ReconcileReport> {
  const today = schoolToday(now);
  const ahead = events.filter((event) => event.heldOn >= today);
  const uids = ahead.map((event) => event.uid);

  /*
   * Only the rows that have not happened yet are the sync's to remove.
   *
   * Google drops an old event off the end of its own feed, and this site keeps
   * its record of the year: a row whose date has gone by is history, not an
   * event the school cancelled. The `held_on >= today` half is what makes those
   * two indistinguishable cases distinguishable.
   */
  const upcoming = await db
    .select({ uid: syncedEvents.uid })
    .from(syncedEvents)
    .where(gte(syncedEvents.heldOn, today));

  const removed = upcoming.filter((row) => !uids.includes(row.uid)).length;
  if (removed > 0) {
    await db
      .delete(syncedEvents)
      .where(
        uids.length > 0
          ? and(gte(syncedEvents.heldOn, today), notInArray(syncedEvents.uid, uids))
          : gte(syncedEvents.heldOn, today),
      );
  }

  const existing =
    uids.length > 0
      ? await db.select().from(syncedEvents).where(inArray(syncedEvents.uid, uids))
      : [];
  const before = new Map(existing.map((row) => [row.uid, row]));

  let added = 0;
  let amended = 0;
  for (const event of ahead) {
    const was = before.get(event.uid);
    if (!was) added += 1;
    else if (describes(was) !== describes(event)) amended += 1;
  }

  if (ahead.length > 0) {
    await db
      .insert(syncedEvents)
      .values(ahead.map((event) => ({ ...event, syncedAt: now })))
      .onConflictDoUpdate({
        target: syncedEvents.uid,
        // `synced_at` is written on every confirmed row, changed or not: it is
        // when this copy was last known to match Google, which is the fact an
        // operator wants when the mirror looks stale.
        set: {
          heldOn: sql`excluded.held_on`,
          title: sql`excluded.title`,
          startTime: sql`excluded.start_time`,
          place: sql`excluded.place`,
          note: sql`excluded.note`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  return {
    added,
    amended,
    removed,
    past: events.length - ahead.length,
    changed: added + amended + removed > 0,
  };
}

/**
 * Everything about an event except when it was read. Two equal strings are no change.
 *
 * Typed as the event minus its key rather than as a fresh list of five fields,
 * so that a sixth column added to `synced_events` is a type error here rather
 * than a column that silently never counts as an amendment.
 */
function describes(event: Omit<SyncedEvent, 'uid'>): string {
  return JSON.stringify([event.heldOn, event.title, event.startTime, event.place, event.note]);
}
