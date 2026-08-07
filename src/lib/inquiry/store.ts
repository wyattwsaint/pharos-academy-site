import { desc, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { inquiries, type InquiryRow } from '../db/schema.js';
import type { InquiryFields, InquiryOutcome } from './inquiry.js';

/**
 * The inquiries, as rows (#25).
 *
 * Two writers and one reader, and the split is the ticket. `createInquiry` is
 * the *record* — what a family typed, written before anything is emailed, so a
 * refused send cannot take the lead with it. `recordInquiryDelivery` writes
 * back what happened to the two emails, which is what makes a failed
 * notification visible on the admin screen instead of only in a log nobody
 * reads.
 *
 * Nothing here updates the family's own words. The delivery columns are the
 * only thing a second write touches, so "what did they actually ask?" has one
 * answer for as long as the row exists.
 */

/** Write the inquiry down. Answers with the row's id, which is the receipt. */
export async function createInquiry(db: Db, values: InquiryFields, now = new Date()): Promise<string> {
  const [row] = await db
    .insert(inquiries)
    .values({
      name: values.name,
      email: values.email,
      ages: values.ages,
      message: values.message,
      receivedAt: now,
    })
    .returning();

  if (!row) throw new Error('The inquiry was not written down.');
  return row.id;
}

/**
 * Stamp the row with what became of the two emails.
 *
 * Deliberately swallows its own failure. It runs *after* the inquiry is
 * already safe, and throwing here would turn "the notification did not send"
 * into "the parent was told their question was lost" — the strictly worse of
 * the two, over bookkeeping.
 */
export async function recordInquiryDelivery(
  db: Db,
  id: string,
  outcome: Pick<
    InquiryOutcome,
    'notified' | 'notificationError' | 'confirmed' | 'confirmationError'
  >,
  now = new Date(),
): Promise<void> {
  try {
    await db
      .update(inquiries)
      .set({
        notifiedAt: outcome.notified ? now : null,
        notificationError: outcome.notificationError ?? null,
        confirmedAt: outcome.confirmed ? now : null,
        confirmationError: outcome.confirmationError ?? null,
      })
      .where(eq(inquiries.id, id));
  } catch {
    // Nothing to do and nothing to say to the parent: the inquiry is stored and
    // the emails have already gone or already failed.
  }
}

/**
 * Every inquiry, newest first.
 *
 * Newest first because this list is read to answer today's families, not to
 * study last term's — the opposite of the announcements list, which is a
 * chronology. There is no paging and no search: nineteen classes' worth of
 * school produces a list Jill can read.
 */
export async function listInquiries(db: Db): Promise<InquiryRow[]> {
  return db.select().from(inquiries).orderBy(desc(inquiries.receivedAt));
}
