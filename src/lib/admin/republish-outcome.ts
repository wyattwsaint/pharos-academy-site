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
 * Where a removal took something out of — the closed list of them (#200, #258).
 *
 * **Not carried in the URL.** The list a delete lands on knows which list it is,
 * so it names its own place from this list rather than being told; what travels
 * is the name of what went, which is data the store held a moment ago, and the
 * republish code. So the URL contributes one noun to the banner and no claim at
 * all: every word around it is chosen here.
 */
const REMOVED_FROM = {
  calendar: 'the calendar',
  news: 'the news page',
} as const;

/** A place on the list above, named by its key — the phrase itself is not sayable. */
export type RemovedFrom = keyof typeof REMOVED_FROM;

/**
 * What `?removed=` on a list that a delete redirected to means (#200 AC 2).
 *
 * Removing a one-off redirects to the list, which is the screen that shows the
 * removal happened — but "it is gone from a list" is not the same as "the live
 * calendar no longer offers it", so the republish answer rides along in the
 * same query string and is said in the same words every other screen says it
 * in. A refresh cannot re-fire either half: the delete already happened and the
 * URL only reports it.
 *
 * Deleting an announcement lands the same way (#258), which is why `from` is a
 * parameter rather than a second copy of this function: the two screens report
 * one kind of thing, and a screen that phrased it differently would be reporting
 * a different kind of thing.
 */
export function removalOutcome(
  removed: string | null,
  published: string | null,
  from: RemovedFrom,
): Banner | null {
  if (removed === null) return null;
  const republish = republishOutcome(published);
  return {
    ok: republish?.ok ?? true,
    message: `${removed} is off ${REMOVED_FROM[from]}.${republish ? ` ${republish.message}` : ''}`,
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
export function policyDeletionOutcome(
  deleted: string | null,
  published: string | null,
): Banner | null {
  return deletionOutcome(
    deleted,
    'Every document already uploaded to it is still readable at the address it was given.',
    published,
  );
}

/**
 * What `?deleted=` on the People list means (#262).
 *
 * The third of these, and a third sentence, because what the school has just
 * done is a third thing. Removing a one-off takes the whole of it away; deleting
 * a policy takes a row and keeps every document; deleting a person takes the
 * row and leaves the classes standing without an instructor. The confirmation
 * named those classes before the press, and this is the line that says the
 * press did what it said — so it repeats the shape of the consequence without
 * re-listing the titles, which by now are on the Classes screen saying so
 * themselves.
 *
 * The republish answer rides along in the same query string, said in the same
 * words every other screen says it in. A refresh re-fires neither half: the
 * delete already happened and the URL only reports it.
 */
export function personDeletionOutcome(
  deleted: string | null,
  published: string | null,
): Banner | null {
  return deletionOutcome(
    deleted,
    'Any class they taught is still running, and is now waiting for an instructor.',
    published,
  );
}

/**
 * "&lt;what went&gt; is deleted. &lt;what that did.&gt; &lt;how the republish went.&gt;"
 *
 * The assembly, once, for the two deletes that report a consequence — the same
 * move `removalOutcome` makes for the two that report a place (#258). What
 * varies between a policy and a person is the middle sentence and nothing else,
 * so the middle sentence is the parameter and the rest cannot drift: "deleted"
 * means the same word on both screens, the republish line is the one every
 * screen says, and the spacing is decided in one place rather than in two
 * template literals that have to agree.
 *
 * `consequence` is a literal from a caller in this module, never a value from
 * the URL. What the URL contributes is the one noun — the name of what went,
 * which the store held a moment ago and which cannot be looked up afterwards
 * because the row is gone (CONTEXT.md, "outcome code").
 */
function deletionOutcome(
  deleted: string | null,
  consequence: string,
  published: string | null,
): Banner | null {
  if (deleted === null) return null;
  const republish = republishOutcome(published);
  return {
    ok: republish?.ok ?? true,
    message: `${deleted} is deleted. ${consequence}${republish ? ` ${republish.message}` : ''}`,
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
