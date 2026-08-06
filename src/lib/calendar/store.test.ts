import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { eventSlug } from './event.js';
import {
  createEvent,
  deleteEvent,
  getSchoolYear,
  listEvents,
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

  it('starts empty, which is a school with nothing extra on rather than a broken one', async () => {
    expect(await listEvents(db)).toEqual([]);
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
    const [event] = await listEvents(db);
    expect(event).toMatchObject({ startTime: null, place: null, note: null });
  });

  it('edits one, and takes a cancelled one off the calendar', async () => {
    const slug = eventSlug(draft.heldOn, draft.title);
    await createEvent(db, slug, draft, 'Jill Kilker');
    const edited = await saveEvent(db, slug, { ...draft, startTime: '19:00' }, 'George Jensen');
    expect(edited.startTime).toBe('19:00');
    expect(edited.lastEditedBy).toBe('George Jensen');

    await deleteEvent(db, slug);
    expect(await listEvents(db)).toEqual([]);
  });

  it('lists them earliest first, whatever order they were typed in', async () => {
    await createEvent(
      db,
      '2027-05-12-field-day',
      { heldOn: '2027-05-12', title: 'Field day', startTime: null, place: null, note: null },
      'Jill Kilker',
    );
    await createEvent(db, eventSlug(draft.heldOn, draft.title), draft, 'Jill Kilker');
    expect((await listEvents(db)).map((event) => event.heldOn)).toEqual([
      '2026-10-17',
      '2027-05-12',
    ]);
  });
});
