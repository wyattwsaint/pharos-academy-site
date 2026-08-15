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
/**
 * What `?removed=` on the Events list means (#200 AC 2).
 *
 * Removing a one-off redirects to the list, which is the screen that shows the
 * removal happened — but "it is gone from a list" is not the same as "the live
 * calendar no longer offers it", so the republish answer rides along in the
 * same query string and is said in the same words every other screen says it
 * in. A refresh cannot re-fire either half: the delete already happened and the
 * URL only reports it.
 */
export function removalOutcome(removed: string | null, published: string | null): Banner | null {
  if (removed === null) return null;
  const republish = republishOutcome(published);
  return {
    ok: republish?.ok ?? true,
    message: `${removed} is off the calendar.${republish ? ` ${republish.message}` : ''}`,
  };
}

/**
 * What `?deleted=` on the Policies list means (#260).
 *
 * The same shape the Events list uses, and a different sentence, because the
 * two removals are not the same event. Taking a one-off off the calendar takes
 * away the whole of it; deleting a policy takes away the row and keeps every
 * document, so the line that reports it says both halves — the school has just
 * pressed something that reads as though it destroyed what families signed, and
 * this is the screen that tells it otherwise.
 *
 * The republish answer rides along in the same query string, said in the same
 * words every other screen says it in. A refresh re-fires neither half: the
 * delete already happened and the URL only reports it.
 */
export function policyDeletionOutcome(deleted: string | null, published: string | null): Banner | null {
  if (deleted === null) return null;
  const republish = republishOutcome(published);
  return {
    ok: republish?.ok ?? true,
    message: `${deleted} is deleted. Every document already uploaded to it is still readable at the address it was given.${
      republish ? ` ${republish.message}` : ''
    }`,
  };
}

export function republishOutcome(published: string | null): Banner | null {
  if (published === 'live') {
    return { ok: true, message: 'Republished — the live site is up to date.' };
  }
  if (published === 'stale') {
    return { ok: false, message: "Republishing didn't reach the live site — Retry." };
  }
  return null;
}
