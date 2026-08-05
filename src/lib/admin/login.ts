import type { Db } from '../db/client.js';
import { matchesBreakGlass } from './passwords.js';
import { authenticate } from './users.js';

/**
 * One door, two keys (#18 §4).
 *
 * A named account is the way in. The break-glass value in the Vercel
 * environment is the answer to "both admins are locked out at once", and it is
 * only ever consulted after the named accounts have already said no — so it
 * cannot shadow a real account, and a normal login never touches it.
 *
 * The username is ignored for break-glass because break-glass is not anybody's
 * account; there is no name it could be right about.
 */
export type LoginOutcome = { userId: string | null; breakGlass: boolean };

export async function attemptLogin(
  db: Db,
  username: string,
  password: string,
): Promise<LoginOutcome | null> {
  const user = await authenticate(db, username, password);
  if (user) return { userId: user.id, breakGlass: false };
  if (matchesBreakGlass(password)) return { userId: null, breakGlass: true };
  return null;
}

/**
 * The one thing a failed login says.
 *
 * Never "no such user" and never "wrong password": which of the two it was is
 * information an attacker wants and Jill does not.
 */
export const LOGIN_FAILED = 'That username and password do not match an account.';
