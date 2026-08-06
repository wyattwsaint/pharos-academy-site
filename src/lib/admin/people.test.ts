import { describe, expect, it } from 'vitest';

import { parsePerson } from './people.js';

/**
 * The one form Jill uses to keep the school's people right (#26).
 *
 * The interesting cases are all about *absence*: a bio she has not written and
 * a photograph she does not have are valid states, and the parser has to turn
 * them into null rather than into an empty string, because `''` on the staff
 * page renders an empty paragraph and null renders nothing at all.
 */

/** A complete, valid submission. Individual tests break one field at a time. */
function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    name: 'Mrs. Angela Fecteau',
    role: 'Instructor',
    bio: '',
    photo: '',
    leadershipRank: '',
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('parsing a person submission', () => {
  it('accepts a name and a role, and trims what people paste', () => {
    const result = parsePerson(form({ name: '  Mrs. Angela Fecteau  ' }));
    expect(result.errors).toEqual({});
    expect(result.values.name).toBe('Mrs. Angela Fecteau');
    expect(result.values.role).toBe('Instructor');
  });

  // AC 2's other half. An empty textarea posts `''`; the staff page asks
  // `person.bio &&`, and `''` is falsey — but the *store* would hold a row that
  // reads as "the school wrote nothing" in one column and "the school wrote an
  // empty paragraph" in another, and only one of those is true.
  it('turns an unwritten bio and an unsupplied photograph into null, never into an empty string', () => {
    const result = parsePerson(form({ bio: '   ', photo: '' }));
    expect(result.errors).toEqual({});
    expect(result.values.bio).toBeNull();
    expect(result.values.photo).toBeNull();
  });

  it('keeps a bio the school has written, with its line endings normalised', () => {
    const result = parsePerson(form({ bio: 'One paragraph.\r\n\r\nAnd another.' }));
    expect(result.values.bio).toBe('One paragraph.\n\nAnd another.');
  });

  it('requires a name and a role', () => {
    const result = parsePerson(form({ name: '   ', role: '' }));
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'role']);
  });

  it('reads a leadership rank as a number, and no rank as not leadership', () => {
    expect(parsePerson(form({ leadershipRank: '2' })).values.leadershipRank).toBe(2);
    expect(parsePerson(form({ leadershipRank: '' })).values.leadershipRank).toBeNull();
  });

  it('rejects a leadership rank that is not a whole number from one upwards', () => {
    expect(parsePerson(form({ leadershipRank: '0' })).errors.leadershipRank).toBeTruthy();
    expect(parsePerson(form({ leadershipRank: '-1' })).errors.leadershipRank).toBeTruthy();
    expect(parsePerson(form({ leadershipRank: '1.5' })).errors.leadershipRank).toBeTruthy();
    expect(parsePerson(form({ leadershipRank: 'first' })).errors.leadershipRank).toBeTruthy();
  });

  /*
   * AC 4, enforced where a photograph can actually get in. The column takes a
   * path under `public/`, and the one thing that must never be true of this
   * site is a picture of a person that is not a picture of that person — so an
   * off-site URL, which nobody at the school can vouch for or take down, is
   * refused rather than proxied.
   */
  it('accepts a photograph that lives in this site, and refuses one that does not', () => {
    expect(parsePerson(form({ photo: '/people/jill-kilker.webp' })).errors.photo).toBeUndefined();
    expect(parsePerson(form({ photo: 'https://example.org/face.jpg' })).errors.photo).toBeTruthy();
    expect(parsePerson(form({ photo: 'people/jill.webp' })).errors.photo).toBeTruthy();
    expect(parsePerson(form({ photo: '/people/jill.txt' })).errors.photo).toBeTruthy();
  });
});
