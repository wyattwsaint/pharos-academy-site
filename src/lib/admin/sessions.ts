import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull, lt } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { adminSessions, adminUsers } from '../db/schema.js';

/**
 * Login sessions: 30 days, sliding (#18 §4).
 *
 * Generous on purpose, and safe to be: #8 moved the children's sensitive data
 * to paper, so the blast radius of a stolen cookie is course prices and PDFs.
 * The alternative — a session that expires between the two evenings a term when
 * Jill edits anything — makes every edit begin with a password hunt, which is
 * how an admin stops being used.
 *
 * The cookie carries a 256-bit random token and the row holds only its SHA-256.
 * #18 §4 says "signed HttpOnly cookie"; a hashed random token is the same
 * promise kept differently and kept better — see `docs/adr/0002`.
 */

export const SESSION_COOKIE = 'pharos_admin_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How much of the window has to have been used before activity rewrites the
 * expiry. Sliding on literally every request would put a write in front of
 * every admin page load to move a deadline a few seconds; a day's granularity
 * is indistinguishable to Jill and costs one write a day.
 */
export const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Whoever is driving the admin — a named person, or break-glass access. */
export type Actor = {
  /** Null for break-glass: it is not any person's account. */
  userId: string | null;
  /** What "last edited by" prints. */
  name: string;
  breakGlass: boolean;
};

export const BREAK_GLASS_ACTOR_NAME = 'Break-glass access';

/** When a session started or refreshed now would run out. */
export function nextExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_DURATION_MS);
}

/** Whether activity at `now` should push `expiresAt` forward. */
export function needsSlide(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() <= SESSION_DURATION_MS - SLIDE_AFTER_MS;
}

/** The SHA-256 of a cookie token, hex — what the row stores. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Open a session and return the cookie token.
 *
 * The token is returned exactly once, here. Nothing else can recover it from
 * the database, which is what makes a leaked row unreplayable.
 */
export async function startSession(
  db: Db,
  actor: { userId: string | null; breakGlass: boolean },
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = nextExpiry(now);

  await db.insert(adminSessions).values({
    tokenHash: hashToken(token),
    userId: actor.userId,
    breakGlass: actor.breakGlass,
    createdAt: now,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Who this cookie is, or null.
 *
 * Sliding happens here rather than in a separate call, because "activity" is
 * exactly the set of requests that resolve a session — anywhere else and the
 * two definitions would drift.
 */
export async function resolveSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<Actor | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      userId: adminSessions.userId,
      breakGlass: adminSessions.breakGlass,
      expiresAt: adminSessions.expiresAt,
      displayName: adminUsers.displayName,
    })
    .from(adminSessions)
    .leftJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // A session whose user row is gone — deleted from the Users screen — is over.
  // Only break-glass is legitimately person-less.
  if (!row.breakGlass && !row.displayName) return null;

  if (needsSlide(row.expiresAt, now)) {
    await db
      .update(adminSessions)
      .set({ expiresAt: nextExpiry(now) })
      .where(eq(adminSessions.tokenHash, tokenHash));
  }

  return {
    userId: row.userId,
    name: row.breakGlass ? BREAK_GLASS_ACTOR_NAME : (row.displayName ?? BREAK_GLASS_ACTOR_NAME),
    breakGlass: row.breakGlass,
  };
}

/** End one session — what the Sign out button does. */
export async function endSession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

/**
 * End every session belonging to one person.
 *
 * Called on a password reset. Mutual reset is the school's answer to "someone
 * has my password" (#18 §4), and a reset that left the old cookie working would
 * not be an answer to it.
 */
export async function endSessionsForUser(db: Db, userId: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
}

/** End every break-glass session. Used when break-glass has done its job. */
export async function endBreakGlassSessions(db: Db): Promise<void> {
  await db.delete(adminSessions).where(isNull(adminSessions.userId));
}

/** Drop expired rows. Cheap, and keeps the table from growing without bound. */
export async function purgeExpiredSessions(db: Db, now = new Date()): Promise<void> {
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
}
