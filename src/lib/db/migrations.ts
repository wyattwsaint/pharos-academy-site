/**
 * The schema, as statements.
 *
 * Applied by `npm run db:migrate` against Neon, and automatically against the
 * ephemeral PGlite database the tests and a laptop with no `DATABASE_URL` run
 * on. One list, both drivers, so "it works in the tests" means the same DDL
 * production got.
 *
 * Rules for adding one: append, never edit or reorder — an applied id is
 * recorded in `_migrations` and is never re-run. Each statement must be
 * independently safe to re-run (`if not exists`, `on conflict do nothing`),
 * because a half-applied migration is otherwise unrecoverable without hands on
 * the database.
 */
import {
  SEEDED_ANNOUNCEMENTS,
  type SeedAnnouncement,
} from '../announcements/announcement.js';
import { SEEDED_SCHOOL_YEAR, type Closure, type Term } from '../calendar/year.js';
import { DAY_TRACKS } from '../courses/schedule.js';
import { CATALOGUE } from '../courses/catalogue.js';
import { ENROLMENT_UNITS, type Course } from '../courses/course.js';
import { SEEDED_MONEY_SETTINGS, type MoneySettings } from '../money/settings.js';
import { PEOPLE, seededName, type SeedPerson } from '../people/person.js';
import { SEEDED_POLICIES, type SeedPolicy } from '../policies/policy.js';

export type Migration = {
  /** Stable, unique, ordered by string comparison. */
  id: string;
  /** Executed one at a time, in order. */
  statements: string[];
};

/**
 * The details the school publishes today, lifted from `docs/mirror/`.
 *
 * Seeded rather than left blank so the footer is correct from the first
 * deploy — an empty address rendering as a gap is how a placeholder ships to
 * production. Jill overwrites any of it from the admin.
 */
export const SEEDED_SCHOOL_DETAILS = {
  address: '9 Sherwood Drive\nEnola, PA 17025',
  phone: '717-497-0896',
  email: 'jkilker@enolacog.com',
  // Fall 2026 first class date, Monday track (#18 §9).
  schoolYearStart: '2026-08-31',
  mission:
    'Partnering with parents to provide academic rigor and mentoring, while deepening students’ relationships with Christ, developing a Biblical world view, and pursuing goodness, truth, and beauty in a loving church environment.',
  vision:
    'Preparing students to, “honor Christ the Lord as holy, always being prepared to make a defense for the hope that is within,” (1 Peter 3:15) while loving and impacting the world for God.',
  // The host church's Vanco org, an explicit placeholder for Pharos's own
  // merchant account (#18 §12). Being a value in a row is the point.
  giveUrl: 'https://secure.myvanco.com/YH8R/home',
} as const;

export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001-admin-and-school-details',
    statements: [
      `create table if not exists admin_users (
         id uuid primary key default gen_random_uuid(),
         username text not null unique,
         display_name text not null,
         password_hash text not null,
         created_at timestamptz not null default now()
       )`,
      `create table if not exists admin_sessions (
         token_hash text primary key,
         user_id uuid references admin_users(id) on delete cascade,
         break_glass boolean not null default false,
         created_at timestamptz not null default now(),
         expires_at timestamptz not null
       )`,
      `create index if not exists admin_sessions_user_id_idx on admin_sessions (user_id)`,
      `create table if not exists school_details (
         id integer primary key,
         address text not null,
         phone text not null,
         email text not null,
         school_year_start date not null,
         mission text not null,
         vision text not null,
         give_url text not null,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint school_details_singleton check (id = 1)
       )`,
      `insert into school_details (id, address, phone, email, school_year_start, mission, vision, give_url)
       values (
         1,
         ${literal(SEEDED_SCHOOL_DETAILS.address)},
         ${literal(SEEDED_SCHOOL_DETAILS.phone)},
         ${literal(SEEDED_SCHOOL_DETAILS.email)},
         ${literal(SEEDED_SCHOOL_DETAILS.schoolYearStart)},
         ${literal(SEEDED_SCHOOL_DETAILS.mission)},
         ${literal(SEEDED_SCHOOL_DETAILS.vision)},
         ${literal(SEEDED_SCHOOL_DETAILS.giveUrl)}
       )
       on conflict (id) do nothing`,
    ],
  },
  {
    id: '0002-courses',
    statements: [
      `create table if not exists courses (
         slug text primary key,
         title text not null,
         description text not null,
         stages text[] not null,
         days text[] not null,
         start_time text not null,
         end_time text not null,
         enrolment text not null,
         weeks integer not null,
         dates text[] not null,
         age_label text not null,
         age_min integer,
         age_max integer,
         rate_tier text not null,
         credit text,
         required_text text,
         optional_text text,
         materials_to_buy text,
         materials_fee integer,
         materials_fee_note text,
         assessment_fee integer,
         assessment_fee_note text,
         prerequisites text not null,
         instructor text not null,
         constraint courses_age_range_is_whole check (
           (age_min is null) = (age_max is null) and (age_min is null or age_min <= age_max)
         )
       )`,
      // Note what the check constraint says: a course either publishes a whole
      // numeric range or publishes none. Half a range — a minimum with no
      // maximum — is the shape that would let a course fall out of every age
      // band, which is the failure #22 AC 5 exists to prevent.
      insertCourses(CATALOGUE),
    ],
  },
  {
    /*
     * People, and the catalogue pointing at them instead of at typed names
     * (#26, ADR-0004).
     *
     * 0002 wrote each course's instructor as a string, and by the rule at the
     * top of this file that statement is not edited — it has already run
     * against Neon. So this migration adds the column that replaces it,
     * backfills it by matching those names, and then drops the old one. After
     * it, the only place a person's name exists is the `people` row Jill can
     * edit.
     */
    id: '0003-people',
    statements: [
      `create table if not exists people (
         slug text primary key,
         name text not null,
         role text not null,
         bio text,
         photo text,
         leadership_rank integer,
         last_edited_by text,
         last_edited_at timestamptz
       )`,
      insertPeople(PEOPLE),
      `alter table courses add column if not exists instructor_slug text references people(slug)`,
      /*
       * The backfill, guarded on the old column still being there.
       *
       * Each statement in a migration has to be independently safe to re-run,
       * and this is the one that is not naturally: a run that died between the
       * drop below and recording the migration id would come back to a
       * `courses.instructor` that no longer exists. The guard makes the retry a
       * no-op instead of a wedged database with nobody's hands on it.
       */
      `do $$
       begin
         if exists (
           select 1 from information_schema.columns
           where table_name = 'courses' and column_name = 'instructor'
         ) then
           update courses set instructor_slug = mapping.slug
           from (values ${nameToSlugPairs(PEOPLE)}) as mapping(name, slug)
           where courses.instructor_slug is null and courses.instructor = mapping.name;
         end if;
       end $$`,
      `alter table courses alter column instructor_slug set not null`,
      `alter table courses drop column if exists instructor`,
    ],
  },
  {
    /*
     * Announcements (#27).
     *
     * Note what is *not* here: no board-update column, no "is pinned" flag, no
     * second table for the file. A board update is a row with a PDF attached,
     * so the slot that reads as stale by October has nowhere to come back.
     *
     * The two check constraints say the same thing twice about two different
     * pairs: a link is a URL *and* a name for it, and an attachment is a
     * filename *and* its bytes. Half of either is the shape that renders as a
     * link with no text or a download button that serves nothing.
     */
    id: '0004-announcements',
    statements: [
      `create table if not exists announcements (
         slug text primary key,
         headline text not null,
         body text not null,
         posted_on date not null,
         link_url text,
         link_label text,
         attachment_filename text,
         attachment_bytes bytea,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint announcements_link_is_whole check ((link_url is null) = (link_label is null)),
         constraint announcements_attachment_is_whole
           check ((attachment_filename is null) = (attachment_bytes is null))
       )`,
      insertAnnouncements(SEEDED_ANNOUNCEMENTS),
    ],
  },
  {
    /*
     * Policy documents, and every version of every one of them (#28).
     *
     * The version table is append-only and the composite key says so: a second
     * upload is `(slug, 2)`, not an update of `(slug, 1)`. There is no
     * `on delete` path that a policy row could take without taking its
     * versions with it, which is the only deletion this schema allows at all.
     *
     * `policies_current_is_whole` is the same shape of check as the
     * announcements' attachment one: a policy either has a current version —
     * number, filename and the date it was uploaded — or has none of the three.
     * Two of three is a policies page linking a download that is not there.
     */
    id: '0005-policies',
    statements: [
      `create table if not exists policies (
         slug text primary key,
         title text not null,
         description text not null default '',
         position integer not null,
         signed boolean not null default false,
         current_version integer,
         current_filename text,
         updated_at timestamptz,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint policies_current_is_whole check (
           (current_version is null) = (current_filename is null)
           and (current_version is null) = (updated_at is null)
         )
       )`,
      `create table if not exists policy_versions (
         policy_slug text not null references policies(slug) on delete cascade,
         version integer not null,
         filename text not null,
         bytes bytea not null,
         uploaded_at timestamptz not null default now(),
         uploaded_by text,
         primary key (policy_slug, version)
       )`,
      insertPolicies(SEEDED_POLICIES),
    ],
  },
  {
    /*
     * Money settings, and the terms a family agreed to (#29).
     *
     * Two tables that hold the same columns, and the duplication is the whole
     * decision (ADR-0006). `agreed_terms` copies the numbers rather than
     * pointing at the settings row, so a fee corrected in October cannot reach
     * back and change what an August family agreed to pay.
     *
     * The singleton check is the same shape as `school_details`': there is one
     * school, and there is one set of numbers it charges.
     */
    id: '0006-money-settings',
    statements: [
      `create table if not exists money_settings (
         id integer primary key,
         standard_rate integer not null,
         high_school_credit_rate integer not null,
         registration_fee integer not null,
         class_deposit integer not null,
         late_fee integer not null,
         study_hall_fee integer not null,
         instalment_dates text[] not null,
         refund_terms text not null,
         deposit_credited_against_tuition boolean not null default true,
         notification_addresses text[] not null,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint money_settings_singleton check (id = 1),
         constraint money_settings_amounts_are_sane check (
           standard_rate > 0 and high_school_credit_rate > 0
           and registration_fee >= 0 and class_deposit >= 0
           and late_fee >= 0 and study_hall_fee >= 0
         ),
         constraint money_settings_four_instalments
           check (array_length(instalment_dates, 1) = ${SEEDED_MONEY_SETTINGS.instalmentDates.length}),
         constraint money_settings_has_a_recipient
           check (array_length(notification_addresses, 1) >= 1)
       )`,
      insertMoneySettings(SEEDED_MONEY_SETTINGS),
      `create table if not exists agreed_terms (
         id uuid primary key default gen_random_uuid(),
         family_name text not null,
         agreed_at timestamptz not null default now(),
         standard_rate integer not null,
         high_school_credit_rate integer not null,
         registration_fee integer not null,
         class_deposit integer not null,
         late_fee integer not null,
         study_hall_fee integer not null,
         instalment_dates text[] not null,
         refund_terms text not null,
         deposit_credited_against_tuition boolean not null,
         notification_addresses text[] not null
       )`,
    ],
  },
  {
    /*
     * The school year, and the one-off events beside it (#23).
     *
     * Three tables for the year rather than one wide row, and the shape is the
     * ticket: a term is one track's own start date and week count, a closure is
     * a date with no track at all, and the 112 meeting dates are computed from
     * the two (`calendar/year.ts`). A stored list of dates would be the five
     * hand-made PDFs again, in a database.
     *
     * Seeded with the 2026–27 year the school has already published, like the
     * courses and the policies are — with the two corrections its own sheets
     * need, both recorded beside the data in `calendar/year.ts`.
     */
    id: '0007-school-year-and-events',
    statements: [
      `create table if not exists school_year (
         id integer primary key,
         label text not null,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint school_year_singleton check (id = 1)
       )`,
      `create table if not exists school_year_terms (
         semester text not null,
         track text not null,
         first_class_date date not null,
         weeks integer not null,
         primary key (semester, track),
         constraint school_year_terms_semester check (semester in ('fall', 'spring')),
         constraint school_year_terms_track
           check (track in (${DAY_TRACKS.map(literal).join(', ')})),
         constraint school_year_terms_has_weeks check (weeks >= 1)
       )`,
      `create table if not exists school_year_closures (
         closed_on date primary key,
         label text not null,
         constraint school_year_closures_is_named check (length(trim(label)) > 0)
       )`,
      `create table if not exists calendar_events (
         slug text primary key,
         held_on date not null,
         title text not null,
         start_time text,
         place text,
         note text,
         last_edited_by text,
         last_edited_at timestamptz,
         constraint calendar_events_time_is_a_time
           check (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$')
       )`,
      `insert into school_year (id, label) values (1, ${literal(SEEDED_SCHOOL_YEAR.label)})
       on conflict (id) do nothing`,
      insertTerms(SEEDED_SCHOOL_YEAR.terms),
      insertClosures(SEEDED_SCHOOL_YEAR.closures),
    ],
  },
  {
    /*
     * The course editor (#24): the ticked enrolment units, and the stamp.
     *
     * `enrolment_units` is what a family may actually buy, as distinct from the
     * existing `enrolment` — the course's *shape*, which drives pricing and the
     * duration line. The backfill is deliberately conservative: every course
     * starts purchasable only as its own shape, so the nine year courses that
     * publish a semester price get `['year']` until Jill ticks the semesters
     * herself. Admin data, not inference — the site must not guess a $420
     * offering into existence.
     *
     * The stamp columns arrive here because this is the migration that makes
     * courses editable at all; before it, every row was the seed's.
     */
    id: '0008-course-editor',
    statements: [
      `alter table courses add column if not exists enrolment_units text[]`,
      `update courses set enrolment_units = array[enrolment] where enrolment_units is null`,
      `alter table courses alter column enrolment_units set not null`,
      /*
       * Guarded the way 0003's backfill is: `add constraint` has no
       * `if not exists`, and each statement must survive a re-run.
       */
      `do $$
       begin
         if not exists (
           select 1 from pg_constraint where conname = 'courses_enrolment_units_are_units'
         ) then
           -- cardinality, not array_length: array_length('{}', 1) is null, and
           -- a null check passes — the empty list would slip straight through.
           alter table courses add constraint courses_enrolment_units_are_units check (
             enrolment_units <@ array[${ENROLMENT_UNITS.map(literal).join(', ')}]::text[]
             and cardinality(enrolment_units) >= 1
           );
         end if;
       end $$`,
      `alter table courses add column if not exists last_edited_by text`,
      `alter table courses add column if not exists last_edited_at timestamptz`,
    ],
  },
];

/** The eight terms of the published year, idempotent like every other seed. */
function insertTerms(terms: readonly Term[]): string {
  const values = terms
    .map(
      (term) =>
        `(${[
          literal(term.semester),
          literal(term.track),
          literal(term.firstClassDate),
          String(term.weeks),
        ].join(', ')})`,
    )
    .join(', ');

  return `insert into school_year_terms (semester, track, first_class_date, weeks)
    values ${values}
    on conflict (semester, track) do nothing`;
}

/** The days the school is closed, as published — see `calendar/year.ts`. */
function insertClosures(closures: readonly Closure[]): string {
  const values = closures
    .map((closure) => `(${literal(closure.date)}, ${literal(closure.label)})`)
    .join(', ');

  return `insert into school_year_closures (closed_on, label)
    values ${values}
    on conflict (closed_on) do nothing`;
}

/** The school's own figures, seeded like everything else it already publishes. */
function insertMoneySettings(settings: MoneySettings): string {
  return `insert into money_settings (
      id, standard_rate, high_school_credit_rate, registration_fee, class_deposit,
      late_fee, study_hall_fee, instalment_dates, refund_terms,
      deposit_credited_against_tuition, notification_addresses
    ) values (
      1,
      ${settings.rates.standard},
      ${settings.rates.highSchoolCredit},
      ${settings.registrationFee},
      ${settings.classDeposit},
      ${settings.lateFee},
      ${settings.studyHallFee},
      ${textArray(settings.instalmentDates)},
      ${literal(settings.refundTerms)},
      ${settings.depositCreditedAgainstTuition},
      ${textArray(settings.notificationAddresses)}
    )
    on conflict (id) do nothing`;
}

/**
 * The four published policies, seeded without their files.
 *
 * Bytes stay out of the migration for the same reason the board update's do:
 * 564 KB of base64 across four documents would be read into memory on every
 * cold start of the server bundle. `npm run db:seed` attaches them from
 * `docs/mirror/pdf/`, which is where the school's own published PDFs already
 * are, and does it as version 1 with a real upload date.
 *
 * Until it runs, the four rows exist and the policies page shows none of them
 * — a policy is published by its file, not by its row (`publishedPolicies`).
 */
function insertPolicies(list: readonly SeedPolicy[]): string {
  const values = list
    .map(
      (policy) =>
        `(${[
          literal(policy.slug),
          literal(policy.title),
          literal(policy.description),
          String(policy.position),
          policy.signed ? 'true' : 'false',
        ].join(', ')})`,
    )
    .join(', ');

  return `insert into policies (slug, title, description, position, signed)
    values ${values}
    on conflict (slug) do nothing`;
}

/**
 * The school's own six, seeded like the courses and the people are.
 *
 * Without bytes. The board update's PDF is 105 KB and would be a base64 blob in
 * the server bundle read on every cold start; `npm run db:seed` attaches it
 * from `docs/mirror/`, on a machine where that directory exists.
 */
function insertAnnouncements(list: readonly SeedAnnouncement[]): string {
  const values = list
    .map(
      (announcement) =>
        `(${[
          literal(announcement.slug),
          literal(announcement.headline),
          literal(announcement.body),
          literal(announcement.postedOn),
          nullable(announcement.linkUrl),
          nullable(announcement.linkLabel),
        ].join(', ')})`,
    )
    .join(', ');

  return `insert into announcements (slug, headline, body, posted_on, link_url, link_label)
    values ${values}
    on conflict (slug) do nothing`;
}

/** Every person as one idempotent insert, for the same reason the courses are. */
function insertPeople(people: readonly SeedPerson[]): string {
  const values = people
    .map(
      (person) =>
        `(${[
          literal(person.slug),
          literal(person.name),
          literal(person.role),
          nullable(person.bio),
          nullable(person.photo),
          number(person.leadershipRank),
        ].join(', ')})`,
    )
    .join(', ');

  return `insert into people (slug, name, role, bio, photo, leadership_rank)
    values ${values}
    on conflict (slug) do nothing`;
}

/** `('Mrs. Mandy Saint', 'mandy-saint'), …` — the backfill's lookup table. */
function nameToSlugPairs(people: readonly SeedPerson[]): string {
  return people.map((person) => `(${literal(person.name)}, ${literal(person.slug)})`).join(', ');
}

/**
 * The whole catalogue as one idempotent insert.
 *
 * Generated from `CATALOGUE` rather than written out as SQL: the seed is
 * authored TypeScript that the tests check against the capture of the live
 * site, and a hand-written copy of it in this file would be a nineteen-course
 * transcription nobody would ever diff again.
 *
 * One statement rather than nineteen because this runs against a fresh
 * in-process PGlite for **every** integration test — nineteen round trips per
 * test is a slow suite bought for nothing.
 *
 * `on conflict do nothing`, like every other statement here, so re-running the
 * migration cannot overwrite an edit made to the store.
 */
function insertCourses(courses: readonly Course[]): string {
  return `insert into courses (
      slug, title, description, stages, days, start_time, end_time, enrolment, weeks, dates,
      age_label, age_min, age_max, rate_tier, credit, required_text, optional_text,
      materials_to_buy, materials_fee, materials_fee_note, assessment_fee, assessment_fee_note,
      prerequisites, instructor
    ) values ${courses.map(courseValues).join(', ')}
    on conflict (slug) do nothing`;
}

/** One course as a `values` row, in the column order above. */
function courseValues(course: Course): string {
  const values = [
    literal(course.slug),
    literal(course.title),
    literal(course.description),
    textArray(course.stages),
    textArray(course.days),
    literal(course.start),
    literal(course.end),
    literal(course.enrolment),
    String(course.weeks),
    textArray(course.dates),
    literal(course.ageLabel),
    number(course.ageMin),
    number(course.ageMax),
    literal(course.rateTier),
    nullable(course.credit),
    nullable(course.requiredText),
    nullable(course.optionalText),
    nullable(course.materialsToBuy),
    number(course.materialsFee),
    nullable(course.materialsFeeNote),
    number(course.assessmentFee),
    nullable(course.assessmentFeeNote),
    literal(course.prerequisites),
    /*
     * The name, not the slug — 0002 created an `instructor text` column and
     * this generates the statement that fills it. The catalogue moved to slugs
     * in #26; the seed's own name table is what turns one back into the other,
     * so the SQL 0002 produces is byte-for-byte what Neon already applied.
     * 0003 replaces the column a moment later.
     */
    literal(seededName(course.instructorSlug)),
  ];

  return `(${values.join(', ')})`;
}

/** A single-quoted SQL string literal. Only ever called on constants above. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function nullable(value: string | null): string {
  return value === null ? 'null' : literal(value);
}

function number(value: number | null): string {
  return value === null ? 'null' : String(value);
}

function textArray(values: readonly string[]): string {
  return values.length === 0 ? `array[]::text[]` : `array[${values.map(literal).join(', ')}]::text[]`;
}

/** The bookkeeping table the runner uses to decide what still needs applying. */
export const MIGRATIONS_TABLE_DDL = `create table if not exists _migrations (
  id text primary key,
  applied_at timestamptz not null default now()
)`;
