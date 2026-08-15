import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { getCourse } from '../courses/store.js';
import {
  applyRetirement,
  parseRetirement,
  retirementMessage,
  RETIRE_VALUES,
} from './retirement.js';

/**
 * The Retire button, read and applied (#263).
 *
 * The reading is the half with a trap in it: the course editor posts its Save
 * to the same address, so "is this a retirement?" has to be answerable from the
 * body alone, and answering it wrongly would either swallow a save or retire a
 * class nobody asked to retire.
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

describe('applying it', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createEphemeralDatabase();
  });

  it('retires the class and says so in the office’s own terms', async () => {
    const outcome = await applyRetirement(
      db,
      { slug: 'backyard-botany', retire: true },
      'Jill Kilker',
    );

    expect((await getCourse(db, 'backyard-botany'))?.retiredAt).toBeInstanceOf(Date);
    expect(retirementMessage(outcome)).toContain('Backyard Botany is retired');
    expect(retirementMessage(outcome)).toContain('still at its own address');
  });

  it('brings it back, and says which lists it returns to', async () => {
    await applyRetirement(db, { slug: 'backyard-botany', retire: true }, 'Jill Kilker');
    const outcome = await applyRetirement(
      db,
      { slug: 'backyard-botany', retire: false },
      'Jill Kilker',
    );

    expect((await getCourse(db, 'backyard-botany'))?.retiredAt).toBeNull();
    expect(retirementMessage(outcome)).toBe('Backyard Botany is running again, on every list it left.');
  });

  it('refuses a class that is not there rather than reporting a move it did not make', async () => {
    await expect(
      applyRetirement(db, { slug: 'underwater-basket-weaving', retire: true }, 'Jill Kilker'),
    ).rejects.toThrow(/underwater-basket-weaving/);
  });
});
