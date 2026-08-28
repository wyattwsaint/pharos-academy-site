import { describe, expect, it } from 'vitest';

import {
  formatPhoneAsTyped,
  isPhoneNumber,
  phoneError,
  PHONE_FORMAT_MESSAGE,
  PHONE_REQUIRED_MESSAGE,
} from './forms.js';

/**
 * The phone rule, once (#311).
 *
 * It is tested here rather than beside the inquiry because it is not the
 * inquiry's: the application asks for the same number under a different name
 * (#310), and the reason this module exists is that one form must not come to
 * accept what the other refuses. What is proved is the shape a parent may type,
 * the dashes appearing as they type it, and the two sentences they read when it
 * is wrong.
 */

describe('the shape a phone number has to have', () => {
  it('accepts ten digits with dashes, and nothing else', () => {
    expect(isPhoneNumber('717-555-0142')).toBe(true);
  });

  it.each([
    ['7175550142', 'no dashes at all'],
    ['717 555 0142', 'spaces instead of dashes'],
    ['(717) 555-0142', 'the shape a phone’s contacts app hands over'],
    ['717-555-014', 'nine digits'],
    ['717-555-01422', 'eleven digits'],
    ['1-717-555-0142', 'a country code'],
    ['717-555-0142 x12', 'an extension'],
    ['+44 20 7946 0958', 'an international number'],
    ['seven one seven', 'words'],
    ['', 'nothing'],
  ])('refuses %s (%s)', (value) => {
    expect(isPhoneNumber(value)).toBe(false);
  });
});

describe('the dashes as the parent types', () => {
  it('grows a dash at three digits and again at six', () => {
    expect(formatPhoneAsTyped('7')).toBe('7');
    expect(formatPhoneAsTyped('717')).toBe('717');
    expect(formatPhoneAsTyped('7175')).toBe('717-5');
    expect(formatPhoneAsTyped('717555')).toBe('717-555');
    expect(formatPhoneAsTyped('7175550')).toBe('717-555-0');
    expect(formatPhoneAsTyped('7175550142')).toBe('717-555-0142');
  });

  it('turns a pasted number into the accepted shape rather than an error', () => {
    // The common case on a phone: the number arrives from a contacts app
    // already punctuated, and refusing a correct number over its punctuation
    // would be the form’s fault rather than the family’s.
    for (const pasted of ['(717) 555-0142', '717.555.0142', '717 555 0142', '717-555-0142']) {
      expect(formatPhoneAsTyped(pasted)).toBe('717-555-0142');
    }
  });

  it('stops at ten digits, so the field cannot outgrow itself', () => {
    expect(formatPhoneAsTyped('71755501429999')).toBe('717-555-0142');
  });

  it('is stable once the number is right, so typing on does nothing', () => {
    expect(formatPhoneAsTyped(formatPhoneAsTyped('7175550142'))).toBe('717-555-0142');
  });

  it('leaves an empty field empty rather than seeding a dash', () => {
    expect(formatPhoneAsTyped('')).toBe('');
    expect(formatPhoneAsTyped('abc')).toBe('');
  });
});

describe('what a parent reads when it is wrong', () => {
  it('asks for the number when there is none', () => {
    expect(phoneError('')).toBe(PHONE_REQUIRED_MESSAGE);
  });

  it('shows the shape when there is a number of the wrong one', () => {
    expect(phoneError('717-555-014')).toBe(PHONE_FORMAT_MESSAGE);
  });

  it('says nothing at all when it is right', () => {
    expect(phoneError('717-555-0142')).toBeUndefined();
  });

  it('names an example rather than a regular expression', () => {
    // A family reads this sentence, not the pattern above it.
    expect(PHONE_FORMAT_MESSAGE).toContain('717-555-0142');
  });
});
