/**
 * What the admin says when a write is refused.
 *
 * Five screens each wrote this out (#193): the same regex over the driver's
 * message, the same "Nothing was saved — " prefix, and one sentence that
 * differed because the entity differs. Parameterising the sentence is what
 * makes the admin sound like one person — the umbrella spec's wording rule
 * (#192) is that the same mistake is explained the same way everywhere, and
 * five copies is five places for that to stop being true.
 *
 * The `duplicate` sentence stays each screen's own words, because "there is
 * already an announcement with that headline on that date" is genuinely more
 * useful than a generic line about uniqueness.
 */
export type SaveErrorWording = {
  /**
   * Said when the database refused the write as a duplicate. Should name the
   * thing and point at the existing one, e.g. "there is already a class with
   * that title. Edit that one instead."
   */
  duplicate: string;
  /**
   * How the screen says nothing happened. "saved" for an editor; "created" for
   * a screen where the failed write was an insert and the word matters.
   */
  verb?: 'saved' | 'created';
};

/**
 * A failed write, said in words Jill can act on.
 *
 * Anything that is not a duplicate is reported verbatim rather than smoothed
 * over: an unrecognised failure is one the office has to be able to quote back
 * to whoever is fixing it, and "something went wrong" cannot be quoted.
 */
export function saveErrorMessage(error: unknown, wording: SaveErrorWording): string {
  const detail = error instanceof Error ? error.message : String(error);
  const nothing = `Nothing was ${wording.verb ?? 'saved'} — `;
  if (isDuplicate(detail)) return `${nothing}${wording.duplicate}`;
  return `${nothing}${detail}`;
}

/**
 * Whether the driver is complaining about a unique constraint.
 *
 * Matched on the message because that is all the Postgres driver hands back
 * through Drizzle here; the two spellings are Postgres's own ("duplicate key
 * value violates unique constraint") and the wording other drivers use.
 */
function isDuplicate(detail: string): boolean {
  return /duplicate key|unique/i.test(detail);
}
