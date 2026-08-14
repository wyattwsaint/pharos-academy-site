import { describe, expect, it } from 'vitest';

import { removalOutcome, republishOutcome } from './republish-outcome.js';

describe('what ?republished= means', () => {
  it('reports a republish that reached the live site', () => {
    expect(republishOutcome('live')).toEqual({
      ok: true,
      message: 'Republished — the live site is up to date.',
    });
  });

  it('reports one that did not, and points at Retry', () => {
    expect(republishOutcome('stale')).toEqual({
      ok: false,
      message: "Republishing didn't reach the live site — Retry.",
    });
  });

  it('says nothing at all when the screen was merely opened', () => {
    expect(republishOutcome(null)).toBeNull();
  });

  it('says nothing about a value it does not recognise', () => {
    expect(republishOutcome('')).toBeNull();
    expect(republishOutcome('LIVE')).toBeNull();
    expect(republishOutcome('probably')).toBeNull();
  });
});

describe('what ?removed= means (#200)', () => {
  it('names the one-off and says the live calendar caught up', () => {
    expect(removalOutcome('Fall open house', 'live')).toEqual({
      ok: true,
      message: 'Fall open house is off the calendar. Republished — the live site is up to date.',
    });
  });

  it('does not claim the live site caught up when it did not', () => {
    expect(removalOutcome('Fall open house', 'stale')).toEqual({
      ok: false,
      message:
        "Fall open house is off the calendar. Republishing didn't reach the live site — Retry.",
    });
  });

  it('still reports the removal when the URL says nothing about republishing', () => {
    expect(removalOutcome('Fall open house', null)).toEqual({
      ok: true,
      message: 'Fall open house is off the calendar.',
    });
  });

  it('says nothing at all when the list was merely opened', () => {
    expect(removalOutcome(null, null)).toBeNull();
    expect(removalOutcome(null, 'live')).toBeNull();
  });
});
