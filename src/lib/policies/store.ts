import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { policies as policiesTable, policyVersions, type PolicyRow } from '../db/schema.js';
import type { Policy, PolicyDraft, PolicyEdit, PolicyVersion } from './policy.js';

/**
 * The one list of policies, read and written (#28).
 *
 * **The bytes are separate**, as they are for announcements: nothing that lists
 * policies ever selects a `bytes` column, because a page printing four titles
 * would otherwise pull 564 KB of PDF through memory to do it. `getPolicyFile`
 * is the only function that reads them, and the two routes that serve files are
 * its only callers.
 *
 * **`replacePolicyFile` is the only writer of the version table**, and it only
 * ever inserts. Nothing here updates or deletes a version, so "prior versions
 * are retained" is a property of the code rather than a promise about it.
 */

/** The columns that are not a file. The whole `policies` table, in fact. */
const COLUMNS = {
  slug: policiesTable.slug,
  title: policiesTable.title,
  description: policiesTable.description,
  position: policiesTable.position,
  signed: policiesTable.signed,
  currentVersion: policiesTable.currentVersion,
  currentFilename: policiesTable.currentFilename,
  updatedAt: policiesTable.updatedAt,
  lastEditedBy: policiesTable.lastEditedBy,
  lastEditedAt: policiesTable.lastEditedAt,
} as const;

/**
 * Every policy, in the order the school put them in.
 *
 * The slug is the tiebreaker so that two policies sharing a position — which
 * nothing prevents, because the create form asks for a number rather than
 * enforcing a sequence — come back in a stable order rather than in whichever
 * order Postgres felt like. A list that reorders itself between renders is a
 * page a client reports as broken and nobody can reproduce.
 */
export async function listPolicies(db: Db): Promise<Policy[]> {
  const rows = await db
    .select(COLUMNS)
    .from(policiesTable)
    .orderBy(asc(policiesTable.position), asc(policiesTable.slug));
  return rows.map(toPolicy);
}

/** One policy, or undefined — which the admin and the file routes 404 on. */
export async function getPolicy(db: Db, slug: string): Promise<Policy | undefined> {
  const rows = await db
    .select(COLUMNS)
    .from(policiesTable)
    .where(eq(policiesTable.slug, slug))
    .limit(1);
  const row = rows[0];
  return row ? toPolicy(row) : undefined;
}

/**
 * Create a policy — title, position, tick, and nothing else.
 *
 * No description and no file, deliberately. This is the one screen in the admin
 * where a client can create a structurally wrong *thing* rather than merely a
 * wrong value (#18 §10), so it asks for the three facts that are structural and
 * leaves everything correctable to the ordinary edit screen next door.
 */
export async function createPolicy(
  db: Db,
  draft: PolicyDraft & { slug: string },
  editorName: string,
  now = new Date(),
): Promise<Policy> {
  const [row] = await db
    .insert(policiesTable)
    .values({
      slug: draft.slug,
      title: draft.title,
      description: '',
      position: draft.position,
      signed: draft.signed,
      lastEditedBy: editorName,
      lastEditedAt: now,
    })
    .returning(COLUMNS);

  if (!row) throw new Error(`Could not create a policy at "${draft.slug}".`);
  return toPolicy(row);
}

/**
 * Save the typed half of a policy.
 *
 * The slug is not among the fields and never will be: it is the address on a
 * printed handbook, and renaming "Handbook" to "Family Handbook" is a title
 * change, not a move. `updated_at` is not among them either — it belongs to the
 * upload, which is the acceptance criterion that it cannot be typed.
 */
export async function savePolicy(
  db: Db,
  slug: string,
  edit: PolicyEdit,
  editorName: string,
  now = new Date(),
): Promise<Policy> {
  const [row] = await db
    .update(policiesTable)
    .set({
      title: edit.title,
      description: edit.description,
      position: edit.position,
      signed: edit.signed,
      lastEditedBy: editorName,
      lastEditedAt: now,
    })
    .where(eq(policiesTable.slug, slug))
    .returning(COLUMNS);

  if (!row) throw new Error(`No policy with the slug "${slug}".`);
  return toPolicy(row);
}

/** A file and what it is called. */
export type PolicyFile = {
  filename: string;
  bytes: Buffer;
};

/**
 * Put a new version of the document at the policy's existing address.
 *
 * The three acceptance criteria of this ticket meet here:
 *
 * - the **address does not move** — nothing in this function touches the slug;
 * - the **date is stamped** — `updated_at` is `now`, the moment of the upload,
 *   and no caller passes a date a person typed;
 * - the **prior version survives** — the insert takes the next number, and
 *   there is no update or delete anywhere in this module that could take the
 *   old row away.
 *
 * The version number is computed from the table rather than from
 * `current_version`, so a row whose denormalised pointer somehow lagged still
 * cannot collide with a version that exists.
 */
export async function replacePolicyFile(
  db: Db,
  slug: string,
  file: PolicyFile,
  editorName: string,
  now = new Date(),
): Promise<Policy> {
  const [latest] = await db
    .select({ version: policyVersions.version })
    .from(policyVersions)
    .where(eq(policyVersions.policySlug, slug))
    .orderBy(desc(policyVersions.version))
    .limit(1);

  const version = (latest?.version ?? 0) + 1;

  await db.insert(policyVersions).values({
    policySlug: slug,
    version,
    filename: file.filename,
    bytes: file.bytes,
    uploadedAt: now,
    uploadedBy: editorName,
  });

  const [row] = await db
    .update(policiesTable)
    .set({
      currentVersion: version,
      currentFilename: file.filename,
      updatedAt: now,
      lastEditedBy: editorName,
      lastEditedAt: now,
    })
    .where(eq(policiesTable.slug, slug))
    .returning(COLUMNS);

  if (!row) throw new Error(`No policy with the slug "${slug}".`);
  return toPolicy(row);
}

/**
 * Every retained version of one policy, newest first, without the bytes.
 *
 * The size comes back as `length(bytes)`, computed by Postgres, so the admin
 * can print "179 KB" beside each version without any of the four megabytes it
 * is describing crossing the wire.
 */
export async function listPolicyVersions(db: Db, slug: string): Promise<PolicyVersion[]> {
  const rows = await db
    .select({
      version: policyVersions.version,
      filename: policyVersions.filename,
      uploadedAt: policyVersions.uploadedAt,
      uploadedBy: policyVersions.uploadedBy,
      size: sql<number>`length(${policyVersions.bytes})`,
    })
    .from(policyVersions)
    .where(eq(policyVersions.policySlug, slug))
    .orderBy(desc(policyVersions.version));

  return rows.map((row) => ({ ...row, size: Number(row.size) }));
}

/**
 * The bytes of one version, or of the current one when no version is named.
 *
 * The only read of a `bytes` column in the codebase, called by the only two
 * routes that serve files.
 */
export async function getPolicyFile(
  db: Db,
  slug: string,
  version?: number,
): Promise<(PolicyFile & { version: number; uploadedAt: Date }) | undefined> {
  const where =
    version === undefined
      ? and(
          eq(policyVersions.policySlug, slug),
          eq(policyVersions.version, currentVersionOf(slug)),
        )
      : and(eq(policyVersions.policySlug, slug), eq(policyVersions.version, version));

  const [row] = await db
    .select({
      version: policyVersions.version,
      filename: policyVersions.filename,
      bytes: policyVersions.bytes,
      uploadedAt: policyVersions.uploadedAt,
    })
    .from(policyVersions)
    .where(where)
    .limit(1);

  return row ?? undefined;
}

/**
 * The current version number, as a subquery.
 *
 * A subquery rather than two round trips because the fixed URL is the hot path
 * — it is what a parent's browser asks for — and Neon is over HTTP, where a
 * second query is a second network request.
 */
function currentVersionOf(slug: string) {
  return sql<number>`(select ${policiesTable.currentVersion} from ${policiesTable} where ${policiesTable.slug} = ${slug})`;
}

/**
 * The row as the vocabulary has it.
 *
 * Written out rather than passed through, like the people and announcement
 * stores, so a column added for storage reasons does not silently become part
 * of the domain type.
 */
function toPolicy(row: PolicyRow): Policy {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    position: row.position,
    signed: row.signed,
    version: row.currentVersion,
    filename: row.currentFilename,
    updatedAt: row.updatedAt,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}
