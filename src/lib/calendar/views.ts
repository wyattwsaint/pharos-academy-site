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

/**
 * "Fall Semester" / "Spring Semester", as the school's own sheets head them.
 *
 * One reader left: the admin School Year screen, which heads a fieldset and its
 * four-column preview with it. The public page that shared it lost its semester
 * sections in #237.
 */
export function semesterHeading(semester: 'fall' | 'spring'): string {
  return semester === 'fall' ? 'Fall Semester' : 'Spring Semester';
}
