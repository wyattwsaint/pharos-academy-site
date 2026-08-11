import { desc, eq } from 'drizzle-orm';

import { announcements as announcementsTable, type AnnouncementRow } from '../db/schema.js';
import type { Db } from '../db/client.js';
import type { Announcement } from './announcement.js';

/**
 * The one list of announcements, read and written (#27).
 *
 * Every surface — the news page, the admin, the support page's "most recent" —
 * comes through here and gets the whole list, so filtering is a decision each
 * surface makes over one query rather than three queries drifting apart.
 *
 * **The bytes are separate.** `listAnnouncements` never selects
 * `attachment_bytes`: a news page listing a term's worth of notices would
 * otherwise pull every attached PDF through memory to print a filename.
 * `getAttachment` is the one function that reads them, and the one route that
 * serves them is its only caller.
 */

/** The columns that are not the file. Named once; both list and get select them. */
const WITHOUT_BYTES = {
  slug: announcementsTable.slug,
  headline: announcementsTable.headline,
  body: announcementsTable.body,
  postedOn: announcementsTable.postedOn,
  linkUrl: announcementsTable.linkUrl,
  linkLabel: announcementsTable.linkLabel,
  attachmentFilename: announcementsTable.attachmentFilename,
  lastEditedBy: announcementsTable.lastEditedBy,
  lastEditedAt: announcementsTable.lastEditedAt,
} as const;

/**
 * Everything the school has announced, newest first.
 *
 * Unlike `listPeople`, an empty list is not refused. A school with no staff is a
 * broken deployment; a school with nothing to announce is an ordinary Tuesday,
 * and the news page says so in a sentence.
 *
 * The slug is the tiebreaker because it begins with the date and the rest of it
 * is the headline, so two notices posted the same day come back in a stable
 * order rather than in whichever order Postgres felt like.
 */
export async function listAnnouncements(db: Db): Promise<Announcement[]> {
  const rows = await db
    .select(WITHOUT_BYTES)
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.postedOn), desc(announcementsTable.slug));
  return rows.map(toAnnouncement);
}

/** One announcement, or undefined — which the admin and the news page 404 on. */
export async function getAnnouncement(db: Db, slug: string): Promise<Announcement | undefined> {
  const rows = await db
    .select(WITHOUT_BYTES)
    .from(announcementsTable)
    .where(eq(announcementsTable.slug, slug))
    .limit(1);
  const row = rows[0];
  return row ? toAnnouncement(row) : undefined;
}

/** A PDF and what it is called. Both, always — the table has a check that says so. */
export type Attachment = {
  filename: string;
  bytes: Buffer;
};

/**
 * The attached file, or undefined when there is none.
 *
 * The only read of `attachment_bytes` in the codebase, called by the only route
 * that serves them.
 */
export async function getAttachment(db: Db, slug: string): Promise<Attachment | undefined> {
  const rows = await db
    .select({
      filename: announcementsTable.attachmentFilename,
      bytes: announcementsTable.attachmentBytes,
    })
    .from(announcementsTable)
    .where(eq(announcementsTable.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row || row.filename === null || row.bytes === null) return undefined;
  return { filename: row.filename, bytes: row.bytes };
}

/**
 * What a save may change. The slug is the key and is not one of them.
 *
 * `attachment` is three-valued on purpose, and the third value is the point:
 * **absent** means leave the file alone, `null` means take it down, and an
 * `Attachment` means replace it. A form that posts no file is the ordinary case
 * — Jill fixing a headline — and a two-valued field would silently delete the
 * PDF every time she did.
 */
export type AnnouncementEdit = {
  headline: string;
  body: string;
  postedOn: string;
  linkUrl: string | null;
  linkLabel: string | null;
  attachment?: Attachment | null;
};

/** A new announcement, with its address. */
export type AnnouncementDraft = AnnouncementEdit & { slug: string };

/**
 * Save an announcement and stamp it.
 *
 * The stamp is overwritten rather than appended, like every other editable
 * record (CONTEXT.md). It is deliberately not `postedOn`: correcting a typo in
 * August must not make a July notice current again.
 */
export async function saveAnnouncement(
  db: Db,
  slug: string,
  edit: AnnouncementEdit,
  editorName: string,
  now = new Date(),
): Promise<Announcement> {
  const [row] = await db
    .update(announcementsTable)
    .set({ ...columnsOf(edit), lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(announcementsTable.slug, slug))
    .returning(WITHOUT_BYTES);

  if (!row) throw new Error(`No announcement with the slug "${slug}".`);
  return toAnnouncement(row);
}

/**
 * Post something new.
 *
 * Stamped on creation as well as on save, for the same reason a person is: the
 * one record showing "Not edited yet" would be the record somebody asks about.
 */
export async function createAnnouncement(
  db: Db,
  draft: AnnouncementDraft,
  editorName: string,
  now = new Date(),
): Promise<Announcement> {
  const { slug, ...edit } = draft;
  const [row] = await db
    .insert(announcementsTable)
    // An insert that does not mention the file simply omits both columns, which
    // is the null a new announcement with no PDF wants — so the three-valued
    // `attachment` needs no second reading here.
    .values({ slug, ...columnsOf(edit), lastEditedBy: editorName, lastEditedAt: now })
    .returning(WITHOUT_BYTES);

  if (!row) throw new Error(`Could not post an announcement at "${slug}".`);
  return toAnnouncement(row);
}

/**
 * The edit as columns — with the file included only when the caller mentioned
 * it, so an untouched attachment is untouched.
 */
function columnsOf(edit: AnnouncementEdit) {
  const columns = {
    headline: edit.headline,
    body: edit.body,
    postedOn: edit.postedOn,
    linkUrl: edit.linkUrl,
    linkLabel: edit.linkLabel,
  };

  if (!('attachment' in edit)) return columns;
  return {
    ...columns,
    attachmentFilename: edit.attachment?.filename ?? null,
    attachmentBytes: edit.attachment?.bytes ?? null,
  };
}

/**
 * The row as the vocabulary has it.
 *
 * Written out rather than passed through, like the people store's, so a column
 * added for storage reasons does not silently become part of the domain type —
 * and so `attachmentBytes` cannot arrive on an `Announcement` by accident.
 */
function toAnnouncement(row: Omit<AnnouncementRow, 'attachmentBytes'>): Announcement {
  return {
    slug: row.slug,
    headline: row.headline,
    body: row.body,
    postedOn: row.postedOn,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    attachmentFilename: row.attachmentFilename,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
