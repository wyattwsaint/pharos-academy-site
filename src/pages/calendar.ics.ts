import { createHash } from 'node:crypto';

import type { APIRoute } from 'astro';

import { renderCalendarFeed } from '../lib/calendar/ics.js';
import { getSchoolYear, listPublishedEvents } from '../lib/calendar/store.js';
import { getDb } from '../lib/db/client.js';

/**
 * `pharosacademy.net/calendar.ics` — the parent subscribe link (#23).
 *
 * Generated from the school year and the events on every request, and never
 * stored: a stored copy is a second source of truth about the dates, which is
 * precisely the failure the five hand-made PDFs are.
 *
 * Rendered on request rather than prerendered, for the same reason the policy
 * PDFs are: the year is a row Jill can change from the admin, and
 * `PUBLIC_ROUTES` — the list the sitemap and whole-site revalidation walk — is
 * a build-time constant. It is deliberately **not** in that list. It is a
 * subscription rather than a page: nothing links to it as a document, search
 * engines have no use for it, and a calendar client asks for it on its own
 * schedule.
 *
 * A weak-ish `max-age` and a strong ETag are the honest pair here. Calendar
 * clients poll on their own schedule — hours, sometimes a day or two, which is
 * the thing the school is told in writing on the calendar page — so a short
 * cache costs nothing and an ETag turns most of those polls into an empty 304.
 * The ETag is computed over the feed with its DTSTAMP removed, so that
 * regenerating an unchanged year answers 304 rather than looking like a change.
 */
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const db = await getDb();
  const year = await getSchoolYear(db);

  if (!year) {
    // Before the migration that seeds the year has run there is nothing to
    // publish. An empty feed would quietly delete a subscriber's whole year.
    return new Response('The school year has not been published yet.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  /*
   * Both sources (#153). A parent who subscribed to this address gets the
   * school's whole calendar, whether the school typed a given evening here or
   * in Google.
   *
   * The UIDs in this feed are the school's own throughout — `event-<slug>@
   * pharosacademy.net`, built by `ics.ts` and never Google's. What is different
   * about a synced event is where its *slug* comes from: it is derived from
   * Google's identity rather than from the date and the title
   * (`syncedEventSlug`), so a title somebody fixes at the school keeps the same
   * UID here and arrives on a phone as an amendment rather than as a
   * cancellation and a new invitation.
   */
  const events = await listPublishedEvents(db);
  const body = renderCalendarFeed({ year, events, now: new Date() });

  const etag = `"${createHash('sha256')
    .update(body.replace(/DTSTAMP:\d{8}T\d{6}Z/g, ''))
    .digest('base64url')}"`;

  const headers = {
    'content-type': 'text/calendar; charset=utf-8',
    // Named, because this is what a client shows in its own subscription list.
    'content-disposition': 'inline; filename="pharos-academy.ics"',
    'cache-control': 'public, max-age=900, must-revalidate',
    etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
};
