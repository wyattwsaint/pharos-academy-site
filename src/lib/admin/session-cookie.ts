import type { AstroCookies } from 'astro';

import { SESSION_COOKIE } from './sessions.js';

/**
 * The cookie the session token rides in, written the same way everywhere.
 *
 * `HttpOnly` so no script can read it, `SameSite=Lax` so it survives following
 * a link into the admin but is not sent on a cross-site form post, `Secure`
 * outside development because the dev server is plain HTTP and a `Secure`
 * cookie would simply never be stored there.
 */
export function setSessionCookie(cookies: AstroCookies, token: string, expiresAt: Date): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
