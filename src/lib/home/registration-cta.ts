import { APPLICATION_PATH } from '../application/application.js';
import type { SchoolDetails } from '../db/schema.js';

/**
 * The home page's second call to action (#141) — "Register now!", in the gold
 * of the mark, beside the inquiry.
 *
 * The page used to offer a family exactly one thing to click, and it was the
 * one for a family that is still deciding. A family that has already decided
 * had to find the Apply page through the nav.
 *
 * The date on the second line is the school year start off the school details
 * row — the *same* value the office already edits (`admin/school-details.ts`),
 * not a second copy typed into the copy file. That is the whole point of the
 * ticket: the office moves the first day of classes and the home page follows
 * without a deploy.
 *
 * It is not the announcement banner, which the office switches on for a few
 * weeks and writes itself. This is a fixture.
 */
export type RegistrationCta = {
  /** The first line, and the button's promise. */
  label: string;
  /**
   * The second line — "Classes begin August 31, 2026" — or null when the
   * school year start is missing or is not a date.
   *
   * Null rather than an empty string so the button cannot render a blank line
   * under its label: a caller handed null draws one line and nothing else,
   * where a caller handed `''` has to remember to check it (#141 AC 8).
   */
  detail: string | null;
  /** The existing application flow. Not a new page. */
  href: string;
};

/** What the gold button says, derived from the row the office edits. */
export function registrationCta(details: SchoolDetails): RegistrationCta {
  return {
    label: REGISTRATION_LABEL,
    detail: firstDayLine(details.schoolYearStart),
    href: APPLICATION_PATH,
  };
}

/**
 * The words on the button, with the exclamation mark the school uses itself —
 * it is how the live site's own registration line reads.
 */
export const REGISTRATION_LABEL = 'Register now!';

/**
 * "2026-08-31" → "Classes begin August 31, 2026", or null.
 *
 * With the year, where `formatBannerDate` next door deliberately drops it — and
 * that difference is the reason this is a second formatter rather than a call
 * to that one. The banner is a temporary bar about something weeks away; this
 * button stands on the home page all year, and "August 31" alone on it in
 * September reads as a date already past rather than as next year's start.
 *
 * The `T00:00:00Z` and the UTC formatting are the same guard `formatBannerDate`
 * carries, and for the same reason: a stored calendar date is a day, not an
 * instant.
 */
export function firstDayLine(schoolYearStart: string): string | null {
  if (!schoolYearStart) return null;
  const day = new Date(`${schoolYearStart}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day);
  return `Classes begin ${date}`;
}
