import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PEOPLE } from '../people/person.js';
import { publicPaths } from '../routes.js';
import { leadershipContact, TEACH_PATH, TEACHER_CONTRACT } from './teach.js';

/**
 * The teacher contract is a file on disk rather than a database row (#30), and
 * that is the whole of what can go wrong with it: the link is right and the
 * file is absent, or the file is there and is not the school's.
 *
 * So both are checked. The bytes are compared against the copy in the mirror,
 * which is what was actually downloaded from the live site — not "a PDF exists
 * at that path", which a placeholder would satisfy.
 */
const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

describe('the teacher contract', () => {
  it('is served from a real file, byte-for-byte the one the school published', () => {
    const served = readFileSync(from(`../../../public${TEACHER_CONTRACT.path}`));
    const captured = readFileSync(from('../../../docs/mirror/pdf/policy-teacher-contract.pdf'));

    expect(served.equals(captured)).toBe(true);
    expect(statSync(from(`../../../public${TEACHER_CONTRACT.path}`)).size).toBeGreaterThan(1000);
  });

  it('saves under a name that says what it is, away from the school’s desktop', () => {
    expect(TEACHER_CONTRACT.filename).toMatch(/^pharos-academy-.*\.pdf$/);
  });
});

describe('the teach page', () => {
  it('sits at the root, off the parent path', () => {
    expect(TEACH_PATH).toBe('/teach');
  });

  // Enumerated like every other public page, so the sitemap carries it and
  // whole-site republishing walks it — the email address on it is read from
  // the school details row.
  it('is an enumerated public route', () => {
    expect(publicPaths()).toContain(TEACH_PATH);
  });
});

/**
 * The page names who to write to (#105), and the whole risk is that the name
 * becomes a second copy of a person — the thing ADR-0004 exists to prevent. So
 * what is asserted is that it comes off the people list and follows it, not
 * that it equals "Jill Kilker".
 */
describe('who a prospective teacher writes to', () => {
  // The school as it stands, and it has to satisfy the sentence the page
  // writes: "our {role}, {name}".
  it('is the Head of School the school has today', () => {
    expect(leadershipContact(PEOPLE)).toMatchObject({
      name: 'Jill Kilker',
      role: 'Head of School',
    });
  });

  // The point of reading the list rather than repeating it (ADR-0004): change
  // the title in the admin, or give the job to somebody else, and the sentence
  // follows without a deploy.
  it('follows the people list rather than a copy of it', () => {
    const renamed = PEOPLE.map((person) =>
      person.slug === 'jill-kilker' ? { ...person, name: 'Mrs. Jill Kilker', role: 'Head' } : person,
    );

    expect(leadershipContact(renamed)).toMatchObject({ name: 'Mrs. Jill Kilker', role: 'Head' });
  });

  // The school's own ordering is what decides it, not the title: seat somebody
  // above her and the sentence moves to them — and because the page prints the
  // role alongside the name, it stays true rather than calling a board chair
  // the Head of School.
  it('follows the school’s ordering rather than the title', () => {
    const chairFirst = PEOPLE.map((person) =>
      person.leadershipRank === null
        ? person
        : { ...person, leadershipRank: person.leadershipRank + 1 },
    ).concat({
      ...PEOPLE[0],
      slug: 'board-chair',
      name: 'A. Chair',
      role: 'Board Chair',
      leadershipRank: 1,
    });

    expect(leadershipContact(chairFirst)).toMatchObject({
      name: 'A. Chair',
      role: 'Board Chair',
    });
  });

  it('is nobody when no one is marked as leadership, rather than an instructor', () => {
    const flat = PEOPLE.map((person) => ({ ...person, leadershipRank: null }));

    expect(leadershipContact(flat)).toBeUndefined();
  });
});
