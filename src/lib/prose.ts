/**
 * Words joined the way the school writes them, rather than the way a list
 * prints itself.
 *
 * One function, because there is one house rule and two callers who had better
 * not disagree about it: the timetable's "Mondays and Wednesdays" (#233) and
 * the sentence naming the classes a departing person leaves unstaffed (#262).
 * A slash-joined "Mon/Wed" or a bare `join(', ')` reads as data on a screen the
 * school reads as prose, and the second caller made the rule worth having in
 * one place rather than copied.
 *
 * There is deliberately **no Oxford comma**: the site's copy does not use one
 * (`docs/house-style.md`), and three classes read "Latin I, Art and Kingdom
 * Math".
 *
 * `Intl.ListFormat` would do this and is not used, for the reason nothing else
 * here is localised: the school writes in one English, the punctuation is
 * counted rather than chosen (ADR-0011), and a formatter whose output moves
 * with a runtime's locale data is a sentence no test can pin.
 */

/**
 * "Latin I", "Latin I and Art", "Latin I, Art and Kingdom Math".
 *
 * Empty in, empty out — a caller with nothing to name has a different sentence
 * to write, not a shorter one, so this refuses to invent "nothing" for them.
 */
export function listSentence(items: readonly string[]): string {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
