/**
 * Where a policy's file lives, and how its date is printed (#28).
 *
 * Separate from `policy.ts` for the reason `announcements/views.ts` is: the
 * public page, the admin list and the admin's own edit screen all link the same
 * file, and a path built in three templates is a path that is wrong in one of
 * them the day the route moves. Here it can only move once.
 */

/**
 * The fixed address of a policy — the current version, always, forever.
 *
 * This is the URL that goes in a printed handbook and on the far end of a 301
 * from the Wix site. Replacing the file changes what these bytes are and never
 * changes this string, which is the whole ticket.
 */
export function policyPath(slug: string): string {
  return `/policies/${slug}.pdf`;
}

/**
 * The address of one retained version.
 *
 * A second, *versioned* address rather than a query on the first, because these
 * two URLs want opposite caching and a cache cannot be told "immutable, except
 * when the query is absent". A version never changes, so this one is served
 * immutable for a year; the fixed path above changes whenever Jill uploads, so
 * it revalidates. See ADR-0005.
 */
export function policyVersionPath(slug: string, version: number): string {
  return `/policies/${slug}/v${version}.pdf`;
}

/** The version number in a `v3`-shaped segment, or undefined if it is not one. */
export function parseVersionSegment(segment: string): number | undefined {
  const match = /^v(\d+)$/.exec(segment);
  if (!match) return undefined;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

/**
 * The updated date, as the school would write it: "23 July 2026".
 *
 * Printed in UTC for the same reason an announcement's posted date is — a
 * timestamp rendered in a timezone behind Greenwich prints the previous day,
 * and "Updated 22 July" on a file uploaded on the 23rd is exactly the kind of
 * small wrongness this ticket removes.
 */
export function updatedOnLabel(updatedAt: Date): string {
  return updatedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The machine-readable half of the same date, for a `<time datetime>`. */
export function updatedOnAttribute(updatedAt: Date): string {
  return updatedAt.toISOString().slice(0, 10);
}

/** A file size a person reads. Kilobytes, because every policy is one. */
export function fileSizeLabel(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
