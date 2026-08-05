import { boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * The store, as Drizzle sees it (spec #18 §2).
 *
 * The DDL that actually creates these tables lives in `migrations.ts`, not in
 * generated migration files: the same statements have to run against Neon in
 * production and against PGlite in the test process, and hand-written SQL is
 * the only form both accept without a codegen step in between. This module and
 * that one are two views of one schema — change them together.
 */

/**
 * A named admin account. Jill, George, and the developer's account that is
 * deleted at handoff.
 *
 * Permissions are flat by decision (#16): there is no role column because there
 * are no roles. Attribution is the only control on the money, which is why
 * every editable table carries a stamp rather than sharing one audit table.
 */
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** What is typed into the login form. Lowercased on write; unique. */
  username: text('username').notNull().unique(),
  /** What "last edited by" prints — the person's actual name. */
  displayName: text('display_name').notNull(),
  /** `scrypt$N$r$p$<salt hex>$<hash hex>`; see `admin/passwords.ts`. */
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A live login. 30 days, sliding (#18 §4).
 *
 * The cookie carries a random token; this table holds only its SHA-256, so a
 * leaked database row cannot be replayed as a cookie. Sessions are rows rather
 * than self-contained signed blobs so that a mutual password reset can end the
 * other person's sessions immediately — the whole point of mutual reset is that
 * it is the answer to "someone has my password".
 */
export const adminSessions = pgTable('admin_sessions', {
  /** SHA-256 of the cookie token, hex. */
  tokenHash: text('token_hash').primaryKey(),
  /** Null for a break-glass session: it is not any person's account. */
  userId: uuid('user_id').references(() => adminUsers.id, { onDelete: 'cascade' }),
  breakGlass: boolean('break_glass').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * The school's own details — one row, forever (`id` is checked to be 1).
 *
 * Entered once and rendered everywhere (#18 §10). The copyright year is
 * deliberately absent: it is computed at render, which is the whole reason the
 * live site has read "© 2025" all year.
 */
export const schoolDetails = pgTable('school_details', {
  id: integer('id').primaryKey(),
  /** Free text, newline-separated. One field because it is one label on one envelope. */
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  /** The first day of the school year, as a `YYYY-MM-DD` string. */
  schoolYearStart: date('school_year_start').notNull(),
  mission: text('mission').notNull(),
  vision: text('vision').notNull(),
  /**
   * The one place a giving destination is written down (#18 §12). Swapping the
   * host church's Vanco org for a Pharos merchant account has to be a settings
   * change, not a hunt through the templates.
   */
  giveUrl: text('give_url').notNull(),
  /** The stamp: who saved this row last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type SchoolDetails = typeof schoolDetails.$inferSelect;
