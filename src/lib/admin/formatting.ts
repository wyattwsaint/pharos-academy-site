/**
 * How the admin writes a date.
 *
 * These lived under `school-details.ts` and, twice, inline in a screen's
 * frontmatter — an accident of which screen needed them first (#193). Every
 * admin screen prints a "last edited" stamp, so importing one from the other
 * implied a dependency that was never real, and the two inline copies were free
 * to drift from each other and from this one.
 */

/** Enola, Pennsylvania. */
export const SCHOOL_TIME_ZONE = 'America/New_York';

/**
 * "Last edited by Jill Kilker on 5 August 2026", or that nothing has been.
 *
 * The one formatter here that reads UTC rather than the school's clock, which
 * is how it has always behaved and is left alone rather than quietly corrected:
 * a save made after 8pm in Enola is stamped with the following day, and moving
 * it would change a date the office may already have quoted. Worth fixing, but
 * as its own decision — not as a side effect of giving the formatters a home.
 */
export function formatStamp(editorName: string | null, editedAt: Date | null): string {
  if (!editorName || !editedAt) return 'Not edited yet';
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(editedAt);
  return `Last edited by ${editorName} on ${day}`;
}

/**
 * "5 August 2026 at 09:14" — the day and the time, in the school's own zone.
 *
 * The zone is the school's rather than the server's for the reason
 * `copyrightYear` gives: an inquiry that arrived at 20:00 on Tuesday in Enola
 * did not arrive on Wednesday, whichever Vercel region rendered the row.
 */
export function formatTimestamp(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SCHOOL_TIME_ZONE,
  }).format(at);
}

/** "5 August 2026" — the same day, without the time. */
export function formatDay(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: SCHOOL_TIME_ZONE,
  }).format(at);
}
