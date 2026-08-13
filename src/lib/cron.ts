import { timingSafeEqual } from 'node:crypto';

/**
 * What the two scheduled routes share (#33, #153).
 *
 * There are two of them now — the monthly backup and the nightly calendar
 * read — and they are the only things on this site that arrive without a
 * person. Both live under `/api` rather than under `/admin`, because the
 * middleware's admin guard redirects anything without a session to the login
 * page and a scheduler carrying a bearer token has no session and no way to get
 * one. So each carries its own guard, and the guard is here rather than in
 * either of them: a second copy is the one that goes wrong quietly.
 */

/**
 * Is this request the scheduler?
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. What is behind these
 * routes is worth guarding: one of them mails the school's entire content to
 * the settings address, and an unauthenticated version of it is a way for
 * anyone on the internet to make the site do that as often as they like.
 *
 * An unset secret refuses *everybody*. The default that reads as harmless — an
 * empty secret compared against an absent header — is two empty strings, which
 * are equal, and the endpoint would be open precisely on the deployment where
 * nobody configured it.
 */
export function isAuthorisedCron(request: Request, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? '';
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;

  const offered = Buffer.from(match[1].trim(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  // Length is not a secret, and `timingSafeEqual` throws on a mismatch.
  if (offered.length !== wanted.length) return false;
  return timingSafeEqual(offered, wanted);
}

/**
 * What a scheduled route answers with: a line of plain English and a status.
 *
 * Read by one audience — whoever opens the cron log after something went
 * wrong — so it is a sentence rather than a status code or a JSON body, and the
 * sentence is the diagnosis.
 */
export function cronResponse(message: string, status: number): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
