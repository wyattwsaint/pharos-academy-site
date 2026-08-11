import type { APIRoute } from 'astro';

import { isAuthorisedCron, resendSender, sendMonthlyBackup } from '../../../lib/backup/monthly.js';
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

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    // A 500 rather than a quiet success: an unconfigured send that answers "OK"
    // is twelve months of green cron runs and no backup anywhere.
    return text('RESEND_API_KEY and MAIL_FROM are not both set — nothing was sent.', 500);
  }

  try {
    const result = await sendMonthlyBackup(await getDb(), {
      sender: resendSender(apiKey),
      from,
    });
    return text(`Sent ${result.filename} (${result.bytes} bytes) to ${result.to}.`, 200);
  } catch (error) {
    // The message is the diagnosis — "the archive is too big to email", "the
    // school has no email address" — and it belongs in the cron log, which is
    // the only place anybody will ever look.
    return text(error instanceof Error ? error.message : String(error), 500);
  }
};

function text(message: string, status: number): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
