import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import {
  calendarEvents,
  schoolYear as schoolYearTable,
  schoolYearClosures,
  schoolYearTerms,
  syncedEvents,
  type SyncedEventRow,
} from '../db/schema.js';
import type { DayTrack } from '../courses/schedule.js';
import type { CalendarEvent, CalendarEventEdit } from './event.js';
import { syncedEventSlug } from './google.js';
import type { Closure, SchoolYear, Semester, Term } from './year.js';

/**
 * The school year and the events, read and written (#23).
 *
 * The year comes back as one `SchoolYear` from three tables, because that is
 * the thing every caller wants: the public page, the ICS feed and the admin
 * preview all need the terms and the closures together or they need neither.
 * Nothing outside this module joins them.
 *
 * **A save replaces the terms and the closures wholesale.** The screen is one
 * form over one year, so a save is "this is the year now" rather than eight
 * separate edits — and wholesale replacement is what makes removing the Tuesday
 * track possible at all. A diff would need a delete control per row for the
 * same effect and would leave a removed track behind on any path it missed.
 */

/**
 * The year as it stands, or undefined before the first migration has run.
 *
 * Undefined rather than an empty year, so a caller cannot mistake "no row" for
 * "a year with no terms" — the second is a real, saveable state.
 */
export async function getSchoolYear(db: Db): Promise<SchoolYear | undefined> {
  const [row] = await db.select().from(schoolYearTable).where(eq(schoolYearTable.id, 1)).limit(1);
  if (!row) return undefined;

  const terms = await db
    .select()
    .from(schoolYearTerms)
    .orderBy(asc(schoolYearTerms.semester), asc(schoolYearTerms.firstClassDate));
  const closures = await db
    .select()
    .from(schoolYearClosures)
    .orderBy(asc(schoolYearClosures.closedOn));

  return {
    label: row.label,
    terms: terms.map((term) => ({
      semester: term.semester as Semester,
      track: term.track as DayTrack,
      firstClassDate: term.firstClassDate,
      weeks: term.weeks,
    })),
    closures: closures.map((closure) => ({ date: closure.closedOn, label: closure.label })),
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}

/** What a save may change: everything about the year except who saved it. */
export type SchoolYearEdit = {
  label: string;
  terms: Term[];
  closures: Closure[];
};

/**
 * Save the year and stamp it.
 *
 * Written as delete-then-insert rather than as a diff, and **not** inside a
 * transaction: the production driver is neon-http, which has no interactive
 * transaction to open. The window that leaves is a save that dies between the
 * delete and the insert, and what it costs is a year Jill re-saves from the
 * form she is still looking at — the values are all in front of her, and the
 * public page reads the same three tables it did a moment before. A migration
 * this is not; there is no partial state that needs hands on the database.
 */
export async function saveSchoolYear(
  db: Db,
  edit: SchoolYearEdit,
  editorName: string,
  now = new Date(),
): Promise<SchoolYear> {
  await db
    .insert(schoolYearTable)
    .values({ id: 1, label: edit.label, lastEditedBy: editorName, lastEditedAt: now })
    .onConflictDoUpdate({
      target: schoolYearTable.id,
      set: { label: edit.label, lastEditedBy: editorName, lastEditedAt: now },
    });

  await db.delete(schoolYearTerms);
  if (edit.terms.length > 0) {
    await db.insert(schoolYearTerms).values(
      edit.terms.map((term) => ({
        semester: term.semester,
        track: term.track,
        firstClassDate: term.firstClassDate,
        weeks: term.weeks,
      })),
    );
  }

  await db.delete(schoolYearClosures);
  if (edit.closures.length > 0) {
    await db
      .insert(schoolYearClosures)
      .values(edit.closures.map((closure) => ({ closedOn: closure.date, label: closure.label })));
  }

  const saved = await getSchoolYear(db);
  if (!saved) throw new Error('The school year did not save.');
  return saved;
}

/**
 * Every one-off the school has on the calendar, earliest first.
 *
 * An empty list is an ordinary state and is not refused: a year with nothing
 * scheduled beyond its classes is a complete year, and the calendar page has a
 * sentence for it.
 */
export async function listEvents(db: Db): Promise<CalendarEvent[]> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .orderBy(asc(calendarEvents.heldOn), asc(calendarEvents.slug));
  return rows.map(toEvent);
}

/**
 * The whole calendar as a visitor reads it — both sources, one list (#153).
 *
 * The school types some of its events on the Events screen and keeps the rest
 * in its own Google calendar, and which is which is the school's business
 * rather than a family's. So the page, the subscribed feed and the structured
 * data all read this, and none of them knows there are two tables.
 *
 * **`listEvents` is the other half and stays as it is.** That one is the
 * admin's own rows, which are the rows the admin can edit; a synced one-off has
 * no form, no save and no delete there, because the place to change it is
 * Google and a control that the next sync overwrites is a control that loses.
 *
 * Nothing here dedupes. Two entries on one date are two events, and the site
 * does not decide otherwise: two fundraisers in a fortnight is an ordinary week
 * at this school, and a rule that hid the second would hide it invisibly. A
 * real duplicate is visible on the page and whoever made it removes their half.
 */
export async function listPublishedEvents(db: Db): Promise<CalendarEvent[]> {
  const [own, mirrored] = await Promise.all([listEvents(db), listSyncedEvents(db)]);

  const synced = mirrored.map((row) => ({
    // Google's identity rather than the date and the title, so that a retitle
    // in Google amends this event rather than removing one and adding another.
    slug: syncedEventSlug(row.uid),
    heldOn: row.heldOn,
    title: row.title,
    startTime: row.startTime,
    place: row.place,
    note: row.note,
    // No stamp, and it cannot have one: nobody signed in to run a sync, so
    // there is no actor to name. `synced_at` is a different fact, and it is
    // read by the cron rather than by a page (ADR-0012).
    lastEditedBy: null,
    lastEditedAt: null,
  }));

  return [...own, ...synced].sort(
    (a, b) => a.heldOn.localeCompare(b.heldOn) || a.slug.localeCompare(b.slug),
  );
}

/**
 * The mirror as it stands — rows, including when each was last read.
 *
 * For the export and for the sync's own reporting, never for a page: what a
 * page wants is {@link listPublishedEvents}, which merges these in and drops
 * the bookkeeping.
 */
export async function listSyncedEvents(db: Db): Promise<SyncedEventRow[]> {
  return db.select().from(syncedEvents).orderBy(asc(syncedEvents.heldOn), asc(syncedEvents.uid));
}

/** One event, or undefined — which the admin 404s on. */
export async function getEvent(db: Db, slug: string): Promise<CalendarEvent | undefined> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.slug, slug))
    .limit(1);
  return row ? toEvent(row) : undefined;
}

/** Add an event, stamped on creation as every other record is. */
export async function createEvent(
  db: Db,
  slug: string,
  edit: CalendarEventEdit,
  editorName: string,
  now = new Date(),
): Promise<CalendarEvent> {
  const [row] = await db
    .insert(calendarEvents)
    .values({ slug, ...edit, lastEditedBy: editorName, lastEditedAt: now })
    .returning();
  if (!row) throw new Error(`Could not add an event at "${slug}".`);
  return toEvent(row);
}

/** Change an event, and overwrite its stamp. */
export async function saveEvent(
  db: Db,
  slug: string,
  edit: CalendarEventEdit,
  editorName: string,
  now = new Date(),
): Promise<CalendarEvent> {
  const [row] = await db
    .update(calendarEvents)
    .set({ ...edit, lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(calendarEvents.slug, slug))
    .returning();
  if (!row) throw new Error(`No event with the slug "${slug}".`);
  return toEvent(row);
}

/**
 * Take an event off the calendar.
 *
 * The one delete on the site, and it is here because an event is the one record
 * that can become *false* rather than merely old. A cancelled concert left on a
 * subscribed feed is a family driving to a school that is dark; an announcement
 * that has aged out is only history, which is why nothing deletes one.
 */
export async function deleteEvent(db: Db, slug: string): Promise<void> {
  await db.delete(calendarEvents).where(eq(calendarEvents.slug, slug));
}

function toEvent(row: typeof calendarEvents.$inferSelect): CalendarEvent {
  return {
    slug: row.slug,
    heldOn: row.heldOn,
    title: row.title,
    startTime: row.startTime,
    place: row.place,
    note: row.note,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
