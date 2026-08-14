import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { courses as coursesTable, type CourseRow } from '../db/schema.js';
import type { Course, EnrolmentUnit, RateTier, Stage } from './course.js';

/**
 * The catalogue, read.
 *
 * Every public surface goes through here, which is the point of #22: By Age, By
 * Day, the full descriptions and each class's own page all render the same
 * nineteen rows, so they cannot disagree with one another the way the live
 * site's nine artefacts do.
 *
 * The row and the domain type are close but not identical — the row is columns,
 * the domain type is the vocabulary — so the mapping is written once, here, and
 * nothing outside this module handles a `CourseRow`.
 */

/**
 * Every course, alphabetically by title.
 *
 * An empty catalogue is treated as a broken deployment rather than as a school
 * with no classes, for the same reason `getSchoolDetails` refuses a missing
 * row: the migration seeds all nineteen, so "none" means the migration has not
 * been run against this database — and a `/classes` page rendering four empty
 * surfaces is how that ships to production and is discovered by a parent.
 */
export async function listCourses(db: Db): Promise<Course[]> {
  const rows = await listCoursesForAdmin(db);
  if (rows.length === 0) {
    throw new Error('The course catalog is empty — run `npm run db:migrate`.');
  }
  return rows;
}

/**
 * The same catalogue with the guard left off, for the admin list alone (#197).
 *
 * The admin Classes screen is where an empty catalogue is *reported* — "this
 * database has not been set up" — rather than shipped to a parent, so it has to
 * render "none" instead of failing the way the public surfaces must.
 */
export async function listCoursesForAdmin(db: Db): Promise<Course[]> {
  const rows = await db.select().from(coursesTable);
  return rows.map(toCourse).sort((a, b) => a.title.localeCompare(b.title));
}

/** One course by its URL segment, or undefined — which the page turns into a 404. */
export async function getCourse(db: Db, slug: string): Promise<Course | undefined> {
  const rows = await db.select().from(coursesTable).where(eq(coursesTable.slug, slug)).limit(1);
  const row = rows[0];
  return row ? toCourse(row) : undefined;
}

/** What a save may change. The slug is the key and the stamp is the store's. */
export type CourseEdit = Omit<Course, 'slug' | 'lastEditedBy' | 'lastEditedAt'>;

/**
 * Save a course and stamp it.
 *
 * The stamp is overwritten rather than appended, like every other editable
 * record (CONTEXT.md): "who last edited this" is the question the school asks,
 * and permissions are flat, so attribution is the control.
 */
export async function saveCourse(
  db: Db,
  slug: string,
  edit: CourseEdit,
  editorName: string,
  now = new Date(),
): Promise<Course> {
  const [row] = await db
    .update(coursesTable)
    .set({ ...toRow(edit), lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(coursesTable.slug, slug))
    .returning();

  if (!row) throw new Error(`No course with the slug "${slug}".`);
  return toCourse(row);
}

/**
 * Add a course the school now offers.
 *
 * Stamped on creation as well as on save, for the reason `createPerson` is:
 * a record with no attribution is the record somebody would ask about.
 */
export async function createCourse(
  db: Db,
  slug: string,
  edit: CourseEdit,
  editorName: string,
  now = new Date(),
): Promise<Course> {
  const [row] = await db
    .insert(coursesTable)
    .values({ slug, ...toRow(edit), lastEditedBy: editorName, lastEditedAt: now })
    .returning();

  if (!row) throw new Error(`Could not add a course with the slug "${slug}".`);
  return toCourse(row);
}

/** The edit as columns — the one place `start`/`end` meet `start_time`/`end_time`. */
function toRow(edit: CourseEdit): Omit<typeof coursesTable.$inferInsert, 'slug'> {
  return {
    title: edit.title,
    description: edit.description,
    stages: [...edit.stages],
    days: [...edit.days],
    startTime: edit.start,
    endTime: edit.end,
    enrolment: edit.enrolment,
    enrolmentUnits: [...edit.enrolmentUnits],
    weeks: edit.weeks,
    dates: [...edit.dates],
    ageLabel: edit.ageLabel,
    ageMin: edit.ageMin,
    ageMax: edit.ageMax,
    rateTier: edit.rateTier,
    credit: edit.credit,
    requiredText: edit.requiredText,
    optionalText: edit.optionalText,
    materialsToBuy: edit.materialsToBuy,
    materialsFee: edit.materialsFee,
    materialsFeeNote: edit.materialsFeeNote,
    assessmentFee: edit.assessmentFee,
    assessmentFeeNote: edit.assessmentFeeNote,
    prerequisites: edit.prerequisites,
    instructorSlug: edit.instructorSlug,
  };
}

function toCourse(row: CourseRow): Course {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    stages: row.stages as Stage[],
    days: row.days as Course['days'],
    start: row.startTime,
    end: row.endTime,
    enrolment: row.enrolment as EnrolmentUnit,
    enrolmentUnits: row.enrolmentUnits as EnrolmentUnit[],
    weeks: row.weeks,
    dates: row.dates,
    ageLabel: row.ageLabel,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    rateTier: row.rateTier as RateTier,
    credit: row.credit,
    requiredText: row.requiredText,
    optionalText: row.optionalText,
    materialsToBuy: row.materialsToBuy,
    materialsFee: row.materialsFee,
    materialsFeeNote: row.materialsFeeNote,
    assessmentFee: row.assessmentFee,
    assessmentFeeNote: row.assessmentFeeNote,
    prerequisites: row.prerequisites,
    instructorSlug: row.instructorSlug,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
