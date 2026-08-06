import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { SEEDED_POLICIES } from './policy.js';
import {
  createPolicy,
  getPolicy,
  getPolicyFile,
  listPolicies,
  listPolicyVersions,
  replacePolicyFile,
  savePolicy,
} from './store.js';

/**
 * Policies against real Postgres (#28).
 *
 * The three acceptance criteria that are properties of the store rather than of
 * a page are proved here, and all three are about a *replacement*: the address
 * does not move, the date comes from the upload, and the version that was
 * replaced is still there afterwards. Driven with two real PDFs from
 * `docs/mirror/` rather than short strings, for the reason the announcements'
 * suite uses one — `bytea` round-trips differently under PGlite and neon-http,
 * and a five-byte fixture would pass under any encoding at all.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

/** Two real, different policy PDFs — 179 KB and 107 KB of non-UTF-8 bytes. */
async function handbookPdf(): Promise<Buffer> {
  return readFile('docs/mirror/pdf/policy-handbook.pdf');
}

async function codeOfConductPdf(): Promise<Buffer> {
  return readFile('docs/mirror/pdf/policy-code-of-conduct.pdf');
}

describe('the seeded policies', () => {
  it('holds the school’s four, in the school’s order', async () => {
    const list = await listPolicies(db);
    expect(list.map((policy) => policy.slug)).toEqual(SEEDED_POLICIES.map((policy) => policy.slug));
  });

  it('starts with no document at all, so none of them is on the policies page', async () => {
    // The migration seeds rows; `npm run db:seed` attaches the files. A row
    // with no file is a real state and the public page is built to skip it.
    for (const policy of await listPolicies(db)) {
      expect(policy.version, policy.slug).toBeNull();
      expect(policy.filename, policy.slug).toBeNull();
      expect(policy.updatedAt, policy.slug).toBeNull();
    }
  });
});

describe('uploading a document', () => {
  it('serves it back byte for byte at the policy’s fixed address', async () => {
    const bytes = await handbookPdf();
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes }, 'Jill Kilker');

    const file = await getPolicyFile(db, 'handbook');
    expect(file!.filename).toBe('handbook.pdf');
    expect(file!.bytes.equals(bytes)).toBe(true);
  });

  // Acceptance criterion 2. Nothing anywhere accepts a typed date, and this is
  // the assertion that the stored one comes from the upload's own clock.
  it('stamps the updated date from the upload', async () => {
    const uploadedAt = new Date('2026-07-23T14:02:00Z');
    const policy = await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
      uploadedAt,
    );

    expect(policy.updatedAt?.toISOString()).toBe(uploadedAt.toISOString());
  });

  it('numbers the first one 1', async () => {
    const policy = await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
    );
    expect(policy.version).toBe(1);
  });
});

describe('replacing a document', () => {
  /** A policy with one version already on it. */
  async function withFirstVersion() {
    return replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
      new Date('2026-07-23T00:00:00Z'),
    );
  }

  // Acceptance criterion 1. This is the whole ticket in one assertion: the
  // address a printed handbook carries answers with the new bytes and is not a
  // redirect, because it was never a different address.
  it('serves the new file at the same address', async () => {
    await withFirstVersion();
    const replacement = await codeOfConductPdf();

    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-2027.pdf', bytes: replacement },
      'Jill Kilker',
      new Date('2027-01-04T00:00:00Z'),
    );

    const file = await getPolicyFile(db, 'handbook');
    expect(file!.bytes.equals(replacement)).toBe(true);
    expect(file!.version).toBe(2);
  });

  // Acceptance criterion 3.
  it('keeps the version it replaced, retrievable by number', async () => {
    await withFirstVersion();
    const original = await handbookPdf();

    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-2027.pdf', bytes: await codeOfConductPdf() },
      'Jill Kilker',
    );

    const previous = await getPolicyFile(db, 'handbook', 1);
    expect(previous!.bytes.equals(original)).toBe(true);
    expect(previous!.filename).toBe('handbook.pdf');
  });

  it('lists every version newest first, with who uploaded it and how big it is', async () => {
    await withFirstVersion();
    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-2027.pdf', bytes: await codeOfConductPdf() },
      'George Jensen',
      new Date('2027-01-04T00:00:00Z'),
    );

    const versions = await listPolicyVersions(db, 'handbook');
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[0]!.uploadedBy).toBe('George Jensen');
    expect(versions[1]!.uploadedBy).toBe('Jill Kilker');
    expect(versions[1]!.size).toBe((await handbookPdf()).length);
  });

  it('moves the updated date forward, and only an upload does', async () => {
    const first = await withFirstVersion();

    // Editing the description is not a new document and must not tell every
    // family the Handbook changed.
    const edited = await savePolicy(
      db,
      'handbook',
      {
        title: 'Handbook',
        description: 'A corrected sentence.',
        position: 1,
        signed: true,
      },
      'Jill Kilker',
      new Date('2026-08-01T00:00:00Z'),
    );
    expect(edited.updatedAt?.toISOString()).toBe(first.updatedAt?.toISOString());

    const replaced = await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-2027.pdf', bytes: await codeOfConductPdf() },
      'Jill Kilker',
      new Date('2027-01-04T00:00:00Z'),
    );
    expect(replaced.updatedAt?.toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });
});

describe('creating a policy', () => {
  it('takes a title, a position and the tick, and starts with no document', async () => {
    const created = await createPolicy(
      db,
      { slug: 'photography-consent', title: 'Photography Consent', position: 5, signed: true },
      'Jill Kilker',
    );

    expect(created.title).toBe('Photography Consent');
    expect(created.position).toBe(5);
    expect(created.signed).toBe(true);
    expect(created.description).toBe('');
    expect(created.version).toBeNull();
    expect(created.lastEditedBy).toBe('Jill Kilker');
  });

  it('refuses a second policy at an address that is already taken', async () => {
    await expect(
      createPolicy(
        db,
        { slug: 'handbook', title: 'Handbook', position: 9, signed: false },
        'Jill Kilker',
      ),
    ).rejects.toThrow();
  });
});

describe('renaming a policy', () => {
  // The address is on paper. A title is a label; the slug is a promise.
  it('does not move its address', async () => {
    await savePolicy(
      db,
      'handbook',
      {
        title: 'Family Handbook',
        description: 'The renamed one.',
        position: 1,
        signed: true,
      },
      'Jill Kilker',
    );

    const policy = await getPolicy(db, 'handbook');
    expect(policy!.title).toBe('Family Handbook');
    expect(policy!.slug).toBe('handbook');
  });
});

describe('a policy that does not exist', () => {
  it('has no file rather than an empty one', async () => {
    expect(await getPolicyFile(db, 'not-a-policy')).toBeUndefined();
  });

  it('has no file for a version that was never uploaded', async () => {
    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
    );
    expect(await getPolicyFile(db, 'handbook', 7)).toBeUndefined();
  });
});
