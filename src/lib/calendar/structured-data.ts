import { absoluteUrl } from '../routes.js';
import { schoolRef } from '../structured-data.js';
import { TIMED_EVENT_MINUTES, type CalendarEvent } from './event.js';
import { schoolTimeToUtc } from './ics.js';
import { CALENDAR_PATH } from './views.js';

/**
 * An event on the school's calendar, describing itself (#151).
 *
 * The same rows the calendar page prints and the same rows `calendar.ics`
 * carries, in a third vocabulary — and derived from the same two functions the
 * feed uses to place an event in time, so the three cannot disagree about when a
 * fundraiser is. An open house announced on the page but absent from search
 * results, or worse present at the wrong hour, is the whole failure this avoids.
 *
 * Only the events the page shows are described: the page filters to what is
 * still ahead (`upcomingEvents`) and hands those in. A crawler being told about
 * last spring's concert as though it were on would be a wrong claim, and the
 * feed is the place a past event legitimately survives.
 */

export type EventJsonLdInput = {
  event: CalendarEvent;
  site: string | URL;
};

/**
 * The `Event` node for one of the school's one-offs.
 *
 * **The date is the same instant the subscribed calendar shows.** A timed event
 * is resolved through the school's own timezone by the function the feed uses —
 * 6.30 in October is 22:30 UTC and the same 6.30 in January is 23:30 — so a
 * crawler is never handed a floating time it will interpret in its own zone. An
 * untimed event stays a plain date, which is what schema.org means by an all-day
 * event and what the school actually published.
 *
 * `location` is emitted **only when the school has published a place**, and its
 * absence is a real state rather than an unfinished one (#146). The seeded
 * dine-to-donate has no branch address because the school has not said which
 * branch; defaulting it to the school's own address would put a family outside a
 * church hall on an evening when the event is at a restaurant. Google will treat
 * a location-less event as ineligible for its richer result, which is the correct
 * outcome: the fix is Jill typing the place, and the admin screen is where that
 * happens.
 */
export function eventJsonLd({ event, site }: EventJsonLdInput) {
  const page = absoluteUrl(site, CALENDAR_PATH);

  return {
    '@type': 'Event',
    '@id': `${page}#${event.slug}`,
    name: event.title,
    ...when(event),
    // Everything on this calendar happens in person. The school runs no online
    // events, and claiming a mode it does not offer is a wrong fact.
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    ...(event.place ? { location: { '@type': 'Place', name: event.place } } : {}),
    ...(event.note ? { description: event.note } : {}),
    // The school, by reference, on both counts — it organises its own events and
    // it is the entity a family is being invited by.
    organizer: schoolRef(site),
    // The page that says so, which is the one place the event is published.
    url: `${page}#events`,
  };
}

/**
 * `startDate`, and an `endDate` only where the school implies one.
 *
 * A timed event runs an hour, which is the same `TIMED_EVENT_MINUTES` the
 * subscribed calendar draws: the school types a start and nothing else, and a
 * zero-length event is a hairline on a phone and a bug to a crawler. An untimed
 * event gets the plain date and **no** end — schema.org reads a bare date as the
 * whole day, so an end date would be a second claim about a day that needs one.
 */
function when(event: CalendarEvent): { startDate: string; endDate?: string } {
  if (!event.startTime) return { startDate: event.heldOn };

  const start = schoolTimeToUtc(event.heldOn, event.startTime);
  const end = new Date(start.getTime() + TIMED_EVENT_MINUTES * 60_000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}
