import { describe, expect, it } from 'vitest';

import { saveErrorMessage } from './save-errors.js';

const CLASS_WORDING = {
  duplicate: 'there is already a class with that title. Edit that one instead.',
} as const;

describe('what the admin says when a write is refused', () => {
  it("uses the screen's own words for a duplicate", () => {
    const message = saveErrorMessage(
      new Error('duplicate key value violates unique constraint "courses_slug_unique"'),
      CLASS_WORDING,
    );
    expect(message).toBe(
      'Nothing was saved — there is already a class with that title. Edit that one instead.',
    );
  });

  it('recognises the refusal however the driver spells it', () => {
    for (const detail of [
      'duplicate key value violates unique constraint',
      'UNIQUE constraint failed: courses.slug',
      'Duplicate Key',
    ]) {
      expect(saveErrorMessage(new Error(detail), CLASS_WORDING)).toContain(
        'there is already a class with that title',
      );
    }
  });

  it('quotes anything else back, so the office can pass it on', () => {
    expect(saveErrorMessage(new Error('connection terminated'), CLASS_WORDING)).toBe(
      'Nothing was saved — connection terminated',
    );
  });

  it('says "created" where that is what failed', () => {
    expect(
      saveErrorMessage(new Error('duplicate key'), {
        duplicate: 'there is already a policy at that address. Edit that one instead.',
        verb: 'created',
      }),
    ).toBe(
      'Nothing was created — there is already a policy at that address. Edit that one instead.',
    );
  });

  it('copes with something thrown that was never an Error', () => {
    expect(saveErrorMessage('the pool is closed', CLASS_WORDING)).toBe(
      'Nothing was saved — the pool is closed',
    );
  });
});
