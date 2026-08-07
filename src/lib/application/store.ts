import { asc, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { applicationChildren, applications, type ApplicationRow } from '../db/schema.js';
import type { ApplicationChild, ApplicationFields, FaithAnswer, FaithAnswers } from './application.js';
import {
  APPLICATION_STATES,
  RECORDED_PAYMENT_STATUSES,
  PAYMENT_MODES,
  nextApplicationState,
  nextPayment,
  paymentOnSubmission,
  type ApplicationEvent,
  type ApplicationState,
  type Payment,
  type PaymentEvent,
  type PaymentMode,
  type RecordedPaymentStatus,
} from './lifecycle.js';

/**
 * The applications, as rows (#31).
 *
 * One writer and one reader. The writer takes the family's own words and, with
 * them, two facts the parser cannot know: **which text of the Statement of
 * Faith they were shown**, and the id of the money terms frozen for them in the
 * same submit. Both exist so that nothing the school changes later can rewrite
 * what this family actually agreed to — the same construction `agreed_terms`
 * uses, for the same reason (ADR-0006).
 *
 * `flagged` travels in rather than being recomputed here. It is
 * `isFlagged(values)` at the moment of submission, and a row that recomputed it
 * on read would change its own meaning the day somebody edited the rule.
 *
 * **Nothing here rewrites what a family sent.** The three writers that came
 * with #32 move the two axes and record what became of the emails, and that is
 * the whole of what a second write may touch: the family's own words, their
 * children and their choices are written once and are the record of what they
 * asked for. An application is answered in a conversation, not by editing it.
 */

/** What was recorded, as the admin and the confirmation read it back. */
export type ApplicationRecord = {
  id: string;
  familyName: string;
  email: string;
  receivedAt: Date;
  flagged: boolean;
  objections: string;
  statementVersion: string;
  faith: FaithAnswers;
  children: ApplicationChild[];
  agreedTermsId: string | null;
  /** Where the application itself is (#32). Never moved by the payment. */
  state: ApplicationState;
  /** Where the money is. Never moves the state. `overdue` is read, not stored. */
  payment: Payment;
  /** When the school was told. Null means it was not — and the admin says so. */
  notifiedAt: Date | null;
  notificationError: string | null;
  /** When the family was written to, with a confirmation or a refusal notice. */
  confirmedAt: Date | null;
  confirmationError: string | null;
};

/**
 * What the submit knows that the form does not.
 *
 * Not a **stamp** (CONTEXT.md): a stamp is the "last edited by" line an
 * editable record carries, and an application is never edited — the school
 * answers it in a conversation. These are facts true at submission and never
 * again, which is the opposite property.
 */
export type SubmissionFacts = {
  /** `statementVersion()` as the page rendered it, not as it is read back. */
  statementVersion: string;
  /** `isFlagged(values)`, decided at submission. */
  flagged?: boolean;
  /** The frozen money terms, when `recordAgreedTerms` got that far. */
  agreedTermsId?: string | null;
};

/** Write the application down. Answers with the row's id, which is the receipt. */
export async function createApplication(
  db: Db,
  values: ApplicationFields,
  facts: SubmissionFacts,
  now = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(applications)
    .values({
      familyName: values.familyName,
      email: values.email,
      receivedAt: now,
      flagged: facts.flagged ?? false,
      objections: values.objections,
      statementVersion: facts.statementVersion,
      faith: encodeFaith(values.faith),
      agreedTermsId: facts.agreedTermsId ?? null,
      /*
       * Submitted, and awaiting whatever the payment slot takes today (#32).
       * The mode is read from `paymentOnSubmission` rather than typed here, so
       * the Vanco stage flips one constant and this row starts `paid online`
       * with nothing else in the codebase moving.
       */
      status: 'submitted' satisfies ApplicationState,
      ...paymentColumns(paymentOnSubmission(now)),
    })
    .returning();

  if (!row) throw new Error('The application was not written down.');

  if (values.children.length > 0) {
    await db.insert(applicationChildren).values(
      values.children.map((child, position) => ({
        applicationId: row.id,
        position,
        name: child.name,
        age: child.age,
        offeringKeys: child.offeringKeys,
      })),
    );
  }

  return row.id;
}

/**
 * Every application, newest first, children attached.
 *
 * Newest first for the reason the inquiries are: this list is read to answer
 * today's families. Two queries rather than a join, because a join over a
 * one-to-many returns the parent once per child and the reassembly is the same
 * work with a wider result set.
 */
export async function listApplications(db: Db): Promise<ApplicationRecord[]> {
  const rows = await db.select().from(applications).orderBy(desc(applications.receivedAt));
  if (rows.length === 0) return [];

  const children = await db
    .select()
    .from(applicationChildren)
    .where(
      inArray(
        applicationChildren.applicationId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(applicationChildren.position));

  return rows.map((row) => ({
    ...toRecord(row),
    children: children
      .filter((child) => child.applicationId === row.id)
      .map((child) => ({ name: child.name, age: child.age, offeringKeys: child.offeringKeys })),
  }));
}

/**
 * Move the application, and only the application (#32 AC 2).
 *
 * It writes one column. There is no payment argument, no payment default and
 * nothing in the update that could reach the money side — which is the reason
 * the two axes cannot be moved together by accident rather than a promise that
 * nobody will.
 *
 * Null when the move does not exist from where the application is standing: a
 * second click on "Enrol" is an ordinary thing for a person to do.
 */
export async function moveApplication(
  db: Db,
  id: string,
  event: ApplicationEvent,
): Promise<ApplicationState | null> {
  const row = await getApplicationRow(db, id);
  if (!row) return null;

  const state = nextApplicationState(applicationState(row.status), event);
  if (!state) return null;

  await db.update(applications).set({ status: state }).where(eq(applications.id, id));
  return state;
}

/**
 * Move the money, and only the money (#32 AC 2).
 *
 * The mirror of `moveApplication`, and deliberately as narrow: three columns,
 * none of them `status`. `since` is restamped on every move, which is what
 * gives a re-expected cheque its own grace period rather than making it overdue
 * the instant it is asked for again.
 */
export async function moveApplicationPayment(
  db: Db,
  id: string,
  event: PaymentEvent,
  now = new Date(),
): Promise<Payment | null> {
  const row = await getApplicationRow(db, id);
  if (!row) return null;

  const payment = nextPayment(paymentOf(row), event, now);
  if (!payment) return null;

  await db.update(applications).set(paymentColumns(payment)).where(eq(applications.id, id));
  return payment;
}

/**
 * Stamp the row with what became of the two emails.
 *
 * Swallows its own failure, exactly as the inquiry's does and for the same
 * reason: it runs after the application is already safe, and throwing here
 * would turn "the notification did not send" into "the family was told their
 * application was lost".
 */
export async function recordApplicationDelivery(
  db: Db,
  id: string,
  outcome: {
    notified: boolean;
    notificationError?: string;
    confirmed: boolean;
    confirmationError?: string;
  },
  now = new Date(),
): Promise<void> {
  try {
    await db
      .update(applications)
      .set({
        notifiedAt: outcome.notified ? now : null,
        notificationError: outcome.notificationError ?? null,
        confirmedAt: outcome.confirmed ? now : null,
        confirmationError: outcome.confirmationError ?? null,
      })
      .where(eq(applications.id, id));
  } catch {
    // Nothing to do and nothing to say: the application is stored and the
    // emails have already gone or already failed.
  }
}

/**
 * One application, children attached.
 *
 * The admin lists rather than drills in — an application is short enough to
 * read in the list — so this is the by-id reader a screen for one would use,
 * and today it is what the tests read a single row back through. Undefined for
 * anything that is not a row, **including an id that is not an id**, for the
 * reason `getInquiry` guards the same way: a malformed uuid is an error from
 * Postgres rather than an empty result.
 */
export async function getApplication(db: Db, id: string): Promise<ApplicationRecord | undefined> {
  const row = await getApplicationRow(db, id);
  if (!row) return undefined;

  const children = await db
    .select()
    .from(applicationChildren)
    .where(eq(applicationChildren.applicationId, id))
    .orderBy(asc(applicationChildren.position));

  return {
    ...toRecord(row),
    children: children.map((child) => ({
      name: child.name,
      age: child.age,
      offeringKeys: child.offeringKeys,
    })),
  };
}

async function getApplicationRow(db: Db, id: string): Promise<ApplicationRow | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  return row;
}

/** The shape `gen_random_uuid()` produces, which is the only shape worth querying. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A row as the record, minus the children the caller fetches its own way. */
function toRecord(row: ApplicationRow): Omit<ApplicationRecord, 'children'> {
  return {
    id: row.id,
    familyName: row.familyName,
    email: row.email,
    receivedAt: row.receivedAt,
    flagged: row.flagged,
    objections: row.objections,
    statementVersion: row.statementVersion,
    faith: decodeFaith(row.faith),
    agreedTermsId: row.agreedTermsId,
    state: applicationState(row.status),
    payment: paymentOf(row),
    notifiedAt: row.notifiedAt,
    notificationError: row.notificationError,
    confirmedAt: row.confirmedAt,
    confirmationError: row.confirmationError,
  };
}

/** The payment axis as columns. The one place the three are written together. */
function paymentColumns(payment: Payment) {
  return {
    paymentMode: payment.mode,
    paymentStatus: payment.status,
    paymentSince: payment.since,
  };
}

/**
 * The payment axis as the domain shape.
 *
 * `payment_since` falls back to the day the application arrived, which is what
 * a row written before #32 holds — the cheque was awaited from the moment the
 * family applied, so the grace period was already running.
 */
function paymentOf(row: ApplicationRow): Payment {
  return {
    mode: PAYMENT_MODES.includes(row.paymentMode as PaymentMode)
      ? (row.paymentMode as PaymentMode)
      : 'cheque',
    status: RECORDED_PAYMENT_STATUSES.includes(row.paymentStatus as RecordedPaymentStatus)
      ? (row.paymentStatus as RecordedPaymentStatus)
      : 'awaiting',
    since: row.paymentSince ?? row.receivedAt,
  };
}

/**
 * A stored word as a state.
 *
 * A column of free text read back into a closed set, so a value the schema
 * could hold but the lifecycle does not know — a hand-edited row, a state
 * removed in a later version — reads as `submitted` rather than making every
 * screen that lists applications throw. Being visible and wrong beats being
 * absent.
 */
function applicationState(value: string): ApplicationState {
  return APPLICATION_STATES.includes(value as ApplicationState)
    ? (value as ApplicationState)
    : 'submitted';
}

/**
 * The answered cells as `key=value`, and only the answered ones.
 *
 * An unanswered cell is left out rather than stored as an empty string, because
 * the difference is the whole of why the grid is asked per person: a family with
 * no legal guardian did not answer that column, and a stored blank is a fact
 * about the form rather than about the family.
 */
function encodeFaith(answers: FaithAnswers): string[] {
  return Object.entries(answers)
    .filter(([, answer]) => answer === 'yes' || answer === 'no')
    .map(([key, answer]) => `${key}=${answer}`);
}

function decodeFaith(pairs: readonly string[]): FaithAnswers {
  const answers: FaithAnswers = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const value = pair.slice(at + 1);
    if (value === 'yes' || value === 'no') answers[pair.slice(0, at)] = value as FaithAnswer;
  }
  return answers;
}
