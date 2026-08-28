import { desc, eq } from 'drizzle-orm';

import { applicationLinkIsLive } from '../application/link.js';
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
      phone: values.phone,
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
 * chronology. There is no paging and no search: a school this size produces a
 * list Jill can read.
 */
export async function listInquiries(db: Db): Promise<InquiryRow[]> {
  return db.select().from(inquiries).orderBy(desc(inquiries.receivedAt));
}

/**
 * One inquiry, by id — what the application's prefill opens with (#31 AC 1).
 *
 * Undefined for anything that is not a row, **including an id that is not an
 * id**. The id arrives in a link Jill pasted into an email, so the malformed
 * case is not hypothetical: a client that wraps a long URL delivers half a
 * uuid, and Postgres answers a malformed uuid with an error rather than with
 * no rows. Guarding it here rather than at the page keeps "no prefill" a
 * single outcome — the family gets the same clean slate whether they arrived
 * without a link, with a stale one, or with a broken one.
 *
 * **And undefined once the link's 90 days are up** (#317, ADR-0025). The rule
 * lives in this one reader rather than at either sender, so the link the school
 * pastes obeys the same clock as the link the family was emailed: staff cannot
 * mint a link that outlives the window, and do not have to know they can't. An
 * expired id and an unknown one stay deliberately the same answer — telling
 * them apart would be a third state that changes nothing the family does.
 *
 * `now` is a parameter so the tests can stand either side of the boundary.
 */
export async function getInquiry(
  db: Db,
  id: string,
  now = new Date(),
): Promise<InquiryRow | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
  if (!row || !applicationLinkIsLive(row.receivedAt, now)) return undefined;
  return row;
}

/** The shape `gen_random_uuid()` produces, which is the only shape worth querying. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
