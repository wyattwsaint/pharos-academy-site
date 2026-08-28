import { describe, expect, it } from 'vitest';

import { APPLICATION_PATH } from './application.js';
import { applicationLink, applicationLinkIsLive, APPLICATION_LINK_DAYS } from './link.js';

/**
 * The application link's rule, on its own (#317, ADR-0025).
 *
 * This is the file the *admin screen* is covered by. `store.test.ts` proves the
 * reader honours the window against real Postgres; the inquiries screen makes
 * the same decision about the same instant without a database in the way, and
 * the only way to test it through the page would be manufacturing a
 * four-month-old row — the thing the injected clock exists to avoid. So the
 * decision is proved here, at both boundaries, and the screen renders it.
 */

const RECEIVED = new Date('2026-05-01T09:00:00Z');
const after = (days: number, hours: number) =>
  new Date(RECEIVED.getTime() + (days * 24 + hours) * 60 * 60 * 1000);

describe('how long the link opens for', () => {
  it('is live in the last hour inside the window', () => {
    expect(applicationLinkIsLive(RECEIVED, after(APPLICATION_LINK_DAYS, -1))).toBe(true);
  });

  it('is dead in the first hour outside it', () => {
    expect(applicationLinkIsLive(RECEIVED, after(APPLICATION_LINK_DAYS, 1))).toBe(false);
  });

  it('is live for an inquiry that came in a moment ago', () => {
    // The default clock, which is what the screen and the reader both run on.
    expect(applicationLinkIsLive(new Date())).toBe(true);
  });

  it('is the school’s ninety days, in one place', () => {
    // The number is the school's and the design is the code's: a change to it
    // should be this line and the constant, and nothing else.
    expect(APPLICATION_LINK_DAYS).toBe(90);
  });
});

describe('the link itself', () => {
  it('carries the inquiry’s id when there is one', () => {
    expect(applicationLink('3f0d5c2a-1b4e-4a77-9c31-2d6e8f0a5b91')).toBe(
      `${APPLICATION_PATH}?inquiry=3f0d5c2a-1b4e-4a77-9c31-2d6e8f0a5b91`,
    );
  });

  it('is the bare form when there is not', () => {
    // A confirmation sent after a failed write has no id to carry, and an
    // empty query string would be a link that says something about our
    // database (#317 AC 2).
    expect(applicationLink()).toBe(APPLICATION_PATH);
    expect(applicationLink('')).toBe(APPLICATION_PATH);
  });
});
