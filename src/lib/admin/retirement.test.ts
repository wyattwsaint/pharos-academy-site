import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { getCourse } from '../courses/store.js';
import { getPerson } from '../people/store.js';
import {
  applyRetirement,
  COURSE_RETIREMENT,
  parseRetirement,
  PERSON_RETIREMENT,
  RETIRE_VALUES,
} from './retirement.js';

/**
 * The Retire button, read and applied (#263, #266).
 *
 * The reading is the half with a trap in it: both editors post their Save to
 * the same address the button does, so "is this a retirement?" has to be
 * answerable from the body alone, and answering it wrongly would either swallow
 * a save or retire something nobody asked to retire. It is one reader for both
 * records, which is why the reading is proved once.
 *
 * What the two records do not share is the sentence afterwards, so each subject
 * is applied and read back on its own.
 */

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.append(name, value);
  return data;
}

describe('reading the button', () => {
  it('reads a retirement, with the slug the row carried', () => {
    expect(parseRetirement(form({ retire: RETIRE_VALUES.retire, slug: 'backyard-botany' }))).toEqual(
      { slug: 'backyard-botany', retire: true },
    );
  });

  it('reads the way back', () => {
    expect(
      parseRetirement(form({ retire: RETIRE_VALUES.unretire, slug: 'backyard-botany' })),
    ).toEqual({ slug: 'backyard-botany', retire: false });
  });

  it('takes the slug from the address when the screen is the class’s own', () => {
    const read = parseRetirement(form({ retire: RETIRE_VALUES.retire }), 'algebra-1');
    expect(read).toEqual({ slug: 'algebra-1', retire: true });
  });

  it('is not a retirement when the form is the editor’s Save', () => {
    // The whole reason `retire` is its own field: a course form posted to the
    // same address must fall through to the parser rather than be read as a
    // button nobody pressed.
    expect(parseRetirement(form({ title: 'Backyard Botany', slug: 'backyard-botany' }))).toBeNull();
  });

  it('is not a retirement when nothing says which class', () => {
    expect(parseRetirement(form({ retire: RETIRE_VALUES.retire }))).toBeNull();
  });

  it('refuses a word that is neither direction rather than guessing one', () => {
    // The lenient reading — anything that is not "yes" means bring it back —
    // is the one nobody would notice: a garbled post would quietly put a class
    // the school retired back on every list.
    expect(parseRetirement(form({ retire: 'maybe', slug: 'backyard-botany' }))).toBeNull();
  });
});

describe('applying it to a class', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createEphemeralDatabase();
  });

  it('retires the class and says so in the office’s own terms', async () => {
    const outcome = await applyRetirement(
      db,
      COURSE_RETIREMENT,
      { slug: 'backyard-botany', retire: true },
      'Jill Kilker',
    );

    expect((await getCourse(db, 'backyard-botany'))?.retiredAt).toBeInstanceOf(Date);
    expect(COURSE_RETIREMENT.message(outcome)).toContain('Backyard Botany is retired');
    expect(COURSE_RETIREMENT.message(outcome)).toContain('still at its own address');
  });

  it('brings it back, and says which lists it returns to', async () => {
    await applyRetirement(db, COURSE_RETIREMENT, { slug: 'backyard-botany', retire: true }, 'Jill Kilker');
    const outcome = await applyRetirement(
      db,
      COURSE_RETIREMENT,
      { slug: 'backyard-botany', retire: false },
      'Jill Kilker',
    );

    expect((await getCourse(db, 'backyard-botany'))?.retiredAt).toBeNull();
    expect(COURSE_RETIREMENT.message(outcome)).toBe(
      'Backyard Botany is running again, on every list it left.',
    );
  });

  it('refuses a class that is not there rather than reporting a move it did not make', async () => {
    await expect(
      applyRetirement(
        db,
        COURSE_RETIREMENT,
        { slug: 'underwater-basket-weaving', retire: true },
        'Jill Kilker',
      ),
    ).rejects.toThrow(/underwater-basket-weaving/);
  });
});

describe('applying it to a person', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createEphemeralDatabase();
  });

  it('retires them and says what became of what they teach', async () => {
    // The sentence carries the classes on purpose: "what happens to Algebra 1
    // now?" is the question retiring an instructor raises, and a screen that
    // made the office go and look would be answering it badly.
    const outcome = await applyRetirement(
      db,
      PERSON_RETIREMENT,
      { slug: 'george-jensen', retire: true },
      'Jill Kilker',
    );

    expect((await getPerson(db, 'george-jensen'))?.retiredAt).toBeInstanceOf(Date);
    expect(PERSON_RETIREMENT.message(outcome)).toContain('is retired');
    expect(PERSON_RETIREMENT.message(outcome)).toContain('off the staff page');
    expect(PERSON_RETIREMENT.message(outcome)).toContain('no longer name them');
  });

  it('is never refused for somebody who teaches', async () => {
    // George teaches Algebra 1, and the school must be able to act on a
    // departure the day it happens rather than reassigning courses first.
    await expect(
      applyRetirement(db, PERSON_RETIREMENT, { slug: 'george-jensen', retire: true }, 'Jill Kilker'),
    ).resolves.toBeTruthy();
  });

  it('brings them back, to the staff page and to their classes', async () => {
    await applyRetirement(db, PERSON_RETIREMENT, { slug: 'george-jensen', retire: true }, 'Jill Kilker');
    const outcome = await applyRetirement(
      db,
      PERSON_RETIREMENT,
      { slug: 'george-jensen', retire: false },
      'Jill Kilker',
    );

    expect((await getPerson(db, 'george-jensen'))?.retiredAt).toBeNull();
    expect(PERSON_RETIREMENT.message(outcome)).toContain('back on the staff page');
    expect(PERSON_RETIREMENT.message(outcome)).toContain('named again');
  });

  it('refuses somebody who is not there rather than reporting a move it did not make', async () => {
    await expect(
      applyRetirement(db, PERSON_RETIREMENT, { slug: 'nobody-at-all', retire: true }, 'Jill Kilker'),
    ).rejects.toThrow(/nobody-at-all/);
  });
});
