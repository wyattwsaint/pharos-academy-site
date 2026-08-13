import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { MIGRATIONS } from '../db/migrations.js';
import { calendarEvents } from '../db/schema.js';
import { eventSlug, SEEDED_EVENTS } from './event.js';
import { reconcileSyncedEvents } from './sync.js';
import {
  createEvent,
  deleteEvent,
  getSchoolYear,
  listEvents,
  listPublishedEvents,
  saveEvent,
  saveSchoolYear,
} from './store.js';
import { meetingsOf, SEEDED_SCHOOL_YEAR, trackColumn, validateSchoolYear } from './year.js';

/**
 * The year and the events, against real Postgres.
 *
 * PGlite runs the DDL Neon runs, so what is proved here is the round trip: the
 * seeded year comes back computable, a year saved without its Tuesday track
 * comes back without it, and nothing about "complete" depends on eight rows
 * being present.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

describe('the seeded year', () => {
  it('comes back whole, and computes the 112 dates the school published', async () => {
    const year = (await getSchoolYear(db))!;
    expect(year.label).toBe(SEEDED_SCHOOL_YEAR.label);
    expect(year.terms).toHaveLength(8);
    expect(validateSchoolYear(year)).toEqual({});
    expect(meetingsOf(year)).toHaveLength(112);
    expect(trackColumn(year, 'Wednesday').find((m) => m.week === 10)?.date).toBe('2026-11-04');
  });

  it('has not been edited by anybody yet', async () => {
    const year = (await getSchoolYear(db))!;
    expect(year.lastEditedBy).toBeNull();
    expect(year.lastEditedAt).toBeNull();
  });
});

describe('saving the year', () => {
  it('saves a year with no Tuesday track as complete, and drops the old row', async () => {
    const saved = await saveSchoolYear(
      db,
      {
        label: '2027–2028',
        terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.track !== 'Tuesday'),
        closures: SEEDED_SCHOOL_YEAR.closures,
      },
      'Jill Kilker',
    );

    expect(saved.terms).toHaveLength(6);
    expect(saved.terms.some((term) => term.track === 'Tuesday')).toBe(false);
    expect(validateSchoolYear(saved)).toEqual({});
    expect((await getSchoolYear(db))!.terms).toHaveLength(6);
  });

  it('replaces the closures rather than adding to them', async () => {
    await saveSchoolYear(
      db,
      { label: SEEDED_SCHOOL_YEAR.label, terms: SEEDED_SCHOOL_YEAR.terms, closures: [] },
      'Jill Kilker',
    );
    const year = (await getSchoolYear(db))!;
    expect(year.closures).toEqual([]);
    // With nothing closed, every track runs 28 straight weeks.
    expect(trackColumn(year, 'Monday')[13]?.date).toBe('2026-11-30');
  });

  it('stamps who saved it', async () => {
    const now = new Date('2026-08-06T10:00:00Z');
    const saved = await saveSchoolYear(
      db,
      {
        label: SEEDED_SCHOOL_YEAR.label,
        terms: SEEDED_SCHOOL_YEAR.terms,
        closures: SEEDED_SCHOOL_YEAR.closures,
      },
      'Break-glass access',
      now,
    );
    expect(saved.lastEditedBy).toBe('Break-glass access');
    expect(saved.lastEditedAt?.toISOString()).toBe(now.toISOString());
  });
});

describe('events', () => {
  const draft = {
    heldOn: '2026-10-17',
    title: 'Fall open house',
    startTime: '18:30',
    place: 'Enola Church of God',
    note: null,
  };

  /*
   * The admin's own events start empty, and that is a change (#153).
   *
   * #146 seeded the Chick-fil-A fundraiser so the page would not be empty days
   * before a real event. The school's Google calendar carries the same evening
   * with the 5pm the seed had to leave blank, so migration 0021 withdraws the
   * seeded copy — guarded on it being untouched, which the next test is about.
   */
  it('starts with no events of the admin’s own, the school’s own calendar having the one', async () => {
    expect(await listEvents(db)).toEqual([]);
  });

  /*
   * 0021's guard, exercised by replaying the migration over rows put back by
   * hand. Both halves matter and only one of them is safe to get wrong: the
   * unedited row must go, or the page carries the duplicate; the edited row must
   * stay, or a migration has quietly discarded Jill's work.
   */
  const replaySupersession = async () => {
    const migration = MIGRATIONS.find((one) => one.id.startsWith('0021-'))!;
    for (const statement of migration.statements) await db.execute(sql.raw(statement));
  };

  it('withdraws a seeded event that is still exactly as it was seeded', async () => {
    const seeded = SEEDED_EVENTS[0]!;
    await db.insert(calendarEvents).values({ ...seeded });

    await replaySupersession();

    expect(await listEvents(db)).toEqual([]);
  });

  it('keeps a seeded event somebody has edited, because an edit makes it theirs', async () => {
    const seeded = SEEDED_EVENTS[0]!;
    await createEvent(db, seeded.slug, { ...seeded, place: 'Lower Allen' }, 'Jill Kilker');

    await replaySupersession();

    expect((await listEvents(db)).map((event) => event.slug)).toEqual([seeded.slug]);
  });

  it('holds a one-off without it entering the term-dates model', async () => {
    const event = await createEvent(db, eventSlug(draft.heldOn, draft.title), draft, 'Jill Kilker');
    expect(event.slug).toBe('2026-10-17-fall-open-house');
    expect(event.startTime).toBe('18:30');
    expect(event.lastEditedBy).toBe('Jill Kilker');

    // The year is untouched: the events screen and the year screen share nothing.
    const year = (await getSchoolYear(db))!;
    expect(meetingsOf(year)).toHaveLength(112);
    expect(year.closures.some((closure) => closure.date === draft.heldOn)).toBe(false);
  });

  it('keeps an all-day event, with no time and no place', async () => {
    await createEvent(
      db,
      '2027-05-12-field-day',
      { heldOn: '2027-05-12', title: 'Field day', startTime: null, place: null, note: null },
      'Jill Kilker',
    );
    const event = (await listEvents(db)).find((one) => one.slug === '2027-05-12-field-day');
    expect(event).toMatchObject({ startTime: null, place: null, note: null });
  });

  it('edits one, and takes a cancelled one off the calendar', async () => {
    const slug = eventSlug(draft.heldOn, draft.title);
    await createEvent(db, slug, draft, 'Jill Kilker');
    const edited = await saveEvent(db, slug, { ...draft, startTime: '19:00' }, 'George Jensen');
    expect(edited.startTime).toBe('19:00');
    expect(edited.lastEditedBy).toBe('George Jensen');

    await deleteEvent(db, slug);
    expect((await listEvents(db)).map((event) => event.slug)).not.toContain(slug);
  });

  it('lists them earliest first, whatever order they were typed in', async () => {
    await createEvent(
      db,
      '2027-05-12-field-day',
      { heldOn: '2027-05-12', title: 'Field day', startTime: null, place: null, note: null },
      'Jill Kilker',
    );
    await createEvent(db, eventSlug(draft.heldOn, draft.title), draft, 'Jill Kilker');
    const heldOn = (await listEvents(db)).map((event) => event.heldOn);
    expect(heldOn).toEqual([...heldOn].sort());
    expect(heldOn.slice(-2)).toEqual(['2026-10-17', '2027-05-12']);
  });
});

/**
 * The calendar as a family sees it, which is two tables and one list (#153).
 *
 * The school types some of its events here and keeps the rest in Google, and
 * the difference is the school's own business rather than a visitor's. What is
 * asserted below is that the join is invisible: one order, one shape, and a
 * synced event indistinguishable from a typed one except in the two ways it
 * honestly is — it has no stamp, and its address is Google's identity.
 */
describe('both sources as one calendar', () => {
  const NOW = new Date('2026-08-13T12:00:00Z');

  const typed = (heldOn: string, title: string) =>
    createEvent(
      db,
      eventSlug(heldOn, title),
      { heldOn, title, startTime: null, place: null, note: null },
      'Jill Kilker',
    );

  const synced = (heldOn: string, title: string, startTime: string | null = null) =>
    reconcileSyncedEvents(
      db,
      [{ uid: `${title.toLowerCase().replace(/\W+/g, '')}@google.com`, heldOn, title, startTime, place: null, note: null }],
      NOW,
    );

  it('interleaves the two by date, so a family reads one calendar', async () => {
    await typed('2026-10-17', 'Fall open house');
    await synced('2026-09-10', 'Panera fundraiser');

    const published = await listPublishedEvents(db);

    expect(published.map((event) => event.title)).toEqual([
      'Panera fundraiser',
      'Fall open house',
    ]);
  });

  it('gives a synced event the address Google’s identity gives it, and no stamp', async () => {
    await synced('2026-09-10', 'Panera fundraiser', '17:00');

    const [only] = await listPublishedEvents(db);

    expect(only).toMatchObject({
      slug: 'google-panerafundraiser',
      startTime: '17:00',
      lastEditedBy: null,
      lastEditedAt: null,
    });
  });

  it('shows two entries on one date rather than deciding they are one event', async () => {
    // Two fundraisers in a fortnight is an ordinary week at this school. A rule
    // that hid the second would hide it invisibly; a real duplicate is visible
    // on the page, and whoever made it removes the half they own.
    await typed('2026-09-10', 'Panera fundraiser');
    await synced('2026-09-10', 'Panera fundraiser');

    expect(await listPublishedEvents(db)).toHaveLength(2);
  });

  it('leaves the admin’s own list to the admin’s own rows', async () => {
    await synced('2026-09-10', 'Panera fundraiser');

    // The Events screen edits what the school typed. A synced row has no form,
    // no save and no delete there, because the place to change it is Google.
    expect(await listEvents(db)).toEqual([]);
    expect(await listPublishedEvents(db)).toHaveLength(1);
  });
});
