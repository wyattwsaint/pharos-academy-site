import { describe, expect, it } from 'vitest';

import {
  announcementSlug,
  currentAnnouncements,
  isCurrent,
  SEEDED_ANNOUNCEMENTS,
  STALE_AFTER_DAYS,
  type Announcement,
} from './announcement.js';

/**
 * The rule the whole ticket turns on (#27 AC 2).
 *
 * The homepage section hides itself once the newest item goes stale, and that
 * is not a cosmetic nicety: a school that posts nothing for two months has to
 * look like a school with a tidy homepage, not one that stopped caring in July.
 * So staleness is a pure function of a posted date and a clock, proved here
 * against both edges of the window rather than eyeballed on a page.
 */

/** An announcement with only the fields the freshness rule looks at. */
function on(postedOn: string): Announcement {
  return {
    slug: `posted-${postedOn}`,
    headline: 'Something happened',
    body: 'A short body.',
    postedOn,
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
    lastEditedBy: null,
    lastEditedAt: null,
  };
}

const NOW = new Date('2026-10-01T12:00:00Z');

describe('when an announcement is still current', () => {
  it('counts six weeks, which is what “~6 weeks” in the spec means here', () => {
    expect(STALE_AFTER_DAYS).toBe(42);
  });

  it('is current the day it is posted', () => {
    expect(isCurrent(on('2026-10-01'), NOW)).toBe(true);
  });

  // The boundary in both directions, because "~6 weeks" written as `<` rather
  // than `<=` is a whole day of a fundraiser silently disappearing early.
  it('is still current on the forty-second day, and stale on the forty-third', () => {
    expect(isCurrent(on('2026-08-20'), NOW)).toBe(true); // 42 days before
    expect(isCurrent(on('2026-08-19'), NOW)).toBe(false); // 43 days before
  });

  // Jill types a date. Nothing stops her typing next Monday's, and an
  // announcement written ahead of an event is the ordinary reason to.
  it('treats a date in the future as current, not as impossible', () => {
    expect(isCurrent(on('2026-11-30'), NOW)).toBe(true);
  });

  it('ignores the time of day, because a posted date has none', () => {
    const lateInTheDay = new Date('2026-10-01T23:59:59Z');
    const earlyInTheDay = new Date('2026-10-01T00:00:01Z');
    expect(isCurrent(on('2026-08-20'), lateInTheDay)).toBe(true);
    expect(isCurrent(on('2026-08-20'), earlyInTheDay)).toBe(true);
  });
});

describe('the current announcements', () => {
  const list = [on('2026-09-28'), on('2026-08-20'), on('2026-06-01')];

  it('keeps the ones inside the window and drops the ones outside it', () => {
    expect(currentAnnouncements(list, NOW).map((item) => item.postedOn)).toEqual([
      '2026-09-28',
      '2026-08-20',
    ]);
  });

  /*
   * AC 2's second half, and the reason there is one rule here rather than two.
   *
   * "Renders the current announcements" and "disappears entirely once the
   * newest is stale" are the same rule seen twice: when the newest item is
   * stale every item is, so the current list is empty and the section renders
   * nothing. A separate "is the newest stale?" predicate would be a second
   * place for the six weeks to be written down, and the two would disagree the
   * first time one of them was tuned.
   */
  it('is empty exactly when the newest item has gone stale', () => {
    const allOld = [on('2026-06-01'), on('2026-05-01')];
    expect(currentAnnouncements(allOld, NOW)).toEqual([]);
    expect(currentAnnouncements([], NOW)).toEqual([]);
  });

  it('preserves the order it was given, which is the store’s', () => {
    const jumbled = [on('2026-09-01'), on('2026-09-30'), on('2026-09-15')];
    expect(currentAnnouncements(jumbled, NOW).map((item) => item.postedOn)).toEqual([
      '2026-09-01',
      '2026-09-30',
      '2026-09-15',
    ]);
  });
});

describe('the address of an announcement', () => {
  it('is the date and the headline, so a file URL says what it is', () => {
    expect(announcementSlug('2026-07-01', 'School Board Update')).toBe(
      '2026-07-01-school-board-update',
    );
  });

  it('survives punctuation, ampersands and shouting', () => {
    expect(announcementSlug('2026-08-01', 'FUNDRAISING THROUGH WEIS MARKETS!!')).toBe(
      '2026-08-01-fundraising-through-weis-markets',
    );
    expect(announcementSlug('2026-09-01', 'R&K Subs — a sandwich sale')).toBe(
      '2026-09-01-r-k-subs-a-sandwich-sale',
    );
  });

  // A slug is a URL, and a headline is a sentence somebody may well paste a
  // paragraph into. Capped rather than refused: the date keeps it unique
  // enough, and refusing a long headline would be refusing the announcement.
  it('caps a headline that is really a paragraph', () => {
    const slug = announcementSlug('2026-09-01', 'A '.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(11 + 60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('refuses a headline with nothing addressable in it', () => {
    expect(() => announcementSlug('2026-09-01', '!!!')).toThrow(/letters or numbers/);
  });
});

describe('the announcements the school already published', () => {
  /*
   * AC 3, stated as a fact about the data rather than as an absence.
   *
   * The live site's "Latest School Board Update – 7/1/2026" is a fixed slot
   * holding a dated PDF, which reads as stale by October. Here the July board
   * update is a row shaped exactly like the four fundraisers beside it — same
   * columns, same staleness rule, same page — so there is no slot to go stale
   * and nothing to retire next time.
   */
  it('holds the board update as an ordinary announcement, not in a slot of its own', () => {
    const update = SEEDED_ANNOUNCEMENTS.find((item) => item.headline.includes('Board Update'));
    expect(update).toBeDefined();

    // The same columns as the fundraiser beside it, and — the part that
    // matters — the same staleness rule with no exemption. A board update that
    // has aged out leaves the homepage exactly as a fundraiser does, which is
    // the behaviour the fixed slot on the live site cannot have.
    const aged = { ...update!, postedOn: '2026-01-01' };
    expect(isCurrent(update!, new Date(`${update!.postedOn}T09:00:00Z`))).toBe(true);
    expect(isCurrent(aged, NOW)).toBe(false);
    expect(currentAnnouncements([aged], NOW)).toEqual([]);
  });

  it('carries the Weis fundraiser and the four the board update describes', () => {
    const headlines = SEEDED_ANNOUNCEMENTS.map((item) => item.headline).join(' | ');
    for (const fundraiser of ['Weis', 'Senators', 'Texas Roadhouse', 'Envelope', 'R&K Subs']) {
      expect(headlines, fundraiser).toContain(fundraiser);
    }
  });

  it('gives every one of them a unique slug that matches its own date and headline', () => {
    const slugs = SEEDED_ANNOUNCEMENTS.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const item of SEEDED_ANNOUNCEMENTS) {
      expect(item.slug).toBe(announcementSlug(item.postedOn, item.headline));
    }
  });

  it('names a link whenever it has one — “click here” is not a link name', () => {
    for (const item of SEEDED_ANNOUNCEMENTS) {
      expect(Boolean(item.linkUrl), item.slug).toBe(Boolean(item.linkLabel));
      if (item.linkLabel) expect(item.linkLabel.length, item.slug).toBeGreaterThan(4);
    }
  });

  it('posts each one on a real date the school’s own material carries', () => {
    for (const item of SEEDED_ANNOUNCEMENTS) {
      expect(item.postedOn, item.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(item.postedOn)), item.slug).toBe(false);
    }
  });
});
