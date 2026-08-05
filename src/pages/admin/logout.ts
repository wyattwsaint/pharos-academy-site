import type { APIRoute } from 'astro';

import { clearSessionCookie } from '../../lib/admin/session-cookie.js';
import { endSession, SESSION_COOKIE } from '../../lib/admin/sessions.js';
import { getDb } from '../../lib/db/client.js';

export const prerender = false;

/**
 * Sign out: delete the row, then the cookie.
 *
 * `POST` only. A `GET` logout is a link a prefetcher or an image tag can fire,
 * and being signed out by a page you merely visited is exactly the kind of
 * unexplained thing that makes an admin feel broken.
 */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await endSession(await getDb(), cookies.get(SESSION_COOKIE)?.value);
  clearSessionCookie(cookies);
  return redirect('/admin/login', 303);
};
