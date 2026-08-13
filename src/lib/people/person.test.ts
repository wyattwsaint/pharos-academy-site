import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { MIRROR_COURSES, sameText } from '../courses/mirror.test-helper.js';
import {
  bySlug,
  instructorOf,
  instructorsAmong,
  leadershipAmong,
  PEOPLE,
  slugify,
  type Person,
} from './person.js';

/**
 * The one list, checked against the two things it replaced (#26).
 *
 * The seed is measured against `docs/mirror/` — the capture of the live site —
 * rather than against a fixture written beside this test, for the same reason
 * the catalogue is: the school's staff page and its course data are what the
 * names have to agree with, and a disagreement is a thing a person must look
 * at.
 */

/** The seed as the store hands it back: rows, with an unstamped stamp. */
const seeded: Person[] = PEOPLE.map((person) => ({
  ...person,
  lastEditedBy: null,
  lastEditedAt: null,
}));

/**
 * The people the school has written a paragraph about, in seed order.
 *
 * One list rather than a literal in each test, so the two checks below cannot
 * drift apart: one pins the whole set, and the other reads the same names as
 * its exemptions. Adding a bio to `PEOPLE` without adding the slug here fails
 * the first, which is where a paragraph nobody supplied gets caught.
 */
const SUPPLIED_BIOS = ['jill-kilker', 'george-jensen', 'kathy-liddick', 'mandy-saint'];

describe('one list, not two', () => {
  it('names every instructor the catalogue points at', () => {
    // AC 1, the load-bearing half: a course cannot name somebody who is not a
    // person, which is what makes "no separate instructor entity" true rather
    // than aspirational.
    const directory = bySlug(seeded);
    for (const course of CATALOGUE) {
      expect(directory.has(course.instructorSlug), course.title).toBe(true);
    }
  });

  it('holds Pastor George Jensen exactly once, in both his roles', () => {
    // The whole argument for this module. He is leadership *and* teaches
    // Algebra 1; a second instructor list would hold a second copy of him, and
    // the two would disagree the first time one was corrected.
    const george = seeded.filter((person) => person.name.includes('George Jensen'));
    expect(george).toHaveLength(1);

    expect(leadershipAmong(seeded).map((person) => person.slug)).toContain('george-jensen');
    expect(instructorsAmong(seeded, CATALOGUE).map((entry) => entry.person.slug)).toContain(
      'george-jensen',
    );
  });

  it('agrees with the names the school publishes on its own courses', () => {
    const directory = bySlug(seeded);
    for (const course of CATALOGUE) {
      const published = MIRROR_COURSES.find(
        (mirrored) => sameText(mirrored.title) === sameText(course.title),
      );
      expect(directory.get(course.instructorSlug)?.name, course.title).toBe(published?.instructor);
    }
  });

  it('has eight people teaching the nineteen courses, one of them eight of them', () => {
    const teaching = instructorsAmong(seeded, CATALOGUE);
    expect(teaching).toHaveLength(8);

    const busiest = teaching.reduce((most, entry) =>
      entry.courses.length > most.courses.length ? entry : most,
    );
    expect(busiest.person.name).toBe('Mrs. Mandy Saint');
    expect(busiest.courses).toHaveLength(8);
  });

  it('leaves being an instructor derived, never stored', () => {
    // There is no `isInstructor` to go stale: reassign a course and the staff
    // page, the class page and the timetable all move together.
    for (const person of seeded) {
      expect(Object.keys(person)).not.toContain('isInstructor');
    }
    const reassigned = CATALOGUE.map((course) => ({ ...course, instructorSlug: 'kathy-liddick' }));
    expect(instructorsAmong(seeded, reassigned).map((entry) => entry.person.slug)).toEqual([
      'kathy-liddick',
    ]);
  });
});

describe('an optional bio and an optional photo', () => {
  it('leaves the instructors the school has written nothing about without a bio', () => {
    // Not a gap to fill with filler: the school has published no bio for them,
    // and inventing one is the failure this asserts against. Mandy Saint is
    // exempt because hers is not invented — the school supplied the text (#150).
    // The exemptions are `SUPPLIED_BIOS`, the same list the test below pins, so
    // a second one cannot be smuggled in through this loop without failing
    // there.
    for (const entry of instructorsAmong(seeded, CATALOGUE)) {
      if (entry.person.leadershipRank !== null) continue;
      if (SUPPLIED_BIOS.includes(entry.person.slug)) continue;
      expect(entry.person.bio, entry.person.name).toBeNull();
    }
  });

  it('photographs the four the school supplied, and nobody else', () => {
    // Slot 4 (#13) was blocked on real, consenting adults; #99 unblocked it for
    // four of them. The other six stay null rather than borrowing a face: a
    // generated portrait or a stock photograph under a named member of staff is
    // the one substitution that would be dishonest.
    const photographed = seeded.filter((person) => person.photo !== null).map((p) => p.slug);
    expect(photographed).toEqual([
      'jill-kilker',
      'george-jensen',
      'kathy-liddick',
      'mandy-saint',
    ]);
  });

  it('points every photograph at a file that is actually on disk', () => {
    // A typo in a path renders as a broken image on the staff page, under
    // somebody's name, and nothing else in the stack would catch it: the column
    // is free text and the browser fails silently. This is the check that turns
    // that into a failing suite.
    for (const person of seeded) {
      if (person.photo === null) continue;
      // Site-relative, like the admin's own check — not `.webp`-only, which
      // would fail a portrait the school later supplies as a JPEG for a reason
      // this test has no opinion about.
      expect(person.photo, person.name).toMatch(/^\/[^/]/);
      const onDisk = new URL(`../../../public${person.photo}`, import.meta.url);
      expect(existsSync(onDisk), `${person.name}: ${person.photo}`).toBe(true);
    }
  });

  it('carries the four bios the school has supplied, and only those', () => {
    // Mandy Saint is the first instructor with one (#150). The other six stay
    // null for the reason the seed gives: the school has published nothing about
    // them, and a paragraph of filler under a real name is an invention.
    const withBios = seeded.filter((person) => person.bio !== null).map((person) => person.slug);
    expect(withBios).toEqual(SUPPLIED_BIOS);
  });
});

describe('leadership', () => {
  it('renders in the order the school put them in', () => {
    expect(leadershipAmong(seeded).map((person) => person.slug)).toEqual([
      'jill-kilker',
      'george-jensen',
      'kathy-liddick',
    ]);
  });

  it('is a rank rather than a flag, so a new hire can be placed', () => {
    const added: Person = { ...seeded[0]!, slug: 'new-hire', name: 'New Hire', leadershipRank: 2 };
    const ranked = leadershipAmong([...seeded, added]).map((person) => person.slug);
    expect(ranked.indexOf('new-hire')).toBeGreaterThan(ranked.indexOf('jill-kilker'));
  });
});

describe('resolving a course to its instructor', () => {
  it('gives the person the catalogue names', () => {
    const algebra = CATALOGUE.find((course) => course.slug === 'algebra-1')!;
    expect(instructorOf(bySlug(seeded), algebra).name).toBe('Pastor George Jensen');
  });

  it('refuses rather than printing a class with no instructor', () => {
    const orphan = { ...CATALOGUE[0]!, instructorSlug: 'nobody' };
    expect(() => instructorOf(bySlug(seeded), orphan)).toThrow(/nobody/);
  });
});

describe('slugs for people the school hires later', () => {
  it('drops the honorific, because a form of address is not an address', () => {
    expect(slugify('Mrs. Mandy Saint')).toBe('mandy-saint');
    expect(slugify('Pastor George Jensen')).toBe('george-jensen');
    expect(slugify('Ms. Robyn Lach')).toBe('robyn-lach');
  });

  it('matches the slugs already in the seed', () => {
    for (const person of PEOPLE) {
      expect(slugify(person.name), person.name).toBe(person.slug);
    }
  });

  it('survives punctuation, accents and stray spacing', () => {
    expect(slugify('  Dr. Renée   O’Brien-Smith ')).toBe('renee-o-brien-smith');
  });
});
