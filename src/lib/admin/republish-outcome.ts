import type { Banner } from './banner.js';

/**
 * What `?republished=` in the URL means.
 *
 * `/admin/republish` carries its answer back in the query string rather than
 * rendering it, so that a refresh cannot silently re-fire the republish. Two
 * screens read that parameter and each spelled out the same two sentences
 * (#193); every screen with a Republish button will read it once the button
 * returns to the screen it was pressed on, and the wording has to be identical
 * on all of them.
 *
 * An unrecognised value — a hand-typed URL, a stale bookmark — is no banner
 * rather than a complaint about the URL, which is not a thing the office did.
 */
export function republishOutcome(published: string | null): Banner | null {
  if (published === 'live') {
    return { ok: true, message: 'Republished — the live site is up to date.' };
  }
  if (published === 'stale') {
    return { ok: false, message: "Republishing didn't reach the live site — Retry." };
  }
  return null;
}
