import { describe, expect, it } from 'vitest';

import { announcementBanner, formatBannerDate } from './announcement-banner.js';
import type { SchoolDetails } from '../db/schema.js';

/** A school details row with the banner switched on and filled in. */
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
    bannerEnabled: true,
    bannerMessage: 'Register now! Classes begin',
    bannerDate: '2026-08-31',
    bannerLink: 'https://example.org/register',
    lastEditedBy: null,
    lastEditedAt: null,
    ...overrides,
  };
}

describe('the announcement banner', () => {
  it('carries the message, its date and its link when the office switches it on', () => {
    const banner = announcementBanner(details());

    expect(banner).toEqual({
      message: 'Register now! Classes begin',
      date: 'August 31',
      href: 'https://example.org/register',
    });
  });

  // The switch is what the office turns after the start of term, without a
  // developer and without emptying the fields it will want again next year.
  it('is nothing at all when the switch is off, fields still filled in', () => {
    expect(announcementBanner(details({ bannerEnabled: false }))).toBeNull();
  });

  // Null rather than a bar with no words in it: a caller cannot draw an empty
  // region it was never handed.
  it('is nothing when the message or the date is missing', () => {
    expect(announcementBanner(details({ bannerMessage: '   ' }))).toBeNull();
    expect(announcementBanner(details({ bannerDate: null }))).toBeNull();
  });

  it('reads a message with no link as unlinked, not as a link to nowhere', () => {
    expect(announcementBanner(details({ bannerLink: '' }))?.href).toBeNull();
  });
});

describe('the banner date', () => {
  // American, and no ordinal suffix — the school's own style, settled on #15.
  it('is the American month and day, with no suffix and no year', () => {
    expect(formatBannerDate('2026-08-31')).toBe('August 31');
    expect(formatBannerDate('2027-01-05')).toBe('January 5');
  });

  /*
   * A calendar date is not an instant. Rendered in the *rendering* region
   * rather than in UTC, `2026-08-31` is 30 August anywhere west of Greenwich —
   * which is every region this site is served from, and every laptop it is
   * built on.
   *
   * The assertion is the same one as above and the value is what carries the
   * point: the last day of a month is the only date where the off-by-one is
   * visible as a different month as well as a different day.
   */
  it('renders the day that was typed, not the day before it', () => {
    expect(formatBannerDate('2026-08-31')).toBe('August 31');
    expect(formatBannerDate('2026-09-01')).toBe('September 1');
  });
});
