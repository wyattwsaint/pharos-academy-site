import { describe, expect, it } from 'vitest';

import {
  SCHOOL_DESCRIPTION,
  SCHOOL_DESCRIPTION_INLINE,
  SCHOOL_DESCRIPTION_TITLE,
} from './site.js';

/**
 * The description drifted once already — the hero said "homeschool" while
 * nineteen mirrored pages, the machine-readable summary and the structured data
 * said "microschool" (#137). These pin the string itself, so a change to it is a
 * change somebody has to make on purpose.
 */
describe('the school description', () => {
  it('is the school’s own wording, exactly', () => {
    expect(SCHOOL_DESCRIPTION).toBe('A Christian, classical hybrid microschool');
  });

  it('reads mid-sentence without a second string to keep in step', () => {
    expect(SCHOOL_DESCRIPTION_INLINE).toBe('a Christian, classical hybrid microschool');
  });

  it('title-cases for the hero lockup, comma and all', () => {
    expect(SCHOOL_DESCRIPTION_TITLE).toBe('A Christian, Classical Hybrid Microschool');
  });
});
