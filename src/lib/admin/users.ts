import { asc, eq, ne } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { adminUsers, type AdminUser } from '../db/schema.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { endSessionsForUser } from './sessions.js';

/**
 * Named accounts for Jill and George, self-rolled against Neon (#18 §4).
 *
 * Flat permissions: no roles, no hierarchy, no gate on the money screens. The
 * user overrode the recommendation to gate money to George, and the consequence
 * is that attribution is the only remaining control on it — which is why these
 * accounts are load-bearing rather than ceremonial.
 */

/** The shortest password the admin will accept. Length is the only rule. */
export const MIN_PASSWORD_LENGTH = 12;

export type UserSummary = Pick<AdminUser, 'id' | 'username' | 'displayName' | 'createdAt'>;

/** Everyone with a login, oldest first, so the list does not reshuffle. */
export async function listUsers(db: Db): Promise<UserSummary[]> {
  return db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt), asc(adminUsers.username));
}

/**
 * Add an account. `username` is what is typed at the login form;
 * `displayName` is what "last edited by" prints.
 */
export async function createUser(
  db: Db,
  input: { username: string; displayName: string; password: string },
): Promise<UserSummary> {
  const username = normaliseUsername(input.username);
  const displayName = input.displayName.trim();

  if (!username) throw new Error('A username is required.');
  if (!displayName) throw new Error('A name is required.');
  assertPasswordAcceptable(input.password);

  const [row] = await db
    .insert(adminUsers)
    .values({ username, displayName, passwordHash: hashPassword(input.password) })
    .returning({
      id: adminUsers.id,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      createdAt: adminUsers.createdAt,
    });

  if (!row) throw new Error('The account was not created.');
  return row;
}

/**
 * The named account for these credentials, or null.
 *
 * Deliberately one answer for "no such user" and "wrong password": telling the
 * two apart tells an attacker which usernames exist. The hash is still verified
 * against a decoy when the user is missing, so the two answers also take the
 * same time.
 */
export async function authenticate(
  db: Db,
  username: string,
  password: string,
): Promise<UserSummary | null> {
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, normaliseUsername(username)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    verifyPassword(password, DECOY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.passwordHash)) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

/**
 * Set someone's password — the mutual reset (#18 §4).
 *
 * Either admin may do this to the other, and to themselves. Their existing
 * sessions end, because the reason to reset a password is usually that someone
 * else has it.
 */
export async function setPassword(db: Db, userId: string, password: string): Promise<void> {
  assertPasswordAcceptable(password);
  const updated = await db
    .update(adminUsers)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(adminUsers.id, userId))
    .returning({ id: adminUsers.id });

  if (updated.length === 0) throw new Error('That account no longer exists.');
  await endSessionsForUser(db, userId);
}

/**
 * Delete an account — how the developer's build-time account leaves at handoff.
 *
 * The last account cannot be deleted. Deleting it would leave break-glass as
 * the only way in, and break-glass is the path that is supposed to stay cold.
 */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  const others = await db.select({ id: adminUsers.id }).from(adminUsers).where(ne(adminUsers.id, userId));
  if (others.length === 0) {
    throw new Error('This is the only account left. Add another before deleting this one.');
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, userId));
}

/** Usernames are typed by people; case and stray spaces are not part of them. */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * The only password rule is length.
 *
 * Composition rules push people towards `Password1!` and towards writing it
 * down beside the screen. The school's recovery story is mutual reset, which
 * makes a long passphrase they can actually remember the right target.
 */
export function assertPasswordAcceptable(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

/**
 * A real hash of a value nobody knows, so an unknown username costs the same
 * scrypt work as a known one.
 */
const DECOY_HASH = hashPassword('decoy-so-an-unknown-username-costs-the-same');

/**
 * What the Users screen can ask for.
 *
 * Reset and delete, and nothing else: accounts are created by `db:seed` from
 * passwords held in the environment (#18 §4), so there is no add-an-account
 * form to parse. `displayName` rides along on the form only so the confirmation
 * can name the person without a second read.
 */
export type UserAction =
  | { intent: 'reset'; userId: string; displayName: string; password: string }
  | { intent: 'delete'; userId: string; displayName: string };

/** A submitted form as one of the two things it can be, or null for neither. */
export function parseUserAction(form: FormData): UserAction | null {
  const userId = String(form.get('userId') ?? '').trim();
  const displayName = String(form.get('displayName') ?? '').trim() || 'that account';

  switch (String(form.get('intent') ?? '')) {
    case 'reset':
      // Not trimmed: a leading or trailing space is part of a password.
      return { intent: 'reset', userId, displayName, password: String(form.get('password') ?? '') };
    case 'delete':
      return { intent: 'delete', userId, displayName };
    default:
      return null;
  }
}

/**
 * Carry out an action and return what to tell Jill she just did.
 *
 * Throws on refusal — the messages from this module are already written for her
 * ("A password needs at least 12 characters."), so the screen shows them rather
 * than replacing them.
 */
export async function applyUserAction(db: Db, action: UserAction): Promise<string> {
  switch (action.intent) {
    case 'reset':
      await setPassword(db, action.userId, action.password);
      return `Password changed for ${action.displayName}. They are signed out everywhere.`;
    case 'delete':
      await deleteUser(db, action.userId);
      return `Deleted ${action.displayName}.`;
  }
}

/**
 * A refusal in the words Jill needs.
 *
 * Only one case needs translating: a database-level constraint surfaces as a
 * driver error whose text is about columns, not about accounts.
 */
export function humanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/unique|duplicate/i.test(raw)) return 'That username is already taken.';
  return raw;
}
