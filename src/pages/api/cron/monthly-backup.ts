import type { APIRoute } from 'astro';

import { configuredMailer, sendMonthlyBackup } from '../../../lib/backup/monthly.js';
import { cronResponse as text, isAuthorisedCron } from '../../../lib/cron.js';
import { getDb } from '../../../lib/db/client.js';

/**
 * The 1st of the month (#33, AC 4).
 *
 * Fired by the Vercel cron declared in `vercel.json`, which is the only thing
 * that should ever reach it — hence the bearer check, which is the *first* thing
 * this does. Everything after it reads the whole database and mails it.
 *
 * Under `/api` rather than under `/admin` on purpose: the middleware's admin
 * guard redirects anything without a session to the login page, and a scheduler
 * carrying a bearer token has no session and no way to get one. This route
 * carries its own guard, which is why the guard is tested (`monthly.test.ts`)
 * rather than inherited.
 */
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorisedCron(request, process.env.CRON_SECRET)) {
    // No detail. An unauthorised caller learns whether the route exists and
    // nothing else — not whether a secret is set, not whether theirs was close.
    return text('Not authorized.', 401);
  }

  // `process.env` rather than `import.meta.env`: this route only ever runs on
  // the deployment, where Vercel puts the project's variables there.
  const mailer = configuredMailer(process.env);
  if (!mailer) {
    // A 500 rather than a quiet success: an unconfigured send that answers "OK"
    // is twelve months of green cron runs and no backup anywhere.
    return text(
      `No mail credentials are set — set GMAIL_USER and GMAIL_APP_PASSWORD, or RESEND_API_KEY and MAIL_FROM. Nothing was sent.`,
      500,
    );
  }

  try {
    const result = await sendMonthlyBackup(await getDb(), {
      sender: mailer.sender,
      from: mailer.from,
      // Whatever this route can actually carry, which is smaller on Gmail. The
      // ceiling travels with the mailer so that changing route cannot leave the
      // cron cheerfully attaching an archive the far end will reject.
      maxBytes: mailer.maxAttachmentBytes,
    });
    return text(`Sent ${result.filename} (${result.bytes} bytes) to ${result.to}.`, 200);
  } catch (error) {
    // The message is the diagnosis — "the archive is too big to email", "the
    // school has no email address" — and it belongs in the cron log, which is
    // the only place anybody will ever look.
    return text(error instanceof Error ? error.message : String(error), 500);
  }
};
