/**
 * An announcement — the whole of it (#27).
 *
 * A headline, a short body, an optional link and an optional PDF. That is the
 * shape of *every* notice the school puts out, and the point of the ticket is
 * that there are no other shapes: the live site's "Latest School Board Update –
 * 7/1/2026" is a fixed slot holding a dated PDF, which reads as stale by
 * October and cannot be anything else. Here a board update is a row like any
 * other, ages out like any other, and needs nothing retired next time.
 *
 * The freshness rule was the ticket's other half: the homepage rendered the
 * announcements that were still current and disappeared entirely when none
 * were. **#109 removed that section**, and the rule now has no consumer — the
 * news page has always carried all of them, current or not.
 *
 * `isCurrent` and `currentAnnouncements` stay because #109 removed one surface
 * and did not retire the feature: the school asked for a quieter home page, not
 * for the six weeks to be forgotten, and the next surface that wants "what is
 * current" — the announcement banner, most likely — should find the window
 * decided in one place rather than re-derive it. They are covered by
 * `announcement.test.ts` and rendered by nothing.
 */

/** What Jill posts, as the store holds it. */
export type Announcement = {
  /** The date and the headline — the key, and the address its PDF is served at. */
  slug: string;
  /** The one line a parent reads at a glance. */
  headline: string;
  /** The short body under it. Required: a headline alone is a rumour. */
  body: string;
  /**
   * The day the school published it, `YYYY-MM-DD`.
   *
   * A date rather than a timestamp because it is a date Jill types, and the
   * whole freshness rule is counted in days. It is also **not** the same as
   * when the row was last edited: correcting a typo in August must not make a
   * July notice look new, so the stamp and this are separate fields.
   */
  postedOn: string;
  /** Somewhere to go — a registration site, a form. Null when there is nowhere. */
  linkUrl: string | null;
  /** What that link is called. Present exactly when `linkUrl` is. */
  linkLabel: string | null;
  /**
   * The attached PDF's filename, or null.
   *
   * The bytes are deliberately not on this type. Every surface that lists
   * announcements would otherwise drag a megabyte of PDF through memory to
   * render a headline; the filename is what a list needs, and the bytes are
   * fetched by the one route that serves them.
   */
  attachmentFilename: string | null;
  /** The stamp (CONTEXT.md): overwritten by each save, never appended. */
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** An announcement as the seed writes it — everything but the stamp, which is a save. */
export type SeedAnnouncement = Omit<Announcement, 'lastEditedBy' | 'lastEditedAt'>;

/**
 * How long an announcement stays current — the spec's "~6 weeks", as a number.
 *
 * Six weeks is long enough to carry a fundraiser through a school holiday and
 * short enough that a "what's on" surface cannot advertise an event that has
 * been and gone. It lives here as one constant because it is the only place the
 * window is decided. No page reads it since #109; see the note at the top of
 * this file.
 */
export const STALE_AFTER_DAYS = 42;

/**
 * Whether an announcement is still worth a parent's attention.
 *
 * Counted in whole days from the posted date, so the time of day the page
 * happens to render never moves the boundary — an announcement does not go
 * stale at lunchtime. A future date is current rather than impossible: writing
 * next Monday's closure on Friday is the ordinary reason to type a date at all.
 */
export function isCurrent(announcement: { postedOn: string }, now: Date): boolean {
  return daysBetween(announcement.postedOn, now) <= STALE_AFTER_DAYS;
}

/**
 * The current announcements, in the order they were given.
 *
 * Empty is the expected state and the interesting one: a surface that shows
 * "what is current" has to be prepared to show nothing. No surface calls this
 * since #109 took the homepage band away; see the note at the top of this file.
 */
export function currentAnnouncements<T extends { postedOn: string }>(
  announcements: readonly T[],
  now: Date,
): T[] {
  return announcements.filter((announcement) => isCurrent(announcement, now));
}

/**
 * The address of an announcement: its date, then its headline.
 *
 * Dated first so the list sorts and reads chronologically wherever a slug is
 * shown, and so two Texas Roadhouse nights in one year are two addresses rather
 * than a collision. The headline is capped rather than refused — a long
 * headline is still an announcement, and the date carries the uniqueness.
 */
export function announcementSlug(postedOn: string, headline: string): string {
  const tail = slugify(headline).slice(0, 60).replace(/-+$/, '');
  if (!tail) {
    throw new Error('that headline has no letters or numbers in it.');
  }
  return `${postedOn}-${tail}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Whole days from a `YYYY-MM-DD` to a clock, negative for a date still ahead. */
function daysBetween(postedOn: string, now: Date): number {
  const posted = Date.parse(`${postedOn}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - posted) / 86_400_000);
}

/**
 * What the school is announcing today, carried from its own published material.
 *
 * Five of the six come from the 1 July 2026 board update, which describes four
 * active fundraisers that have no page at all on the live site; the sixth is
 * `/special-announcement`, the Weis Markets page, which becomes an announcement
 * like the rest of them. Nothing here is invented — the wording is compressed
 * from `docs/mirror/`, not written fresh.
 *
 * All six carry 1 July 2026, the date of the material they come from. The Weis
 * page publishes no date at all, so it is filed with the July material rather
 * than back-dated to a guess. They therefore go stale together in mid-August,
 * which since #109 changes nothing anybody can see: the news page lists them
 * whatever their date. Reposting one is a date field.
 *
 * The board update is the one with a file. `npm run db:seed` attaches the PDF
 * from `docs/mirror/`, because the bytes belong in Neon (#18) and not in a
 * migration that has to run inside a lambda.
 */
export const SEEDED_ANNOUNCEMENTS: readonly SeedAnnouncement[] = [
  {
    slug: '2026-07-01-school-board-update-july-2026',
    postedOn: '2026-07-01',
    headline: 'School Board Update, July 2026',
    body:
      'The Launch Task Force met on 1 July to review progress before the school year. Key policies were approved — a Child Protection Background Check Policy, a Disclosure Statement and abuse prevention training requirements — the teacher contract was updated to 28 weeks, and the application for federal tax-exempt status is moving forward. Classes begin Monday 31 August, 28 weeks in total.',
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
  },
  {
    slug: '2026-07-01-fundraising-for-pharos-through-weis-markets',
    postedOn: '2026-07-01',
    headline: 'Fundraising for Pharos through Weis Markets',
    body:
      'Link your Weis Rewards card to Pharos Academy and the school earns a share of $500,000. Register your card online — Pharos Academy, school ID 88082, 9 Sherwood Drive, Enola PA 17025 — then scan it each time you shop. You only register once; you are in the program for the school year.',
    linkUrl: 'https://www.weis4school.com',
    linkLabel: 'Register your Weis Rewards card',
    attachmentFilename: null,
  },
  {
    slug: '2026-07-01-senators-game-fundraiser-24-july',
    postedOn: '2026-07-01',
    headline: 'Senators game fundraiser, 24 July',
    body:
      'Pharos receives $4 for every ticket bought for the Senators game on 24 July. Ask Jill for tickets.',
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
  },
  {
    slug: '2026-07-01-texas-roadhouse-night-and-bake-sale-in-august',
    postedOn: '2026-07-01',
    headline: 'Texas Roadhouse night and bake sale in August',
    body:
      'The June Texas Roadhouse evening raised $210.69 for Pharos. Another is planned for August, this time paired with a bake sale.',
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
  },
  {
    slug: '2026-07-01-the-1-100-envelope-wall-is-still-up',
    postedOn: '2026-07-01',
    headline: 'The 1–100 Envelope wall is still up',
    body:
      'The 1–100 Envelope Fundraiser wall remains active. Take an envelope, give the amount on the front, and bring it back — participation is expected to grow once classes begin.',
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
  },
  {
    slug: '2026-07-01-r-k-subs-sandwich-sale-postponed-to-the-fall',
    postedOn: '2026-07-01',
    headline: 'R&K Subs sandwich sale postponed to the fall',
    body:
      'The R&K Subs sandwich sale has been moved to the fall so that students and families can take part once term has started.',
    linkUrl: null,
    linkLabel: null,
    attachmentFilename: null,
  },
] as const;
