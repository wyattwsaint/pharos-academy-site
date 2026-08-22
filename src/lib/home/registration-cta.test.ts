import { describe, expect, it } from 'vitest';

import { firstDayLine, registrationCta, REGISTRATION_LABEL } from './registration-cta.js';
import { APPLICATION_PATH } from '../application/application.js';
import type { SchoolDetails } from '../db/schema.js';

/** A school details row, as the office has it filled in. */
function details(overrides: Partial<SchoolDetails> = {}): SchoolDetails {
  return {
    id: 1,
    address: '9 Sherwood Drive\nEnola, PA 17025',
    phone: '717-497-0896',
    email: 'jkilker@enolacog.com',
    schoolYearStart: '2026-08-31',
    mission: 'Partnering with parents.',
    vision: 'Preparing students.',
    giveUrl: 'https://secure.myvanco.com/L-ZZ7H/home',
    registrationFeesUrl: '',
    classFeesUrl: '',
    studyHallFeesUrl: '',
    givingLinkTemplate: '',
    bannerEnabled: false,
    bannerMessage: '',
    bannerDate: null,
    bannerLink: '',
    lastEditedBy: null,
    lastEditedAt: null,
    ...overrides,
  };
}

describe('the registration call to action', () => {
  it('reads "Register now!" over the first day of classes, and points at the application', () => {
    expect(registrationCta(details())).toEqual({
      label: 'Register now!',
      detail: 'Classes begin August 31, 2026',
      href: APPLICATION_PATH,
    });
  });

  // The point of the ticket: the date is not typed into the copy, so the office
  // moving the first day of classes moves what the home page says.
  it('follows the school year start the office edits', () => {
    expect(registrationCta(details({ schoolYearStart: '2027-09-07' })).detail).toBe(
      'Classes begin September 7, 2027',
    );
  });

  // Not "Classes begin " with nothing after it, and not a blank second line —
  // the button still has to make sense with no date behind it (#141 AC 8).
  it('has no second line at all when no school year start is set', () => {
    expect(registrationCta(details({ schoolYearStart: '' })).detail).toBeNull();
    expect(registrationCta(details({ schoolYearStart: 'sometime in August' })).detail).toBeNull();
    // Whatever the date does, the button keeps its words and its destination.
    expect(registrationCta(details({ schoolYearStart: '' })).label).toBe(REGISTRATION_LABEL);
    expect(registrationCta(details({ schoolYearStart: '' })).href).toBe(APPLICATION_PATH);
  });

  /*
   * A stored calendar date is a day, not an instant. Drop the `Z` or the UTC
   * formatting and a date parsed west of Greenwich — which is every region the
   * school's families are in — slides back a day, so the home page advertises a
   * first day of classes that is a day early.
   *
   * The first of January is the case that says so loudest: the slip takes the
   * month and the year with it, so a failure here reads as "31 December 2025"
   * rather than as an off-by-one somebody might talk themselves out of.
   */
  it('reads the stored day as a day, not as midnight somewhere', () => {
    expect(firstDayLine('2027-01-01')).toBe('Classes begin January 1, 2027');
  });
});
