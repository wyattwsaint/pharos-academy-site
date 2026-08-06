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

/**
 * The catalogue — the nineteen courses, and the one place they exist (#22).
 *
 * The live site publishes these across nine hand-maintained artefacts that
 * already disagree with one another. This table is the answer to that: a parent
 * can find a class four ways and every one of them agrees, because all four
 * surfaces read these rows.
 *
 * Two columns are conspicuously missing. There is **no price** and **no contact
 * hours**: both are computed from `weeks`, the meeting times and the rate tier
 * (`courses/pricing.ts`). A stored price is exactly how nine artefacts drift.
 *
 * `age_min` and `age_max` are nullable together, and Algebra 1 is why — "8th
 * Grade and older (or younger students who demonstrate proficiency)" is a
 * prerequisite wearing an age's clothes. A null range means *shown to
 * everyone*, never *shown to nobody* (`courses/ages.ts`).
 */
export const courses = pgTable('courses', {
  /** The URL segment, and the key: `/classes/<slug>`. */
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  /** The classical stages it is filed under; Algebra 1 is filed under two. */
  stages: text('stages').array().notNull(),
  /** Day tracks (CONTEXT.md). Algebra 1 meets on two of them. */
  days: text('days').array().notNull(),
  /** `HH:MM`, 24-hour. The published "9:00-10:30 a.m." is derived from the pair. */
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  /** `year` | `fall` | `spring` | `block` (CONTEXT.md, "enrolment unit"). */
  enrolment: text('enrolment').notNull(),
  /** Meeting weeks per day track. */
  weeks: integer('weeks').notNull(),
  /** A block's published meeting dates, `YYYY-MM-DD`. Empty for anything else. */
  dates: text('dates').array().notNull(),
  /** The school's own age wording, which is not always a numeric range. */
  ageLabel: text('age_label').notNull(),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  /** `standard` | `highSchoolCredit` — a name, so the rates live in one module. */
  rateTier: text('rate_tier').notNull(),
  credit: text('credit'),
  requiredText: text('required_text'),
  optionalText: text('optional_text'),
  materialsToBuy: text('materials_to_buy'),
  materialsFee: integer('materials_fee'),
  materialsFeeNote: text('materials_fee_note'),
  assessmentFee: integer('assessment_fee'),
  assessmentFeeNote: text('assessment_fee_note'),
  prerequisites: text('prerequisites').notNull(),
  /**
   * Who teaches it — a `people.slug`, not a typed name (#26, ADR-0004).
   *
   * A foreign key rather than text, so the catalogue cannot name somebody who
   * is not in the one list, and correcting a name on the staff page corrects it
   * on every class page and in the timetable at the same moment.
   */
  instructorSlug: text('instructor_slug')
    .notNull()
    .references(() => people.slug),
});

/**
 * The school's people — leadership and instructors in one table (#26).
 *
 * There is deliberately **no `is_instructor` column**: a person teaches exactly
 * when a course names them, so the two roles cannot disagree. `leadership_rank`
 * is a column because it carries an order the staff page renders in, and that
 * order is the school's decision rather than a derivable fact.
 *
 * `bio` and `photo` are nullable and both are null for eight of the ten. That
 * is the published state, not an unfinished one: the school has written three
 * bios, and portraits are photographs of real consenting adults that Jill has
 * yet to supply (#13, slot 4).
 */
export const people = pgTable('people', {
  /** The URL segment on the staff page, and what `courses.instructor_slug` points at. */
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  bio: text('bio'),
  /** A path under `public/`. Null for everybody until slot 4 is unblocked. */
  photo: text('photo'),
  /** Position on the staff page, low first. Null means not leadership. */
  leadershipRank: integer('leadership_rank'),
  /** The stamp: who saved this person last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type SchoolDetails = typeof schoolDetails.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
