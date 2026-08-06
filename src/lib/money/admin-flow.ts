/**
 * What one submitted money form means (#29 AC 2).
 *
 * "Saving a money change requires an explicit confirmation naming its effect on
 * every family" is a decision about a form, not a piece of page markup, so it
 * lives here and the page only renders whichever outcome comes back. Four
 * outcomes, and the page has a screen for each.
 *
 * The confirmation is a **second POST, not a dialog**: this admin has no
 * JavaScript at all, and a `confirm()` call is both untestable and unavailable
 * to somebody driving the form from a keyboard with scripting off. The first
 * post re-renders the page as a confirmation screen; the second, carrying the
 * same values back in hidden inputs plus `confirm`, writes.
 *
 * Validation runs before the confirmation and again on the way through it. A
 * forged `confirm` on a form holding a $0 rate is still a $0 rate, and the
 * store validates a third time — the money row is the one place in this admin
 * where being told the same "no" three times is the correct amount.
 */

import {
  moneyChanges,
  parseMoneySettings,
  type MoneyChange,
  type MoneyErrors,
  type MoneySettings,
} from './settings.js';

/** The form field whose presence means "yes, I have read what changes". */
export const CONFIRM_FIELD = 'confirm';

export type MoneyFormOutcome =
  /** Something is wrong with the values. Redisplay the form with the errors. */
  | { kind: 'invalid'; values: MoneySettings; errors: MoneyErrors }
  /** Valid, but identical to what is stored. Say so; do not stamp the row. */
  | { kind: 'unchanged'; values: MoneySettings }
  /** Valid and different. Show the confirmation naming every change. */
  | { kind: 'confirm'; values: MoneySettings; changes: MoneyChange[] }
  /** Confirmed, valid and still different. Write it. */
  | { kind: 'save'; values: MoneySettings; changes: MoneyChange[] };

export function moneyFormOutcome(form: FormData, current: MoneySettings): MoneyFormOutcome {
  const { values, errors } = parseMoneySettings(form);
  if (Object.keys(errors).length > 0) return { kind: 'invalid', values, errors };

  // Diffed against what is stored *now*, on both posts. If the other admin
  // saved the same change while this confirmation was on screen, the second
  // post has nothing left to do and says so rather than re-stamping the row.
  const changes = moneyChanges(current, values);
  if (changes.length === 0) return { kind: 'unchanged', values };

  return { kind: form.get(CONFIRM_FIELD) === null ? 'confirm' : 'save', values, changes };
}
