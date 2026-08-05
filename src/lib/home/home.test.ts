import { describe, expect, it } from 'vitest';

import { ANNOUNCEMENTS, hasAnnouncements } from './announcements.js';
import { HOPE, INSTRUCTORS } from './content.js';
import { NAV_ITEMS, SECTION_ORDER } from './sections.js';
import { allClasses, classCountsByDay, DAYS, TIMETABLE } from './timetable.js';

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
  // `PUBLIC_ROUTES` still holds only `/`. Until the pages behind About and
  // Classes exist, every nav item is an on-page anchor — a nav pointing at a
  // 404 is worse than one pointing at the section that answers the question.
  it('points only at sections this page actually renders', () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith('#')).toBe(true);
      expect(SECTION_ORDER).toContain(item.href.slice(1));
    }
  });
});

describe('announcements', () => {
  it('start empty, which is the section’s normal state', () => {
    expect(ANNOUNCEMENTS).toEqual([]);
    expect(hasAnnouncements()).toBe(false);
  });

  it('show the section as soon as there is one', () => {
    expect(hasAnnouncements([{ id: 'a', headline: 'Snow day' }])).toBe(true);
  });

  it('requires link text whenever there is a link', () => {
    // "Read more" is not a link name, and a bare URL is worse. Enforced on the
    // data rather than in the template, so the rule survives a second surface.
    for (const announcement of ANNOUNCEMENTS) {
      if (announcement.href) expect(announcement.linkLabel).toBeTruthy();
    }
  });
});

describe('the timetable', () => {
  it('gives every class a unique id, because each becomes a panel id', () => {
    const ids = allClasses().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has one column of classes per day, in every slot', () => {
    for (const slot of TIMETABLE) {
      expect(slot.classes).toHaveLength(DAYS.length);
    }
  });

  it('counts the classes per day rather than trusting a typed number', () => {
    // The prototype's heading said "6 classes" over a column holding five.
    // Deriving the count is the whole fix.
    const counts = classCountsByDay();
    expect(counts).toHaveLength(DAYS.length);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(allClasses().length);
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
