import type { SchoolDetails } from '../db/schema.js';

/**
 * The announcement banner — the short, timely line the office puts at the top
 * of the home page (#15).
 *
 * It is **not** an [announcement](../../../CONTEXT.md): an announcement is a
 * dated notice that ages out onto the news page, and there are many of them.
 * This is one string, one date and one link, on the school details row beside
 * the address — a singleton the office already knows where to edit, and one
 * whose save path already revalidates the published pages.
 *
 * #109 took the announcements band off the home page and this is what replaced
 * it in that region, which is why the two are worth telling apart in a name.
 *
 * A bar rather than a modal, decided on the ticket: a modal on first paint
 * costs conversion and traps a keyboard user, and neither is worth a sentence
 * about registration.
 */
export type AnnouncementBanner = {
  /** What the office typed, as typed. */
  message: string;
  /** The date, rendered — "August 31". Never the raw `YYYY-MM-DD`. */
  date: string;
  /** Where the whole message points, or null when the office set no link. */
  href: string | null;
  /**
   * What a dismissal is remembered against.
   *
   * The visitor dismisses *this* message, not the bar as a fixture: change the
   * words, the date or the link and the key changes, so the next thing the
   * office puts up is seen by everyone who closed the last one. A key that was
   * only "dismissed" would make the second message invisible to exactly the
   * people who read the first.
   */
  key: string;
};

/**
 * The banner to draw, or null for "draw nothing at all".
 *
 * Null rather than a disabled banner because the region has to collapse
 * completely when the office switches it off — an empty bar beneath the header
 * is the empty space the ticket forbids, and a caller holding a falsy object
 * has to remember to check it.
 *
 * A message is required as well as the switch. The switch is what the office
 * turns after the start of term; a blank message with the switch still on is a
 * half-finished edit, and a bar with nothing in it is worse than no bar.
 */
export function announcementBanner(details: SchoolDetails): AnnouncementBanner | null {
  if (!details.bannerEnabled) return null;

  const message = details.bannerMessage.trim();
  const date = details.bannerDate;
  if (!message || !date) return null;

  return {
    message,
    date: formatBannerDate(date),
    href: details.bannerLink.trim() || null,
    key: `${message}|${date}|${details.bannerLink.trim()}`,
  };
}

/**
 * "2026-08-31" → "August 31".
 *
 * American, and with no ordinal suffix, both settled on the ticket: the school
 * writes its own dates this way and "August 31st" is a second style for the
 * same fact. No year, because the banner is by definition about something
 * weeks away — "Classes begin August 31, 2026" reads like an archive.
 *
 * Formatted in UTC because the stored value is a calendar date and not an
 * instant: parsed as local time in a region behind Greenwich, `2026-08-31`
 * becomes 30 August.
 */
export function formatBannerDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Where a dismissal is remembered. Read by the inline script in the header. */
export const BANNER_DISMISSED_KEY = 'pharos:banner-dismissed';
