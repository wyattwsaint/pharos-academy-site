import { CALENDAR_PATH } from '../current-families/section.js';

/**
 * Where the calendar lives, and what the school has to tell families about it
 * (#23).
 *
 * Small and separate for the reason `announcements/views.ts` is: three surfaces
 * link the feed — the calendar page, the Current Families index and the admin —
 * and an address written in three templates is an address that is wrong in one
 * of them the day it moves.
 */

/**
 * The calendar page. Under Current Families, next to news and policies.
 *
 * Declared in `current-families/section.ts` and re-exported here, so the
 * imports point one way; this is the name the rest of the site uses.
 */
export { CALENDAR_PATH };

/**
 * The subscribe link, at the root of the school's own domain.
 *
 * `/calendar.ics` and not `/current-families/calendar.ics`, deliberately: this
 * is the address a parent pastes into a phone and then never touches again, and
 * it belongs to the school rather than to a section of a website that may be
 * reorganised. The school owning the address is the whole reason there is no
 * calendar vendor here — the feed behind it can be rebuilt, moved or rewritten
 * forever without asking a single family to resubscribe.
 */
export const CALENDAR_FEED_PATH = '/calendar.ics';

/**
 * What a subscribed calendar cannot promise, said plainly (#23).
 *
 * On the page, not only in a handover document, because the people who need it
 * are the families doing the subscribing. Phones refresh a subscribed calendar
 * on their own schedule — hours, sometimes a day or two — and no vendor
 * controls that and neither do we. A closure decided this week still needs a
 * text message; the feed publishes the *shape* of the year.
 */
export const SUBSCRIPTION_CAVEAT =
  'Phones and calendar apps check a subscribed calendar on their own schedule — usually within ' +
  'a few hours, sometimes a day or two. Nobody can make them check sooner, so if something ' +
  'changes at short notice the school will still text you. What this calendar is for is the ' +
  'shape of the year.';

/** "Fall semester" / "Spring semester", as the school's own sheets head them. */
export function semesterHeading(semester: 'fall' | 'spring'): string {
  return semester === 'fall' ? 'Fall semester' : 'Spring semester';
}

/**
 * "31 August 2026" — a meeting date, as the sheet prints it.
 *
 * Parsed as UTC, like every other date on the site: `new Date('2026-08-31')` is
 * midnight UTC, and printing it in a timezone behind Greenwich gives 30 August
 * — a calendar one day wrong on all 112 rows, west of London, forever.
 */
export function meetingDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
