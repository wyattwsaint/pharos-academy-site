/**
 * The small things every form on this site does the same way.
 *
 * Two forms now read an email address from a submission — the school details
 * screen and the volunteer form (#30) — and a second copy of the rule for what
 * counts as one is how the admin comes to accept an address the public form
 * rejects, or the reverse.
 */

/**
 * A trimmed string field, or empty.
 *
 * Empty rather than undefined, so a missing field and a blank one are the same
 * thing: from a parser's point of view they are, and collapsing them here means
 * every caller writes one check instead of two.
 */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Whether this looks like an email address.
 *
 * Deliberately loose. The only address that matters is one somebody can be
 * reached at, and that is not knowable from a string — so this catches the
 * typo that is obviously a typo ("ruth at example", a missing dot) and lets
 * everything else through to the send, where a real failure is reported rather
 * than guessed at. A stricter pattern rejects real addresses, and the cost of
 * that is a volunteer who cannot sign up.
 */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}
