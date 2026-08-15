import { describe, expect, it } from 'vitest';

import { parsePerson, personDeletion } from './people.js';

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

  // The one that looks like a path and is not: `//host/face.jpg` is a
  // protocol-relative URL, and a check that only asked for a leading slash
  // would let exactly the off-site face this refuses straight through.
  it('refuses a protocol-relative URL, and a path that climbs out of the site', () => {
    expect(parsePerson(form({ photo: '//example.org/face.jpg' })).errors.photo).toBeTruthy();
    expect(parsePerson(form({ photo: '/../secrets/face.png' })).errors.photo).toBeTruthy();
  });
});

/**
 * The last thing somebody reads before an irreversible press (#262).
 *
 * Proved here rather than through a browser because the browser can only ever
 * show one of these three cases at a time, and the case that matters most is
 * the one the suite is least likely to arrange: a person who teaches several
 * classes, where the sentence has to read as English rather than as a list.
 */
describe('the confirmation before a person is deleted', () => {
  it('names the person in the heading and on the button', () => {
    // On the button as well as in the heading, because the button is what the
    // hand is on — "Yes, delete" beside the wrong heading is how the wrong
    // person goes.
    const deletion = personDeletion('Mrs. Angela Fecteau', []);
    expect(deletion.heading).toBe('Delete Mrs. Angela Fecteau?');
    expect(deletion.confirmLabel).toBe('Yes, delete Mrs. Angela Fecteau');
    expect(deletion.goes).toContain('Mrs. Angela Fecteau');
  });

  it('says plainly that somebody who teaches nothing affects nothing', () => {
    // Not "0 classes will have no instructor", and not an empty list: the
    // duplicate and the never-started are most of what this delete is for, and
    // what the school needs to read is that pressing it is uneventful.
    const { classes } = personDeletion('Mrs. Suite Newcomer', []);
    expect(classes).toBe('They teach no classes, so nothing else on the site changes.');
    expect(classes).not.toMatch(/\b0\b|\[|\]/);
  });

  it('names the one class, in the singular', () => {
    const { classes } = personDeletion('Mrs. Angela Fecteau', ['Latin I']);
    expect(classes).toMatch(/^Latin I will have no instructor\./);
    // Its own screen is where an instructor is given back, and the sentence
    // says so — the delete deliberately does not offer to reassign.
    expect(classes).toContain("class's own screen");
  });

  it('names two classes with "and", the way the school writes them', () => {
    // The ticket's own example sentence.
    const { classes } = personDeletion('Mrs. Angela Fecteau', ['Latin I', 'Art']);
    expect(classes).toMatch(/^Latin I and Art will have no instructor\./);
  });

  it('names several with commas and a final "and", and no Oxford comma', () => {
    const { classes } = personDeletion('Dr. Mandy Saint', ['Latin I', 'Art', 'Kingdom Math']);
    expect(classes).toMatch(/^Latin I, Art and Kingdom Math will have no instructor\./);
    expect(classes).not.toContain('Art, and');
  });

  it('says there is no undo, whoever it is and whatever they teach', () => {
    // The one sentence that is the same every time, because the fact it states
    // is the same every time (ADR-0021: no undo, no soft delete, no trash).
    for (const titles of [[], ['Latin I'], ['Latin I', 'Art']]) {
      expect(personDeletion('Somebody', titles).undo).toMatch(/no undo/i);
    }
  });
});
