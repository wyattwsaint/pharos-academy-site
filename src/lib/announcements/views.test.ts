import { describe, expect, it } from 'vitest';

import { attachmentPath, newsPath, NEWS_PATH, postedOnLabel } from './views.js';

/**
 * How an announcement's date is printed (#112).
 *
 * The date was the one thing on the news page that a spelling scan cannot see:
 * "1 July 2026" holds no British *word*, only a British order, so nothing but a
 * test asserting the order keeps it American.
 */
describe('the posted date a family reads', () => {
  it('prints month, day, year — not the day first', () => {
    expect(postedOnLabel('2026-07-01')).toBe('July 1, 2026');
    expect(postedOnLabel('2026-08-24')).toBe('August 24, 2026');
  });

  it('prints the day the school typed, not the day it is west of Greenwich', () => {
    // `new Date('2026-07-01')` is midnight UTC. Read in a timezone behind it —
    // which is every timezone this school's families live in — the naive
    // rendering is June 30, on every announcement, forever.
    expect(postedOnLabel('2026-07-01')).toContain('July');
  });
});

describe('where an announcement lives', () => {
  it('anchors on the news page and serves its PDF beside it', () => {
    expect(newsPath('2026-07-01-a-fundraiser')).toBe(`${NEWS_PATH}#2026-07-01-a-fundraiser`);
    expect(attachmentPath('2026-07-01-a-fundraiser')).toBe(
      `${NEWS_PATH}/2026-07-01-a-fundraiser.pdf`,
    );
  });
});
