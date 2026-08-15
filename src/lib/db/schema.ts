import {
  boolean,
  customType,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
/**
 * A PDF, as bytes, in the one place the site's data lives (#18).
 *
 * Drizzle has no `bytea` column, and the two drivers this schema runs on
 * disagree about the shape of one — PGlite hands back a `Uint8Array`, neon-http
 * a hex string over JSON, and node-postgres a `Buffer`. So the type is written
 * once, here, in the form both directions can agree on.
 *
 * **Out** is the buffer itself, and it has to be: PGlite refuses anything that
 * is not a `Uint8Array` for a bytea parameter, and neon-http hex-encodes a
 * `Buffer` on its own before it puts the parameter in the JSON request body
 * (`encodeBuffersAsBytea`). A hex string, which looks like the driver-agnostic
 * choice, is the one thing PGlite rejects outright.
 *
 * **In** normalises all three shapes to a `Buffer`, so a caller — the route that
 * serves the file — never has to know which driver it is talking to.
 */
export const bytea = customType<{ data: Buffer; driverData: unknown }>({
  dataType: () => 'bytea',
  toDriver: (value) => value,
  fromDriver: (value) => {
    if (typeof value === 'string') {
      // `\x` then hex — Postgres's default `bytea_output`.
      return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
    }
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new Error(`Unexpected bytea shape from the driver: ${typeof value}`);
  },
});

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
  /**
   * Where a family pays online — the church's Vanco page (#111, #187). Beside
   * the giving destination for the same reason it exists at all: the office
   * changes where the money goes without a deploy.
   *
   * One address, covering **the whole sum** — registration, deposits and
   * tuition — in a single payment, because that is one Vanco campaign and not
   * two (ADR-0013, ADR-0017). There is no second channel: a cheque is the
   * fallback for all of it, never for a part of it.
   *
   * Empty is a real state, and the only honest default: until someone pastes
   * the page in, the Apply page offers no online option rather than a link
   * that goes nowhere.
   */
  payOnlineUrl: text('pay_online_url').notNull().default(''),
  /**
   * The same giving page with the family's figures written onto it (#265) — a
   * URL carrying `{amount}` and `{reference}`, checked at save against
   * `pay_online_url` and refused if it is not that page.
   *
   * A setting rather than code because the query parameter it uses is
   * undocumented: Vanco publishes nothing about it, so the day it changes is a
   * paste into this box rather than a deploy. `money/giving-link.ts` is what
   * reads it, and says what the checking is for.
   *
   * Empty is how it ships, and empty is a real state: the school's campaign
   * opens set to a **Monthly** frequency, and an amount arriving prefilled
   * beside a monthly selector is a recurring gift one default away.
   */
  givingLinkTemplate: text('giving_link_template').notNull().default(''),
  /**
   * The announcement banner — the short, timely line at the top of the home
   * page (#15). Four columns rather than a table because there is one of it,
   * and it lives here rather than beside the announcements because saving this
   * row already revalidates the published pages.
   *
   * The switch is separate from the words on purpose: the office turns the
   * banner off after the start of term without emptying the fields it will
   * want again next year.
   */
  bannerEnabled: boolean('banner_enabled').notNull().default(false),
  bannerMessage: text('banner_message').notNull().default(''),
  /**
   * `YYYY-MM-DD`, and nullable — a banner that has never been used has no date,
   * and an epoch stored as a placeholder is a date somebody eventually
   * publishes. A real date rather than free text, so "Augsut 31" cannot ship.
   */
  bannerDate: date('banner_date'),
  /** Empty for an unlinked message. Absolute http(s) when set. */
  bannerLink: text('banner_link').notNull().default(''),
  /** The stamp: who saved this row last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * The catalogue — the school's courses, and the one place they exist (#22).
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
  /**
   * The units ticked as purchasable (#24) — admin data, never inferred from
   * `enrolment`. Non-empty, values among the four; a check enforces both.
   */
  enrolmentUnits: text('enrolment_units').array().notNull(),
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
   *
   * **Nullable, and null is a real state** (#257). The school puts a class on
   * the schedule before it decides who teaches it, so a course with nobody
   * named is a class it intends to run and has not staffed — the same kind of
   * fact as a person with no `bio` and no `photo`. Every surface renders the
   * absence rather than inventing a name.
   */
  instructorSlug: text('instructor_slug').references(() => people.slug),
  /**
   * When the school stopped running this class, or null while it runs (#263).
   *
   * A timestamp rather than a boolean, because "when did we stop running this?"
   * is a question the office asks and a `retired boolean` cannot answer. Null is
   * the live state, so every row written before this column existed is live —
   * which is what they all were.
   *
   * Retiring is **not** deleting. The row stays, its class page stays at its own
   * address, and the applications that named it still count in the class tally;
   * what a retired course loses is the catalogue's listings, the timetable and
   * the Apply page's offerings (`listCourses`).
   */
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  /** The stamp: who saved this course last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * The school's people — leadership and instructors in one table (#26).
 *
 * There is deliberately **no `is_instructor` column**: a person teaches exactly
 * when a course names them, so the two roles cannot disagree. `leadership_rank`
 * is a column because it carries an order the staff page renders in, and that
 * order is the school's decision rather than a derivable fact.
 *
 * `bio` and `photo` are nullable and mostly null: the school has written three
 * bios and supplied four photographs (#99). That is the published state, not an
 * unfinished one — a person with neither renders as a name and what they teach,
 * and the six faces the school has not sent stay absent rather than borrowed.
 */
export const people = pgTable('people', {
  /** The URL segment on the staff page, and what `courses.instructor_slug` points at. */
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  bio: text('bio'),
  /** A path under `public/`, or null. `/portraits/<slug>.webp` for the four. */
  photo: text('photo'),
  /** Position on the staff page, low first. Null means not leadership. */
  leadershipRank: integer('leadership_rank'),
  /**
   * When the school stopped listing this person, or null while it does (#263).
   *
   * The same column as `courses.retired_at`, added by the same migration and
   * for the same reason — an instructor who has left is not a row to delete,
   * because the classes they taught point at it. Nothing reads it yet: retiring
   * a person is its own ticket, and this is here so that ticket needs no second
   * migration against a live database.
   */
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  /** The stamp: who saved this person last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * What the school is announcing, and what it announced (#27).
 *
 * There is no board-update column, table or flag, and that absence is the
 * ticket: the live site's "Latest School Board Update – 7/1/2026" is a fixed
 * slot holding a dated PDF, and a fixed slot is what makes a July file still be
 * the front page in October. Here a board update is a row with a file attached,
 * ages out on the same rule as a bake sale, and needs nothing retired.
 *
 * The PDF is `bytea` in this table rather than an object in Blob storage,
 * because spec #18 puts the site's bytes in Neon: one store, one `pg_dump`, no
 * second set of credentials to hand over at the end. It is also not a shared
 * `files` table with the policies (#23) — an attachment is owned by one
 * announcement and dies with it, where a policy is a versioned document at a
 * stable address.
 *
 * `posted_on` is a date the school types and is deliberately not the stamp:
 * fixing a typo in August must not make a July notice look new to the freshness
 * rule.
 */
export const announcements = pgTable('announcements', {
  /** `2026-07-01-school-board-update-july-2026` — dated first, so it sorts. */
  slug: text('slug').primaryKey(),
  headline: text('headline').notNull(),
  /** Required: a headline with nothing under it is a rumour. */
  body: text('body').notNull(),
  /** `YYYY-MM-DD`, the day the school published it. Drives the six-week rule. */
  postedOn: date('posted_on').notNull(),
  /** Somewhere to go, and what it is called. Both or neither — a check enforces it. */
  linkUrl: text('link_url'),
  linkLabel: text('link_label'),
  /** The attached PDF, filename and bytes. Both or neither, likewise. */
  attachmentFilename: text('attachment_filename'),
  attachmentBytes: bytea('attachment_bytes'),
  /** The stamp: who saved this last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * The school's policy documents, and the addresses they are served at (#28).
 *
 * Two tables rather than one, and the split is the ticket. This one is the
 * *document* — a slug that never moves, a title, the sentence that says what it
 * is, where it sits in the list, and whether parents sign it. The bytes are
 * next door, one row per upload, so replacing a file appends rather than
 * overwrites and "what did that family actually sign?" stays answerable.
 *
 * `current_version`, `current_filename` and `updated_at` are denormalised from
 * the newest version row on purpose: every read of the policies page wants
 * exactly those three and none of the bytes, and a join to get them would be a
 * join on every render of a page whose whole point is being fast to skim.
 * `replacePolicyFile` writes both tables together and is the only writer.
 *
 * **There is no date column Jill can type into.** `updated_at` is set from the
 * upload, which is the acceptance criterion: the live site's PDFs each carry a
 * hand-maintained "Updated 7-23-2026" on their cover page, and a hand-
 * maintained date is a date that is eventually wrong.
 */
export const policies = pgTable('policies', {
  /** The URL segment, minted from the title once and then frozen. */
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  /** One sentence. Empty until somebody writes it, which is a real state. */
  description: text('description').notNull().default(''),
  /** Position on the policies page, low first. */
  position: integer('position').notNull(),
  /** The one "parents sign this" tick the create form offers. */
  signed: boolean('signed').notNull().default(false),
  /** The newest version's number. Null until the first upload. */
  currentVersion: integer('current_version'),
  /** What that version's file is called. Null exactly when `current_version` is. */
  currentFilename: text('current_filename'),
  /** When it was uploaded — the date a parent reads. Never typed. */
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  /** The stamp: who saved this row last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * Every version of every policy, bytes included (#28).
 *
 * Append-only by construction — nothing in the codebase updates or deletes a
 * row here. That is what "prior versions are retained" means as a table rather
 * than as an intention: there is no code path that could lose one.
 *
 * Scale, from the mirror: 18 PDFs at 3.0 MB total, largest 921 KB. A decade of
 * retained versions is roughly 30 MB against Neon Free's 0.5 GB, which is the
 * arithmetic that made keeping everything cheaper than deciding what to prune.
 *
 * **`policy_slug` names a policy and does not point at one** (#260, ADR-0021).
 * It carried a foreign key with `on delete cascade` until 0023 dropped it,
 * which made the policy row load-bearing for documents that outlive it: an
 * application records its agreements as text — `handbook=parent@3`, no key of
 * its own — so a cascade would take away the PDF a family agreed to and leave
 * the record naming it behind. A version row is the same kind of thing that
 * agreement cell is, and it goes on resolving at its own permanent address
 * whether or not any policy still holds the slug.
 */
export const policyVersions = pgTable(
  'policy_versions',
  {
    policySlug: text('policy_slug').notNull(),
    /** 1, 2, 3 … per policy. The number in the versioned URL. */
    version: integer('version').notNull(),
    filename: text('filename').notNull(),
    bytes: bytea('bytes').notNull(),
    /** The upload's own clock. This, promoted, is what a parent sees as the date. */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    /** The actor who uploaded it — attribution on the file, not just on the row. */
    uploadedBy: text('uploaded_by'),
  },
  (table) => [primaryKey({ columns: [table.policySlug, table.version] })],
);

/**
 * Every number about money the school controls — one row, forever (#29).
 *
 * A separate table from `school_details` rather than seven more columns on it,
 * and the reason is the confirmation: saving this row is the one save on the
 * site that has to stop and say "this affects every family" first. Sharing a
 * row with the phone number would mean either correcting a typo in the address
 * asks that question, or changing the deposit does not.
 *
 * Dollars are `integer` and not `numeric`, because every figure the school
 * publishes is a whole number of them and a cent that cannot be typed is a cent
 * that cannot be wrong. The four instalment dates are an array with a length
 * check rather than four columns: they are one ordered fact, and the form
 * renders them as one repeated control.
 *
 * `deposit_credited_against_tuition` defaults true, confirmed by George (#14).
 */
export const moneySettings = pgTable('money_settings', {
  id: integer('id').primaryKey(),
  /** Dollars an hour for an ordinary class. */
  standardRate: integer('standard_rate').notNull(),
  /** Dollars an hour for a class carrying high-school credit. */
  highSchoolCreditRate: integer('high_school_credit_rate').notNull(),
  registrationFee: integer('registration_fee').notNull(),
  classDeposit: integer('class_deposit').notNull(),
  lateFee: integer('late_fee').notNull(),
  /** One number. The handbook gives two, and the school owes an answer (#29 AC 7). */
  studyHallFee: integer('study_hall_fee').notNull(),
  /** Four `YYYY-MM-DD` strings, earliest first. */
  instalmentDates: text('instalment_dates').array().notNull(),
  refundTerms: text('refund_terms').notNull(),
  depositCreditedAgainstTuition: boolean('deposit_credited_against_tuition')
    .notNull()
    .default(true),
  /** Where an application notification goes. More than one is the normal case. */
  notificationAddresses: text('notification_addresses').array().notNull(),
  /**
   * The stamp, and it is load-bearing here in a way it is not elsewhere:
   * permissions are flat (#16), so attribution is the only control on the money.
   */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * The money terms one family agreed to, frozen at the moment they applied (#29).
 *
 * The columns duplicate `money_settings` on purpose. A foreign key to the
 * settings row would mean every enrolled family's terms changed the instant
 * George corrected a fee, which is precisely what "a change never rewrites what
 * an already-enrolled family agreed to" forbids. The price a family applied at
 * is the price they pay, and the only way a row can promise that is by holding
 * the numbers itself.
 *
 * Nothing in the codebase updates a row here. It is written once, by
 * `recordAgreedTerms`, and read thereafter — which is the same construction
 * that makes policy versions retained rather than merely intended to be.
 *
 * The application flow (#18 §11) is what will create these; this table and its
 * writer exist now because the settings screen is meaningless without the thing
 * it must not reach.
 */
export const agreedTerms = pgTable('agreed_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Who agreed. The family's own name, as they typed it. */
  familyName: text('family_name').notNull(),
  /** When. Not the stamp — nothing edits this row, so there is nothing to stamp. */
  agreedAt: timestamp('agreed_at', { withTimezone: true }).notNull().defaultNow(),
  standardRate: integer('standard_rate').notNull(),
  highSchoolCreditRate: integer('high_school_credit_rate').notNull(),
  registrationFee: integer('registration_fee').notNull(),
  classDeposit: integer('class_deposit').notNull(),
  lateFee: integer('late_fee').notNull(),
  studyHallFee: integer('study_hall_fee').notNull(),
  instalmentDates: text('instalment_dates').array().notNull(),
  refundTerms: text('refund_terms').notNull(),
  depositCreditedAgainstTuition: boolean('deposit_credited_against_tuition').notNull(),
  notificationAddresses: text('notification_addresses').array().notNull(),
});

/**
 * The school year — one row, the way `school_details` is one row (#23).
 *
 * It holds a name and nothing else, because the year *is* its terms and its
 * closed days and those are the two tables below. A single row rather than one
 * per year on purpose: the site publishes the year it is in, and a second row
 * would immediately raise the question of which one the calendar page and the
 * feed are for. Next summer Jill types over these values.
 */
export const schoolYear = pgTable('school_year', {
  id: integer('id').primaryKey(),
  /** '2026–2027', as the school writes it on its own sheets. */
  label: text('label').notNull(),
  /** The stamp: who saved the year last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * What one day track does in one semester (#23).
 *
 * Eight rows at most, and **fewer is a complete year**: a track with no first
 * class date and no courses is the Tuesday track's routine state (CONTEXT.md,
 * "day track"), so its absence here is data the school typed rather than a
 * fault. That is why this is a table of present tracks and not eight columns
 * on the row above, half of which would be null and would read as missing.
 *
 * `weeks` counts meetings, not calendar weeks — the closures are skipped, and
 * `calendar/year.ts` is where that computation lives.
 */
export const schoolYearTerms = pgTable(
  'school_year_terms',
  {
    /** `fall` | `spring`. */
    semester: text('semester').notNull(),
    /** `Monday` … `Thursday` — a day track, as the catalogue spells them. */
    track: text('track').notNull(),
    /** `YYYY-MM-DD`, and it is that track's own weekday or it is refused. */
    firstClassDate: date('first_class_date').notNull(),
    weeks: integer('weeks').notNull(),
  },
  (table) => [primaryKey({ columns: [table.semester, table.track] })],
);

/**
 * A day the school is closed (#23).
 *
 * **No track column, and that absence is the model.** A closure falls on a
 * weekday and the track meeting that weekday is the one that loses it, which is
 * exactly why the four tracks' week numbers disagree. Thanksgiving is four rows
 * here — 25, 26 and 30 November and 1 December — and takes a week off all four
 * tracks; Election Day is one row and touches only Tuesday.
 */
export const schoolYearClosures = pgTable('school_year_closures', {
  /** `YYYY-MM-DD`, and the key: the school is closed on a day at most once. */
  closedOn: date('closed_on').primaryKey(),
  /** 'Labor Day'. Printed on the sheet beside the gap, so it is required. */
  label: text('label').notNull(),
});

/**
 * A one-off on the calendar — a concert, a picture day, a parents' evening (#23).
 *
 * A separate table from the term dates, and not a flag on one shared model.
 * Term dates are a computation over eight numbers; an event is a thing that
 * happens once, at a place, possibly at a time. Forcing them into one shape
 * would mean either an event carrying a week number that means nothing or a
 * meeting date carrying a place that never varies.
 *
 * `start_time`, `place` and `note` are nullable together with nothing else:
 * an all-day event with no location is an ordinary event, not half of one.
 */
export const calendarEvents = pgTable('calendar_events', {
  /** `2026-10-17-fall-open-house` — dated first, so it sorts. */
  slug: text('slug').primaryKey(),
  heldOn: date('held_on').notNull(),
  title: text('title').notNull(),
  /** `HH:MM`, 24-hour. Null means an all-day event, which is a real state. */
  startTime: text('start_time'),
  place: text('place'),
  note: text('note'),
  /** The stamp: who saved this last, and when. Overwritten, never appended. */
  lastEditedBy: text('last_edited_by'),
  lastEditedAt: timestamp('last_edited_at', { withTimezone: true }),
});

/**
 * A one-off the school keeps in its Google calendar, mirrored here (#153).
 *
 * **A second table rather than a column on `calendar_events`, and that is the
 * design** (ADR-0012). The sync replaces the whole of this table on every run,
 * so "the sync does not overwrite what an admin typed" is a fact about the
 * schema rather than about a `where` clause somebody has to keep right. The
 * editable set (CONTEXT.md) is unchanged: nothing on this table is editable
 * from the admin, because it is edited in Google.
 *
 * Keyed on Google's own `uid`, which survives a retitle and a move — that is
 * what makes an amendment in Google an amendment here rather than a deletion
 * and a new event on a subscriber's phone.
 *
 * There is no stamp. A stamp names an *actor* who saved a record, and nobody
 * here saved this one; `synced_at` is when the calendar was last read, which is
 * a different fact and is the one the cron reports on.
 */
export const syncedEvents = pgTable('synced_events', {
  /** Google's UID, verbatim — `5jbbma4mv3fodj7v1banr43b1o@google.com`. */
  uid: text('uid').primaryKey(),
  heldOn: date('held_on').notNull(),
  title: text('title').notNull(),
  /** `HH:MM`, 24-hour, in the school's own timezone. Null is a whole day. */
  startTime: text('start_time'),
  place: text('place'),
  note: text('note'),
  /** When the calendar this came from was last read successfully. */
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});

/**
 * A family's first question, and the record that it was asked (#25).
 *
 * The row exists because an email is not a store: "check the admin panel" is
 * not a notification, but a spam-filtered lead is a lost family, so the inquiry
 * is written here *and* mailed and neither failure may take the other with it.
 * The application flow (#18 §11) pre-fills from these rows, which is the second
 * reason they are rows.
 *
 * **There is no phone column**, and its absence is the decision the ticket
 * makes most loudly. `ages` is free text and required: families have several
 * children, the school serves a fourteen-year span, and without it every first
 * reply is a question rather than an answer.
 *
 * The four delivery columns are what makes a failed send visible. They are the
 * only thing a second write touches — the family's own words are written once
 * and never updated, so what they asked has one answer for as long as the row
 * exists.
 */
export const inquiries = pgTable('inquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  /** Free text, never a dropdown. "6, 9 and 13" is the normal shape. */
  ages: text('ages').notNull(),
  /** The one optional field. Empty is a real state, not a missing one. */
  message: text('message').notNull().default(''),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  /** When the school was told. Null means it was not — and the admin says so. */
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  /** Why not, in the mailer's own words, for whoever has to fix it. */
  notificationError: text('notification_error'),
  /** When the family's confirmation went. Null means it did not. */
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmationError: text('confirmation_error'),
});

/**
 * A family's application — the thing the whole site is for (#31).
 *
 * **Look at what is not here.** No date of birth, no home address, no
 * allergies, no medical conditions, no evaluation history, no custody
 * arrangement. All six are on the school's live Google Form and all six are
 * deliberately absent: the site collects a name, an age and the classes, and
 * the rest moves to paper signed at enrolment. That absence is what deletes the
 * stricter storage tier rather than building it, and it is a decision about
 * children's data rather than a shortcut — a column added here is the thing a
 * later form field would be added to fill. `store.test.ts` reads
 * `information_schema` back and fails if one appears, and **ADR-0007** is the
 * decision to reopen rather than the assertion to delete.
 *
 * `flagged` is not a rejection. An objection to the Statement of Faith routes
 * the application to a conversation and is recorded beside `statement_version`,
 * so a family's agreement is never silently reinterpreted against a revision
 * they never read.
 *
 * `agreed_terms_id` points at the frozen copy of the money settings written in
 * the same submit — the table built for exactly this in #29 and unused until
 * now.
 */
export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyName: text('family_name').notNull(),
  email: text('email').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  /** Needs a conversation before it is accepted. Never a refusal. */
  flagged: boolean('flagged').notNull().default(false),
  /** The family's own words. Optional, matching the school's live form. */
  objections: text('objections').notNull().default(''),
  /** `sof-xxxxxxxx` — which text of the Statement they were actually shown. */
  statementVersion: text('statement_version').notNull(),
  /**
   * The nine cells as `faith-Father-agree=yes` strings, answered ones only.
   *
   * An array rather than nine columns because it is one grid the form renders
   * as one repeated control, the way `instalment_dates` is one ordered fact —
   * and because an *absent* cell must stay absent: a household with no legal
   * guardian leaves that column blank, and a null column would read as a "no".
   */
  faith: text('faith').array().notNull(),
  /**
   * The Code of Conduct and Handbook agreements as `handbook=yes@3` (#71, #255).
   *
   * **A new column on a table ADR-0007 keeps narrow, and it is argued for
   * rather than assumed.** It is not sensitive data about a student: an
   * agreement is a position a family takes about two documents the school
   * publishes, in the same class of fact as `faith` and `objections`, and it
   * carries nothing about any child's person. `store.test.ts` reads this table
   * back and fails on a column named for anything ADR-0007 excludes — this one
   * is meant to meet that guard and pass it on its merits.
   *
   * One array rather than four columns, for `faith`'s reason: an unanswered
   * question must stay *absent*, where a null column reads as a "no". The
   * version rides in the cell so an agreement is always readable against the
   * text that was on screen — a later upload appends a version and cannot
   * change what this row says was agreed.
   *
   * The cells hold two vocabularies and are not migrated between them: `yes`
   * and `no` since ADR-0020, and the `student`, `parent` and `neither` written
   * before it, which are still read and never rewritten.
   */
  agreements: text('agreements').array().notNull().default([]),
  /** The money terms frozen for this family, when they were recorded. */
  agreedTermsId: uuid('agreed_terms_id').references(() => agreedTerms.id),
  /**
   * Where the application itself is — `application/lifecycle.ts` (#32).
   *
   * One of seven, and **`stale` is deliberately two of them**: a draft nobody
   * finished (`abandoned`) and a submission the site could not accept
   * (`refused`) are different events, and only the second is told about.
   */
  status: text('status').notNull().default('submitted'),
  /**
   * The payment axis, and it is three columns rather than a word inside
   * `status` on purpose.
   *
   * Applied and paid are separate facts about a family: an application is
   * `submitted` while its cheque is awaited, then overdue, then received, and
   * none of that moves the column above. Folding them together would mean
   * inventing "submitted, unpaid" and then needing "enrolled, unpaid" the same
   * afternoon.
   *
   * **`overdue` is never stored here.** It is what the clock says about an
   * awaited cheque past its grace period, computed on read from
   * `payment_since` — so a cheque goes overdue with nobody acting and with no
   * nightly job that can quietly stop running (ADR-0008).
   *
   * `payment_mode` is **what the family said they would do** (#219): a
   * statement of intent, not a receipt. It used to be a deployment-wide
   * constant that put `cheque` on every row; since the Apply page asks, it is
   * their answer, and it is what tells the office whether to watch the post
   * tray. It never moves `payment_status`, which opens `awaiting` in both
   * modes because the site observes no payment in either (ADR-0017).
   */
  paymentMode: text('payment_mode').notNull().default('cheque'),
  paymentStatus: text('payment_status').notNull().default('awaiting'),
  /** When the payment axis last moved. What the grace period is measured from. */
  paymentSince: timestamp('payment_since', { withTimezone: true }),
  /**
   * What became of the two emails, exactly as the inquiries record it.
   *
   * Null `notified_at` is the failure that is invisible everywhere else: the
   * family was correctly told their application arrived, and only this column
   * says nobody at the school was emailed about it.
   */
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  notificationError: text('notification_error'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmationError: text('confirmation_error'),
});

/**
 * One child on one application: a name, an age and the classes (#31).
 *
 * A child table rather than three parallel arrays on the row above, because a
 * child is a thing with fields rather than a position in three lists — and
 * because `offering_keys` is itself a list, which a parallel array cannot hold.
 * `position` keeps the form's own order, so a confirmation lists the children
 * the way the family typed them.
 */
export const applicationChildren = pgTable(
  'application_children',
  {
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    /** The form row this child was typed into, from zero. */
    position: integer('position').notNull(),
    name: text('name').notNull(),
    /** As typed. Free text, because the inquiry's ages are free text. */
    age: text('age').notNull(),
    /** `<slug>:<unit>` keys. Empty is real — a child chosen for nothing yet. */
    offeringKeys: text('offering_keys').array().notNull(),
    /**
     * `<key>=<title>`, frozen at submission and never updated (#259).
     *
     * The classes as the family was shown them, so a course renamed or removed
     * afterwards cannot rewrite what this application says — the same freeze
     * `agreed_terms` is, for the same reason. Empty is a row written before the
     * capture existed, and is deliberately not backfilled.
     */
    offeringTitles: text('offering_titles').array().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.applicationId, table.position] })],
);

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationChildRow = typeof applicationChildren.$inferSelect;
export type InquiryRow = typeof inquiries.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type SchoolYearRow = typeof schoolYear.$inferSelect;
export type SchoolYearTermRow = typeof schoolYearTerms.$inferSelect;
export type SchoolYearClosureRow = typeof schoolYearClosures.$inferSelect;
export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type SyncedEventRow = typeof syncedEvents.$inferSelect;
export type MoneySettingsRow = typeof moneySettings.$inferSelect;
export type AgreedTermsRow = typeof agreedTerms.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type SchoolDetails = typeof schoolDetails.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type PolicyRow = typeof policies.$inferSelect;
export type PolicyVersionRow = typeof policyVersions.$inferSelect;
