import { asc, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { applicationChildren, applications } from '../db/schema.js';
import type { ApplicationChild, ApplicationFields, FaithAnswer, FaithAnswers } from './application.js';

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
 * Nothing here updates a row. An application is what a family sent; the school
 * answers it in a conversation, not by editing it.
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
};

/** The two things the submit knows that the form does not. */
export type ApplicationStamp = {
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
  stamp: ApplicationStamp,
  now = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(applications)
    .values({
      familyName: values.familyName,
      email: values.email,
      receivedAt: now,
      flagged: stamp.flagged ?? false,
      objections: values.objections,
      statementVersion: stamp.statementVersion,
      faith: encodeFaith(values.faith),
      agreedTermsId: stamp.agreedTermsId ?? null,
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
    id: row.id,
    familyName: row.familyName,
    email: row.email,
    receivedAt: row.receivedAt,
    flagged: row.flagged,
    objections: row.objections,
    statementVersion: row.statementVersion,
    faith: decodeFaith(row.faith),
    children: children
      .filter((child) => child.applicationId === row.id)
      .map((child) => ({ name: child.name, age: child.age, offeringKeys: child.offeringKeys })),
    agreedTermsId: row.agreedTermsId,
  }));
}

/** One application, or undefined — which the confirmation turns into a fresh form. */
export async function getApplication(db: Db, id: string): Promise<ApplicationRecord | undefined> {
  const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (rows.length === 0) return undefined;
  return (await listApplications(db)).find((record) => record.id === id);
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
