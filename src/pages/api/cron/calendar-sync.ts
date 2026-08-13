import type { APIRoute } from 'astro';

import { isrBypassToken } from '../../../lib/admin/isr-token.js';
import { revalidateAll, revalidationOrigin } from '../../../lib/admin/revalidate.js';
import { runCalendarSync } from '../../../lib/calendar/sync.js';
import { cronResponse as text, isAuthorisedCron } from '../../../lib/cron.js';
import { getDb } from '../../../lib/db/client.js';

/**
 * Every morning at 09:00 UTC — five in Enola on daylight time, four in the
 * winter (#153). Vercel schedules in UTC and does not follow the school's clock;
 * the hour is not load-bearing, since what it has to beat is a family reading
 * the calendar over breakfast.
 *
 * Reads the school's Google calendar and mirrors whatever is still ahead into
 * `synced_events`, then republishes the site — but only if something moved.
 *
 * **Daily rather than hourly, and the reason is a promise already made.** The
 * calendar page tells families in writing that a subscribed calendar reaches a
 * phone "within a few hours, sometimes a day or two", and that a short-notice
 * change comes by text. Reading Google every hour would sit inside a delay the
 * school has already published and would buy nobody anything.
 *
 * Under `/api` and not `/admin`, and carrying its own bearer check as the first
 * thing it does, for the reasons `lib/cron.ts` gives: the admin guard redirects
 * anything without a session, and a scheduler has none.
 *
 * A failed read is a 500 with the reason in it, and nothing written. That is
 * AC 7 exactly: the page keeps the events it already knows about, and the
 * failure is a red line in the cron log rather than an emptied calendar.
 */
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorisedCron(request, process.env.CRON_SECRET)) {
    // No detail, as with the backup: an unauthorised caller learns whether the
    // route exists and nothing else.
    return text('Not authorized.', 401);
  }

  // `process.env` rather than `import.meta.env`: this route only ever runs on
  // the deployment, where Vercel puts the project's variables there.
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    // A 500 rather than a quiet success, for the same reason the backup refuses
    // to answer OK with no mailer: green cron runs and an empty table is the
    // failure nobody investigates.
    return text('No GOOGLE_CALENDAR_ID is set. Nothing was read.', 500);
  }

  try {
    const report = await runCalendarSync({
      db: await getDb(),
      calendarId,
      /*
       * The republish, and only when something moved.
       *
       * Whole-site rather than the calendar page alone, which is the same
       * decision every admin save makes (`revalidate.ts`): a second source of
       * truth about which change touches which page drifts silently, and the
       * bug it produces is an event that is saved and invisible.
       */
      republish: () =>
        revalidateAll({
          origin: revalidationOrigin(url),
          bypassToken: isrBypassToken(),
        }),
    });

    return text(
      `Read the school's calendar: ${report.added} added, ${report.amended} amended, ` +
        `${report.removed} removed, ${report.past} already over. ` +
        `Skipped ${report.skipped.recurring} recurring, ${report.skipped.termDates} term dates, ` +
        `${report.skipped.cancelled} cancelled, ${report.skipped.unusable} unusable. ` +
        `${report.changed ? 'Republished.' : 'Nothing moved, so nothing was republished.'}`,
      200,
    );
  } catch (error) {
    // The message is the diagnosis — "answered 404", "does not read as a
    // calendar" — and the cron log is the only place anybody will look.
    return text(error instanceof Error ? error.message : String(error), 500);
  }
};
