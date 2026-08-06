import { describe, expect, it } from 'vitest';

import { HOPE, INSTRUCTORS } from './content.js';
import { publicPaths } from '../routes.js';
import { INQUIRY_HREF, NAV_ITEMS, SECTION_ORDER } from './sections.js';
import {
  activeDayTracks,
  allClasses,
  classCountOnTrack,
  DAY_TRACKS,
  TIMETABLE,
} from './timetable.js';

describe('the section order', () => {
  // #9's resolution comment, with its items 2 and 3 merged into the one
  // timetable section variant E arrived at. Spelled out here rather than
  // re-derived, so a reordering has to be a deliberate edit in two places.
  it('is #9 order, with the week and the classes merged', () => {
    expect([...SECTION_ORDER]).toEqual([
      'hero',
      'announcements',
      'week',
      'teachers',
      'costs',
      'faith',
      'inquiry',
    ]);
  });

  it('names every section exactly once', () => {
    expect(new Set(SECTION_ORDER).size).toBe(SECTION_ORDER.length);
  });
});

describe('the nav', () => {
  // A nav pointing at a 404 is worse than one pointing at the section that
  // answers the question, so every item is either an enumerated public route or
  // a section this page actually renders. About and Admissions are absent
  // because their pages are.
  it('points only at real routes and sections this page renders', () => {
    const routes = new Set(publicPaths());
    for (const item of NAV_ITEMS) {
      if (item.href.includes('#')) {
        expect(SECTION_ORDER, item.label).toContain(item.href.split('#')[1]);
      } else {
        expect(routes, item.label).toContain(item.href);
      }
    }
  });

  // Rooted, not bare: the header is on the class pages too now, where a bare
  // fragment silently does nothing.
  it('roots every anchor at the home page', () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith('/'), item.label).toBe(true);
    }
    expect(INQUIRY_HREF).toBe('/#inquiry');
  });
});

describe('the timetable', () => {
  it('gives every class a unique id, because each becomes a panel id', () => {
    const ids = allClasses().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('files every class under one of the school’s four day tracks', () => {
    // CONTEXT.md's "day track" — the school's own unit of scheduling, and all
    // four of them, not the three that happen to be occupied.
    expect([...DAY_TRACKS]).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
    for (const slot of TIMETABLE) {
      for (const track of Object.keys(slot.classes)) {
        expect(DAY_TRACKS).toContain(track);
      }
    }
  });

  it('counts the classes per day track rather than trusting a typed number', () => {
    // The prototype's heading said "6 classes" over a column holding five.
    // Deriving the count is the whole fix.
    const total = DAY_TRACKS.reduce((sum, track) => sum + classCountOnTrack(track), 0);
    expect(total).toBe(allClasses().length);
  });

  it('treats an empty day track as complete, and simply does not draw it', () => {
    // The Tuesday track is routinely empty and that is a complete year, not a
    // gap (CONTEXT.md). It stays in the domain type and out of the grid.
    expect(classCountOnTrack('Tuesday')).toBe(0);
    expect(activeDayTracks()).toEqual(['Monday', 'Wednesday', 'Thursday']);
  });

  it('draws a Tuesday column the moment a Tuesday course exists', () => {
    const withTuesday = [
      {
        time: '9:00',
        classes: {
          Tuesday: [
            { id: 't', title: 'T', ends: 'ends 10:00 a.m.', meta: 'Ages 5–8', description: 'x' },
          ],
        },
      },
    ];
    expect(activeDayTracks(withTuesday)).toEqual(['Tuesday']);
  });

  it('keeps the school’s own casing in the times', () => {
    // "a.m.", not "A.M." — nothing on this grid is upper-cased in CSS, and the
    // strings are typed the way the school types them.
    for (const entry of allClasses()) {
      expect(entry.ends).toMatch(/\b[ap]\.m\.$/);
    }
  });
});

describe('the H.O.P.E. row', () => {
  it('spells HOPE, in order', () => {
    expect(HOPE.map((entry) => entry.letter).join('')).toBe('HOPE');
  });

  it('gives each letter a card image', () => {
    for (const entry of HOPE) {
      expect(entry.image).toMatch(/^\/imagery\/hope-[hope]\.webp$/);
    }
  });
});

describe('the instructors', () => {
  it('names three of the nine, each with a role and credentials', () => {
    expect(INSTRUCTORS).toHaveLength(3);
    for (const person of INSTRUCTORS) {
      expect(person.name).toBeTruthy();
      expect(person.role).toBeTruthy();
      expect(person.credentials).toBeTruthy();
    }
  });
});
