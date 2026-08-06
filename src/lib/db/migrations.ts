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
import { CATALOGUE } from '../courses/catalogue.js';
import type { Course } from '../courses/course.js';
import { PEOPLE, seededName, type SeedPerson } from '../people/person.js';

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
];

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
