import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { distinctPolicySlug, SEEDED_POLICIES, type Policy } from './policy.js';
import {
  createPolicy,
  deletePolicy,
  getPolicy,
  getPolicyFile,
  listPolicies,
  listPolicyVersions,
  occupiedPolicySlugs,
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

/**
 * Deleting a policy (#260, ADR-0021).
 *
 * The whole of this ticket is one claim about the database, and it is a claim
 * about what a delete does **not** reach. Migration 0023 dropped the cascade
 * from `policy_versions`, so a version row is now the same kind of thing an
 * application's `handbook=parent@3` already was: a permanent record naming a
 * slug and a number, resolving whether or not anything still holds that slug.
 *
 * Proved with two real PDFs rather than short strings, for the reason the rest
 * of this file uses them — what has to survive the delete is *the bytes*, and a
 * five-byte fixture would come back identical under any encoding at all.
 */
describe('deleting a policy', () => {
  /** Two versions of the Handbook, so there is something to lose. */
  async function handbookWithTwoVersions(): Promise<{ v1: Buffer; v2: Buffer }> {
    const v1 = await handbookPdf();
    const v2 = await codeOfConductPdf();
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: v1 }, 'Jill Kilker');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook-2.pdf', bytes: v2 }, 'Jill Kilker');
    return { v1, v2 };
  }

  it('takes the policy off the list and out of every read of it', async () => {
    await deletePolicy(db, 'handbook');

    expect(await getPolicy(db, 'handbook')).toBeUndefined();
    expect((await listPolicies(db)).map((policy) => policy.slug)).not.toContain('handbook');
  });

  // The claim the cascade used to make false. Nothing else in this suite would
  // catch its return: the delete would simply succeed and the rows would be
  // gone, which is what it looks like when it is working.
  it('deletes no version row', async () => {
    await handbookWithTwoVersions();
    expect(await listPolicyVersions(db, 'handbook')).toHaveLength(2);

    await deletePolicy(db, 'handbook');

    const kept = await listPolicyVersions(db, 'handbook');
    expect(kept.map((version) => version.version)).toEqual([2, 1]);
    expect(kept.map((version) => version.filename)).toEqual(['handbook-2.pdf', 'handbook.pdf']);
  });

  /*
   * The versioned address is the one on paper and the one an agreement names,
   * and it goes on serving the same bytes. `getPolicyFile` reads the version
   * table alone when a number is given, which is what makes that possible with
   * no policy row left to read.
   */
  it('leaves every versioned document readable, byte for byte', async () => {
    const { v1, v2 } = await handbookWithTwoVersions();

    await deletePolicy(db, 'handbook');

    const first = await getPolicyFile(db, 'handbook', 1);
    const second = await getPolicyFile(db, 'handbook', 2);
    expect(first!.bytes.equals(v1)).toBe(true);
    expect(second!.bytes.equals(v2)).toBe(true);
    expect(first!.filename).toBe('handbook.pdf');
  });

  /*
   * An August application says `handbook=parent@1`. The number is the whole of
   * the reference — there is no foreign key to follow and never was — so what
   * has to be true after the delete is that the number still resolves to the
   * document that family was shown, and not to the one that replaced it.
   */
  it('still resolves the version an application recorded, and not a later one', async () => {
    const { v1 } = await handbookWithTwoVersions();
    const [slug, version] = ['handbook', 1];

    await deletePolicy(db, slug);

    const agreed = await getPolicyFile(db, slug, version);
    expect(agreed!.version).toBe(1);
    expect(agreed!.bytes.equals(v1)).toBe(true);
  });

  // The fixed address is the half that is *meant* to go: it resolves through
  // the policy row, and the policies page it belongs to no longer lists this.
  it('takes the fixed address down, because that is what deleting the policy means', async () => {
    await handbookWithTwoVersions();

    await deletePolicy(db, 'handbook');

    expect(await getPolicyFile(db, 'handbook')).toBeUndefined();
  });

  // The mistake case: a policy created with the wrong title before anybody
  // uploaded anything. There is nothing to orphan, and nothing is left behind.
  it('deletes a policy with no document cleanly', async () => {
    await createPolicy(
      db,
      { slug: 'photography-consent', title: 'Photography Consent', position: 5, signed: false },
      'Jill Kilker',
    );

    await deletePolicy(db, 'photography-consent');

    expect(await getPolicy(db, 'photography-consent')).toBeUndefined();
    expect(await listPolicyVersions(db, 'photography-consent')).toEqual([]);
  });

  // Every policy, gone. A school between years is entitled to say so, and the
  // admin's empty state is only reachable at all because this works.
  it('lets the whole list be emptied', async () => {
    for (const policy of await listPolicies(db)) await deletePolicy(db, policy.slug);

    expect(await listPolicies(db)).toEqual([]);
  });
});

/**
 * Re-adding a deleted policy (#268).
 *
 * The store's half of the ticket is one number. #260 left the versions behind
 * when the policy went, so the slug a returning policy is created back onto
 * already has documents under it — and the next upload has to take the number
 * after the highest of them rather than starting again. Version 1 minted twice
 * would mean `/policies/handbook/v1.pdf` naming two different documents, which
 * is the failure a permanent address exists to make impossible, and it would
 * silently rewrite what an application recorded an agreement to.
 *
 * Nothing in the store decides *whether* to inherit — that is the question the
 * screen asks. What is proved here is that once the slug is chosen, the
 * numbering follows from it and cannot be made to repeat.
 */
describe('re-adding a deleted policy', () => {
  /** The Handbook, uploaded to twice and then deleted, its documents left behind. */
  async function deletedHandbook(): Promise<{ v1: Buffer; v2: Buffer }> {
    const v1 = await handbookPdf();
    const v2 = await codeOfConductPdf();
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: v1 }, 'Jill Kilker');
    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-2.pdf', bytes: v2 },
      'Jill Kilker',
    );
    await deletePolicy(db, 'handbook');
    return { v1, v2 };
  }

  /** Put it back at the address it always had. */
  async function readd(slug = 'handbook'): Promise<Policy> {
    return createPolicy(db, { slug, title: 'Handbook', position: 1, signed: true }, 'Jill Kilker');
  }

  it('comes back at the address it always had', async () => {
    await deletedHandbook();

    const back = await readd();

    expect(back.slug).toBe('handbook');
    expect((await getPolicy(db, 'handbook'))?.title).toBe('Handbook');
  });

  // A policy is published by its file and not by its row, and a re-added one is
  // no exception: the kept documents belong to the address, not to this row.
  it('comes back unpublished, with no current document', async () => {
    await deletedHandbook();

    const back = await readd();

    expect(back.version).toBeNull();
    expect(back.filename).toBeNull();
    expect(back.updatedAt).toBeNull();
    expect(await getPolicyFile(db, 'handbook')).toBeUndefined();
  });

  // The ticket, in one assertion. Counting the row would give 1; counting the
  // table gives 3, which is the only answer that keeps a version number meaning
  // one document forever.
  it('takes the next version after the highest surviving one, never version 1', async () => {
    await deletedHandbook();
    await readd();

    const uploaded = await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-3.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
    );

    expect(uploaded.version).toBe(3);
  });

  it('reuses no version number, across as many deletes as the school makes', async () => {
    await deletedHandbook();

    for (const round of [3, 4, 5]) {
      await readd();
      const uploaded = await replacePolicyFile(
        db,
        'handbook',
        { filename: `handbook-${round}.pdf`, bytes: await codeOfConductPdf() },
        'Jill Kilker',
      );
      expect(uploaded.version).toBe(round);
      await deletePolicy(db, 'handbook');
    }

    const versions = (await listPolicyVersions(db, 'handbook')).map((one) => one.version);
    expect(versions).toEqual([5, 4, 3, 2, 1]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  /*
   * The whole reason the school is allowed to re-add at all. An application
   * from August says `handbook=parent@1`; that reference is text with no key to
   * follow, so what has to be true after the delete *and* after the re-add is
   * that the number still opens the document that family was shown — and not
   * the one uploaded after the policy came back.
   */
  it('still resolves an agreement recorded before the deletion', async () => {
    const { v1, v2 } = await deletedHandbook();
    await readd();
    await replacePolicyFile(
      db,
      'handbook',
      { filename: 'handbook-3.pdf', bytes: await handbookPdf() },
      'Jill Kilker',
    );

    const agreed = await getPolicyFile(db, 'handbook', 1);
    expect(agreed!.version).toBe(1);
    expect(agreed!.bytes.equals(v1)).toBe(true);
    expect((await getPolicyFile(db, 'handbook', 2))!.bytes.equals(v2)).toBe(true);
  });

  // Re-adding moves nothing and renames nothing: the kept documents keep the
  // filenames and the upload dates they were given, under the same slug.
  it('leaves the kept documents exactly as they were', async () => {
    await deletedHandbook();
    const before = await listPolicyVersions(db, 'handbook');

    await readd();

    expect(await listPolicyVersions(db, 'handbook')).toEqual(before);
  });

  /*
   * The other answer to the question the screen asks. A different document that
   * happens to mint the same slug goes to a slug of its own, and the orphaned
   * history is not touched by that — it stays orphaned and stays readable.
   */
  it('leaves the kept documents orphaned when a distinct address is used', async () => {
    const { v1 } = await deletedHandbook();

    const separate = await readd(distinctPolicySlug('handbook', await occupiedPolicySlugs(db)));

    expect(separate.slug).toBe('handbook-2');
    expect(await listPolicyVersions(db, 'handbook-2')).toEqual([]);
    expect((await getPolicyFile(db, 'handbook', 1))!.bytes.equals(v1)).toBe(true);
    expect(await getPolicy(db, 'handbook')).toBeUndefined();
  });

  // Both senses of "taken", in one read: the four seeded rows, plus a slug that
  // holds nothing but documents. Minting a second address over the latter would
  // recreate the exact ambiguity the school was asked about.
  it('counts an orphaned slug as spoken for, and names each slug once', async () => {
    await deletedHandbook();
    await replacePolicyFile(
      db,
      'code-of-conduct',
      { filename: 'code.pdf', bytes: await codeOfConductPdf() },
      'Jill Kilker',
    );

    const occupied = await occupiedPolicySlugs(db);

    expect(occupied).toContain('handbook');
    expect(occupied).toContain('code-of-conduct');
    expect(new Set(occupied).size).toBe(occupied.length);
    expect(occupied).toHaveLength(4);
  });
});
