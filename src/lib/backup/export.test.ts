import { readFile } from 'node:fs/promises';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { saveAnnouncement } from '../announcements/store.js';
import { createEvent } from '../calendar/store.js';
import { reconcileSyncedEvents } from '../calendar/sync.js';
import { createEphemeralDatabase, type Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { createApplication } from '../application/store.js';
import { createInquiry } from '../inquiry/store.js';
import { getMoneySettings, recordAgreedTerms } from '../money/store.js';
import { deletePolicy, replacePolicyFile } from '../policies/store.js';
import {
  EXCLUDED_TABLES,
  EXPORTED_TABLES,
  EXPORTED_TABLE_LABELS,
  buildExport,
} from './export.js';

/**
 * The school-held backup, opened the way the school would open it (#33).
 *
 * Every assertion here goes through `fflate` rather than through the entry list
 * this repo built, because the acceptance criterion is not "the export contains
 * the right things" but "the ZIP is readable without Postgres". Those are the
 * same sentence only if the container is right, and the container is the part
 * nobody would notice being wrong until the day it mattered.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

async function open(): Promise<Record<string, Uint8Array>> {
  const archive = await buildExport(db, new Date('2026-09-01T05:00:00Z'));
  return unzipSync(archive.bytes);
}

function json(files: Record<string, Uint8Array>, path: string): unknown {
  const file = files[path];
  expect(file, `${path} is missing from the ZIP`).toBeDefined();
  return JSON.parse(Buffer.from(file).toString('utf8'));
}

describe('the ZIP', () => {
  it('is named for the school and the day it was taken', async () => {
    const archive = await buildExport(db, new Date('2026-09-01T05:00:00Z'));

    expect(archive.filename).toBe('pharos-academy-backup-2026-09-01.zip');
  });

  it('opens, and leads with a plain-English README rather than with data', async () => {
    const files = await open();

    const readme = Buffer.from(files['README.txt']).toString('utf8');
    // Somebody restoring this is not necessarily a developer, and by the time
    // they open it the person who wrote it may be unreachable. That is the
    // whole reason the school holds a copy at all.
    expect(readme).toMatch(/content\//);
    expect(readme).toMatch(/files\//);
    expect(readme).toMatch(/JSON/);
    // And what a retired entry is (#269), in the same voice: the reader who
    // meets one is a board member wondering why a policy is in here twice over
    // — once as a name and once as documents nothing on the site links to.
    expect(readme).toMatch(/no longer part of the school/i);
  });

  it('carries a manifest that names every file actually in the archive', async () => {
    const files = await open();
    const manifest = json(files, 'manifest.json') as {
      generatedAt: string;
      files: { path: string; bytes: number }[];
    };

    expect(manifest.generatedAt).toBe('2026-09-01T05:00:00.000Z');
    const listed = manifest.files.map((file) => file.path).sort();
    const present = Object.keys(files)
      .filter((path) => path !== 'manifest.json')
      .sort();
    expect(listed).toEqual(present);
    for (const file of manifest.files) {
      expect(files[file.path].length, file.path).toBe(file.bytes);
    }
  });
});

describe('the content', () => {
  it('carries the school details, as the school typed them', async () => {
    const files = await open();

    const details = json(files, 'content/school-details.json') as { phone: string };
    expect(details.phone).toBeTruthy();
  });

  it('carries the whole catalogue, the people and the announcements', async () => {
    const files = await open();

    expect((json(files, 'content/courses.json') as unknown[]).length).toBeGreaterThan(0);
    expect((json(files, 'content/people.json') as unknown[]).length).toBeGreaterThan(0);
    expect((json(files, 'content/announcements.json') as unknown[]).length).toBeGreaterThan(0);
    expect((json(files, 'content/policies.json') as unknown[]).length).toBeGreaterThan(0);
  });

  it('reads without Postgres — a course in the JSON is the course, not an id', async () => {
    const files = await open();

    const courses = json(files, 'content/courses.json') as { slug: string; title: string }[];
    const latin = courses.find((course) => course.slug.includes('latin'));
    expect(latin?.title).toMatch(/Latin/);
  });
});

describe('the files', () => {
  it('carries every retained version of every policy, byte for byte', async () => {
    const first = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    const second = await readFile('docs/mirror/pdf/policy-code-of-conduct.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: first }, 'Jill');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook-v2.pdf', bytes: second }, 'Jill');

    const files = await open();

    // Both versions, because "prior versions are retained" has to survive the
    // export as well as the table — an export that carried only the current
    // file would quietly answer "what did that family sign?" with the wrong PDF.
    expect(Buffer.from(files['files/policies/handbook/v1-handbook.pdf']).equals(first)).toBe(true);
    expect(Buffer.from(files['files/policies/handbook/v2-handbook-v2.pdf']).equals(second)).toBe(
      true,
    );
  });

  it('names each policy version in the JSON at the path it is actually at', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: pdf }, 'Jill');

    const files = await open();

    const policies = json(files, 'content/policies.json') as {
      slug: string;
      versions: { version: number; file: string }[];
    }[];
    const handbook = policies.find((policy) => policy.slug === 'handbook');
    expect(handbook?.versions).toHaveLength(1);
    expect(files[handbook!.versions[0].file]).toBeDefined();
  });

  it('carries an announcement’s attachment, and says where it is', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    const [announcement] = await (await import('../announcements/store.js')).listAnnouncements(db);
    await saveAnnouncement(
      db,
      announcement.slug,
      {
        headline: announcement.headline,
        body: announcement.body,
        postedOn: announcement.postedOn,
        linkUrl: announcement.linkUrl,
        linkLabel: announcement.linkLabel,
        attachment: { filename: 'board-update.pdf', bytes: pdf },
      },
      'Jill',
    );

    const files = await open();

    const announcements = json(files, 'content/announcements.json') as {
      slug: string;
      attachment: string | null;
    }[];
    const exported = announcements.find((row) => row.slug === announcement.slug);
    expect(exported?.attachment).toBe(`files/announcements/${announcement.slug}/board-update.pdf`);
    expect(Buffer.from(files[exported!.attachment!]).equals(pdf)).toBe(true);
  });

  /*
   * The deleted policy's documents, arriving named (#269).
   *
   * A version row outlives its policy on purpose (#260) and names a slug and
   * nothing else. Without the retired entry the archive carries two PDFs in a
   * folder that nothing else in it mentions — a board member opening the ZIP
   * finds files and no way to tell what they are or who agreed to them.
   */
  it('names a deleted policy, so its kept documents have a parent', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: pdf }, 'Jill');
    await deletePolicy(db, 'handbook', new Date('2026-08-15T14:00:00Z'));

    const files = await open();

    const policies = json(files, 'content/policies.json') as {
      slug: string;
      title: string;
      retired?: boolean;
      retiredAt?: string;
      versions: { version: number; file: string }[];
    }[];
    const handbook = policies.find((policy) => policy.slug === 'handbook');
    expect(handbook?.title).toBe('Handbook');
    expect(handbook?.retired).toBe(true);
    expect(handbook?.retiredAt).toBe('2026-08-15T14:00:00.000Z');
    expect(files[handbook!.versions[0].file]).toBeDefined();
    expect(Buffer.from(files[handbook!.versions[0].file]).equals(pdf)).toBe(true);
  });

  // The criterion behind the entry, stated as the property rather than as the
  // one case: no file under `files/policies/` belongs to a folder the JSON does
  // not name, however it came to be there.
  it('leaves no policy document in the ZIP that the JSON does not name', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: pdf }, 'Jill');
    await replacePolicyFile(db, 'code-of-conduct', { filename: 'conduct.pdf', bytes: pdf }, 'Jill');
    await deletePolicy(db, 'handbook');

    const files = await open();

    const named = new Set(
      (json(files, 'content/policies.json') as { versions: { file: string }[] }[]).flatMap(
        (policy) => policy.versions.map((version) => version.file),
      ),
    );
    for (const path of Object.keys(files).filter((path) => path.startsWith('files/policies/'))) {
      expect(named, path).toContain(path);
    }
  });

  // A live policy's entry is what it was: no `retired` key to explain, and
  // nothing about the deleted one leaking into it.
  it('leaves a live policy’s entry unchanged', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: pdf }, 'Jill');
    await replacePolicyFile(db, 'code-of-conduct', { filename: 'conduct.pdf', bytes: pdf }, 'Jill');
    const before = json(await open(), 'content/policies.json') as { slug: string }[];

    await deletePolicy(db, 'code-of-conduct');
    const after = json(await open(), 'content/policies.json') as { slug: string }[];

    const live = (entries: { slug: string }[]) =>
      entries.find((entry) => entry.slug === 'handbook');
    expect(live(after)).toEqual(live(before));
    expect(Object.keys(live(after)!)).not.toContain('retired');
  });

  it('does not invent a file for a policy that has none', async () => {
    const files = await open();

    // The migration seeds four policy rows with no documents. A policy is
    // published by its file, not its row (#28) — and an export that shipped a
    // zero-byte `handbook.pdf` would look like a corrupt backup rather than an
    // empty one.
    expect(Object.keys(files).some((path) => path.startsWith('files/policies/'))).toBe(false);
    const policies = json(files, 'content/policies.json') as { versions: unknown[] }[];
    expect(policies.every((policy) => policy.versions.length === 0)).toBe(true);
  });
});

describe('what it deliberately leaves out', () => {
  it('carries no password hash and no session token', async () => {
    const files = await open();

    const everything = Object.entries(files)
      .filter(([path]) => path.endsWith('.json') || path.endsWith('.txt'))
      .map(([, bytes]) => Buffer.from(bytes).toString('utf8'))
      .join('\n');

    expect(everything).not.toMatch(/scrypt\$/);
    expect(everything).not.toMatch(/password_hash|passwordHash/);
    expect(everything).not.toMatch(/token_hash|tokenHash/);
  });
});

describe('coverage of the editable set', () => {
  /**
   * The criterion "every editable content type, not only the ones that were
   * easy" (#33), made mechanical.
   *
   * Every table in the schema is either exported or on a written exclusion
   * list, so a table added by a later ticket — the school year and its events
   * (#23), the money settings (#29) — fails this test until somebody decides
   * which it is. The failure mode this guards against is not a bug: it is a
   * backup that is quietly one content type short for a year.
   */
  it('accounts for every table in the schema', () => {
    const tables = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((value) => getTableName(value as PgTable));

    const accounted = new Set<string>([...EXPORTED_TABLES, ...EXCLUDED_TABLES.map((t) => t.table)]);

    for (const table of tables) {
      expect(accounted, `"${table}" is neither exported nor explicitly excluded`).toContain(table);
    }
  });

  it('puts a real, non-empty file in the archive for each table it claims', async () => {
    // With a document attached, so `policy_versions` has rows: the seeded state
    // is four policies and no files, which is a real state but not one that can
    // tell an exported table from a forgotten one.
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');
    await replacePolicyFile(db, 'handbook', { filename: 'handbook.pdf', bytes: pdf }, 'Jill');
    // And one policy deleted after an upload (#269), for the same reason once
    // more: nothing is retired on a fresh database, which is a real state and
    // cannot tell a retired name that is exported from one that was forgotten.
    await replacePolicyFile(db, 'code-of-conduct', { filename: 'conduct.pdf', bytes: pdf }, 'Jill');
    await deletePolicy(db, 'code-of-conduct');
    // And one family's frozen terms, for the same reason: `agreed_terms` is
    // empty until somebody applies (#18 §11), which is a real state and a
    // useless one for telling an exported table from a forgotten one.
    await recordAgreedTerms(db, 'The Kilker family', await getMoneySettings(db));
    // And one event, likewise: a school year with nothing extra on it is an
    // ordinary year (#23) and cannot distinguish an exported table from a
    // forgotten one either.
    await createEvent(
      db,
      '2026-10-17-fall-open-house',
      {
        heldOn: '2026-10-17',
        title: 'Fall open house',
        startTime: '18:30',
        place: null,
        note: null,
      },
      'Jill',
    );
    // And one event out of the school's Google calendar (#153), likewise: the
    // mirror is empty until the nightly sync has run, which is a true state on
    // a fresh database and tells nothing about whether the table is exported.
    await reconcileSyncedEvents(
      db,
      [
        {
          uid: 'abc123@google.com',
          heldOn: '2026-11-14',
          title: 'Panera Bread Fundraiser',
          startTime: '16:00',
          place: null,
          note: null,
        },
      ],
      new Date('2026-10-01T12:00:00Z'),
    );
    // And one inquiry (#25), for the same reason again: nobody has asked on a
    // fresh database, which is a real state and a useless one here.
    await createInquiry(db, {
      name: 'Ruth Marsh',
      email: 'ruth@example.com',
      phone: '717-555-0142',
      ages: '6, 9 and 13',
      message: '',
    });

    // And one application with one child on it (#31), for the same reason a
    // third time — and because `application_children` is counted separately, so
    // an application with no children could not tell the two apart.
    await createApplication(
      db,
      {
        familyName: 'Marsh',
        email: 'ruth@example.com',
        children: [{ name: 'Tamar', age: '13', offeringKeys: ['algebra-1:year'] }],
        faith: { 'faith-Mother-agree': 'yes' },
        objections: '',
        agreements: { handbook: { answer: 'parent', version: 1 } },
        paymentMethod: 'check',
      },
      { statementVersion: 'sof-00000000' },
    );

    const files = await open();
    const manifest = json(files, 'manifest.json') as {
      tables: { table: string; file: string; rows: number }[];
    };

    expect(manifest.tables.map((entry) => entry.table).sort()).toEqual([...EXPORTED_TABLES].sort());
    for (const entry of manifest.tables) {
      expect(files[entry.file], entry.table).toBeDefined();
      expect(entry.rows, entry.table).toBeGreaterThan(0);
    }
  });

  it('gives a reason for every exclusion, so none of them is an oversight', () => {
    for (const excluded of EXCLUDED_TABLES) {
      expect(excluded.why.length, excluded.table).toBeGreaterThan(20);
    }
  });

  // `/admin/backup` renders both lists, and it renders them to Jill. A table
  // name on that screen is an answer in the wrong language; the labels exist so
  // the screen never has to invent one, and this is what keeps them present.
  it('names every table it exports and every one it excludes in plain English', () => {
    for (const table of EXPORTED_TABLES) {
      expect(EXPORTED_TABLE_LABELS[table], table).toBeTruthy();
      expect(EXPORTED_TABLE_LABELS[table], table).not.toContain('_');
    }
    for (const excluded of EXCLUDED_TABLES) {
      expect(excluded.label, excluded.table).toBeTruthy();
      expect(excluded.label, excluded.table).not.toContain('_');
    }
  });
});
