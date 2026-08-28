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

/**
 * The one phone number shape the site accepts — `###-###-####` (#310, #311).
 *
 * The opposite stance to `isEmailAddress`, and deliberately so. An address can
 * only be proved by sending to it, so the check there is loose; a phone number
 * is typed by a parent who will be *called back on it*, and every family this
 * school serves has a ten-digit North American number. Strict is what turns a
 * transposed digit into an inline error rather than into a wrong number Jill
 * dials next week.
 *
 * Extensions and international numbers are rejected. That is a real cost, and
 * ADR-0024 accepts it: a family with either writes it in the message, and the
 * alternative is a field no rule can hold and no auto-format can help with.
 *
 * This lives here rather than beside the inquiry because the application asks
 * for the same number under a different name, and two copies of the pattern is
 * how one form comes to accept what the other refuses.
 */
export const PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/;

/** What both forms say when the field is empty. One sentence, one place. */
export const PHONE_REQUIRED_MESSAGE = 'We need a phone number so we can call you back.';

/** What both forms say when it is filled in but not a number of that shape. */
export const PHONE_FORMAT_MESSAGE = 'A phone number looks like 717-555-0142 — ten digits.';

export function isPhoneNumber(value: string): boolean {
  return PHONE_PATTERN.test(value);
}

/**
 * The dashes, inserted as the parent types.
 *
 * Digits are the only thing kept, so a number pasted as `(717) 555-0142` or
 * `717.555.0142` becomes the accepted shape rather than an error — the paste is
 * the common case on a phone, and refusing it would be refusing a correct
 * number over its punctuation.
 *
 * **More than ten digits is left exactly as typed.** Truncating instead would
 * be the worst outcome this function can produce: `1-717-555-0142` would become
 * `171-755-5014`, which passes `isPhoneNumber`, gets stored, and is dialled — a
 * wrong number nobody was ever shown an error about, and it would make the
 * rejection of country codes and extensions (ADR-0024) unreachable in a
 * browser. Handing the string back untouched puts the parent in front of
 * `PHONE_FORMAT_MESSAGE`, which is the whole point of a strict shape.
 *
 * Called on every keystroke in the browser, so it is a pure function of the
 * string: the caller owns the caret, this owns the value.
 */
export function formatPhoneAsTyped(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10) return value;
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return parts.filter((part) => part.length > 0).join('-');
}

/**
 * Read a phone field and say what is wrong with it, or nothing.
 *
 * The server's half of the rule, and it runs whatever the browser did: the
 * auto-format is an enhancement, and a submission with scripting off — or from
 * anything that is not a browser — meets the same pattern here.
 */
export function phoneError(value: string): string | undefined {
  if (!value) return PHONE_REQUIRED_MESSAGE;
  if (!isPhoneNumber(value)) return PHONE_FORMAT_MESSAGE;
  return undefined;
}
