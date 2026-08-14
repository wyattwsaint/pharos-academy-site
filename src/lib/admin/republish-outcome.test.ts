import { describe, expect, it } from 'vitest';

import { republishOutcome } from './republish-outcome.js';

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
