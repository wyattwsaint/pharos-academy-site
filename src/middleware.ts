import type { MiddlewareHandler } from 'astro';

import { getDb } from './lib/db/client.js';
import { setSessionCookie } from './lib/admin/session-cookie.js';
import { resolveSession, SESSION_COOKIE } from './lib/admin/sessions.js';
import { INDEXABLE } from './lib/site.js';

/**
 * Two jobs, both of which have to be true of *every* response.
 *
 * 1. Crawlers. Pre-launch the whole site is `noindex, nofollow`; the admin is
 *    `noindex, nofollow` forever, including after `INDEXABLE` flips. This lives
 *    here rather than in `vercel.json` so it reads the same constant
 *    `robots.txt` does — a static header in the platform config is exactly the
 *    kind of second place a launch switch gets forgotten.
 *
 * 2. The admin guard. `/admin/*` resolves the session cookie once, hands the
 *    actor to the page through `locals`, and redirects to the login page when
 *    there is nobody. Doing it here rather than per page means a new admin
 *    screen is protected by existing, not by remembering.
 */

/** The only `/admin` paths reachable without a session. */
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/logout']);

export const onRequest: MiddlewareHandler = async (context, next) => {
  const isAdmin = context.url.pathname === '/admin' || context.url.pathname.startsWith('/admin/');

  if (isAdmin) {
    const redirect = await guardAdmin(context);
    if (redirect) return withRobotsHeader(redirect, true);
  }

  return withRobotsHeader(await next(), isAdmin);
};

/**
 * Resolve the cookie, publish the actor, and say whether the request should be
 * bounced to the login page instead of being served.
 */
async function guardAdmin(
  context: Parameters<MiddlewareHandler>[0],
): Promise<Response | undefined> {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  // Resolving is also what slides the 30-day window forward, so "activity" is
  // exactly "a request to the admin" and cannot drift from it.
  context.locals.actor = token ? await resolveSession(await getDb(), token) : null;

  if (context.locals.actor) {
    // Re-stamp the cookie to the row's authoritative expiry, so the browser's
    // copy slides with the database's rather than expiring underneath it.
    if (token) setSessionCookie(context.cookies, token, context.locals.actor.expiresAt);
    return undefined;
  }
  if (PUBLIC_ADMIN_PATHS.has(context.url.pathname)) return undefined;

  // `next` is what sends Jill back to the page she asked for after logging in,
  // rather than dumping her on a dashboard and making her navigate again.
  const next = `${context.url.pathname}${context.url.search}`;
  return context.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 303);
}

function withRobotsHeader(response: Response, isAdmin: boolean): Response {
  if (isAdmin || !INDEXABLE) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}
