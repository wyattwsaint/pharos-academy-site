/**
 * How the admin asks "are you sure?" (#200).
 *
 * One field name, one reading of it, so that every destructive action in the
 * admin confirms the same way: the first POST re-renders the screen as a
 * confirmation naming what is about to happen, and the second POST — carrying
 * the intent back in hidden inputs plus this field — carries it out.
 *
 * It is a **round trip, not a dialog**. `confirm()` is unavailable to anybody
 * with scripting off, untestable from the browser suite, and says nothing about
 * what is at stake beyond the words in the title bar. The Money screen wrote
 * that reasoning down first (#29); this module is where the mechanism it proved
 * lives now that user delete and event removal share it.
 */

/** The form field whose presence means "yes, I have read what this does". */
export const CONFIRM_FIELD = 'confirm';

/** Whether a submitted form is the second post — the one that may act. */
export function isConfirmed(form: FormData): boolean {
  return form.get(CONFIRM_FIELD) !== null;
}
