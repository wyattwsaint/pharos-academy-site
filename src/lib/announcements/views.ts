/**
 * How an announcement is addressed and how its date is printed (#27).
 *
 * Small, and separate from `announcement.ts` on purpose: three surfaces link to
 * the same PDF, and a path built in three templates is a path that is wrong in
 * one of them the day the route moves.
 */

/** Where an announcement's attached PDF is served. */
export function attachmentPath(slug: string): string {
  return `/news/${slug}.pdf`;
}

/** Where an announcement is anchored on the news page. */
export function newsPath(slug: string): string {
  return `/news#${slug}`;
}

/**
 * The posted date, as the school would write it: "1 July 2026".
 *
 * Parsed as UTC rather than as local time, because `new Date('2026-07-01')` is
 * midnight UTC and printing it in a timezone behind it gives 30 June — a
 * one-day-wrong date on every announcement, west of Greenwich, forever.
 */
export function postedOnLabel(postedOn: string): string {
  return new Date(`${postedOn}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
