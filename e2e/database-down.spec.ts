import { expect, test } from '@playwright/test';

import { PUBLIC_ROUTES } from '../src/lib/routes.js';

/**
 * What the whole delivery model rests on (#34).
 *
 * Vercel serves the stale ISR copy when a regeneration **fails**. That word is
 * doing all the work: stale-on-error is not a promise the platform keeps for a
 * page that renders. A page that catches its own database error and returns an
 * apologetic-but-empty 200 has *succeeded* as far as the CDN is concerned, and
 * the CDN then caches the emptiness over the good copy — for the full
 * expiration, on every route, with Neon back up and nothing left to serve.
 *
 * So the property this repo actually owns is the precondition, and it is the
 * one tested here: **with the database unreachable, no public page answers
 * 200.** The half that belongs to Vercel — that a failed regeneration is served
 * stale rather than as an error — is a platform behaviour and is verified by
 * hand against a genuinely stopped Neon compute; `docs/handoff.md` records that
 * run and its date.
 *
 * The database is stopped for real. `DATABASE_URL` points at the discard port,
 * so the Neon HTTP driver's connection is refused rather than mocked, and no
 * fault-injection hook exists in the app for this test to reach for. Same
 * arrangement as `playwright.revalidation.config.ts`, for the same reason.
 */

test.describe('with the database unreachable', () => {
  for (const { path } of PUBLIC_ROUTES) {
    test(`\`${path}\` fails rather than rendering an empty page`, async ({ request }) => {
      const response = await request.get(path, { failOnStatusCode: false });

      expect(
        response.status(),
        `${path} answered ${response.status()} with the database down. A 2xx here is cached over the good copy — the page must throw so the regeneration fails and Vercel keeps serving stale.`,
      ).toBeGreaterThanOrEqual(500);
    });
  }
});
