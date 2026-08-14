import { describe, expect, it } from 'vitest';

import { CONFIRM_FIELD } from './confirmation.js';
import { parseUserAction } from './users.js';

/**
 * What the Users screen makes of a submitted form (#200).
 *
 * The deleting half is the point: an unconfirmed delete has to come back as a
 * request to confirm rather than as a delete, because the difference between
 * the two is the whole safety of the screen. Reset and delete themselves are
 * proved against real Postgres in `store.test.ts`; nothing here touches a
 * database.
 */
describe('parseUserAction', () => {
  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.append(name, value);
    return data;
  }

  it('reads a reset, password untrimmed', () => {
    expect(
      parseUserAction(form({ intent: 'reset', userId: 'u1', displayName: 'Jill', password: ' pw ' })),
    ).toEqual({ intent: 'reset', userId: 'u1', displayName: 'Jill', password: ' pw ' });
  });

  it('reads an unconfirmed delete as a request to confirm', () => {
    expect(parseUserAction(form({ intent: 'delete', userId: 'u1', displayName: 'Jill' }))).toEqual({
      intent: 'confirm-delete',
      userId: 'u1',
      displayName: 'Jill',
    });
  });

  it('reads a confirmed delete as a delete', () => {
    expect(
      parseUserAction(
        form({ intent: 'delete', userId: 'u1', displayName: 'Jill', [CONFIRM_FIELD]: 'yes' }),
      ),
    ).toEqual({ intent: 'delete', userId: 'u1', displayName: 'Jill' });
  });

  it('never takes the confirmation on its own word about what to do', () => {
    // A confirm field on a form that says nothing else is not a delete.
    expect(parseUserAction(form({ [CONFIRM_FIELD]: 'yes', userId: 'u1' }))).toBeNull();
  });

  it('names an account that arrived without a name, so the confirmation can speak', () => {
    expect(parseUserAction(form({ intent: 'delete', userId: 'u1' }))).toEqual({
      intent: 'confirm-delete',
      userId: 'u1',
      displayName: 'that account',
    });
  });

  it('is null for a form that says nothing', () => {
    expect(parseUserAction(form({}))).toBeNull();
  });
});
