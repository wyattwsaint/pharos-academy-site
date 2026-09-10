import { describe, expect, it } from 'vitest';

import {
  NON_DISCRIMINATION_NOTICE,
  SCHOOL_DESCRIPTION,
  SCHOOL_DESCRIPTION_INLINE,
  SCHOOL_DESCRIPTION_TITLE,
  SCHOOL_NAME,
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

/**
 * The notice is the one string on the site with an auditor behind it (#324).
 * Pinned character for character — including the heading's capitals and the
 * Oxford comma before "or ethnic origin" — because a tidy-up of the wording is
 * a change to a filed policy, and nobody should be able to make it in passing.
 */
describe('the notice of non-discrimination', () => {
  it('is the school’s filed wording, character for character', () => {
    expect(NON_DISCRIMINATION_NOTICE.heading).toBe('NOTICE OF NON-DISCRIMINATION POLICY');
    expect(NON_DISCRIMINATION_NOTICE.body).toBe(
      'Pharos Academy does not discriminate on the basis of race, color, nationality, or ethnic origin in the administration of any of its policies or programs. It does reserve the right to select students and faculty on the basis of personal religious commitment and beliefs, academic performance, and willingness to abide by its policies.',
    );
  });

  it('names the school the way the rest of the site does', () => {
    expect(NON_DISCRIMINATION_NOTICE.body).toContain(SCHOOL_NAME);
  });
});
