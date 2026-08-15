import { describe, expect, it } from 'vitest';

import { listSentence } from './prose.js';

/**
 * The join rule, which two unrelated screens now depend on (#233, #262).
 *
 * It was private to `meetings.ts` and asserted only through "56 meetings on
 * Mondays and Wednesdays". The person delete needs the same rule for class
 * titles, and a second copy of a punctuation rule is how two sentences on one
 * site come to disagree about a comma — so it moved here and is proved on its
 * own.
 */
describe('joining words the way the school writes them', () => {
  it('says nothing for nothing', () => {
    // A caller with an empty list has a different sentence to write, not a
    // shorter one, so this refuses to invent "none" on their behalf.
    expect(listSentence([])).toBe('');
  });

  it('leaves one alone', () => {
    expect(listSentence(['Latin I'])).toBe('Latin I');
  });

  it('joins two with "and", never a slash or a comma', () => {
    expect(listSentence(['Latin I', 'Art'])).toBe('Latin I and Art');
    expect(listSentence(['Mondays', 'Wednesdays'])).toBe('Mondays and Wednesdays');
  });

  it('joins three or more with commas and a final "and"', () => {
    expect(listSentence(['Latin I', 'Art', 'Kingdom Math'])).toBe('Latin I, Art and Kingdom Math');
    expect(listSentence(['a', 'b', 'c', 'd'])).toBe('a, b, c and d');
  });

  it('uses no Oxford comma, because the site’s copy does not', () => {
    expect(listSentence(['a', 'b', 'c'])).not.toContain('b, and');
  });
});
