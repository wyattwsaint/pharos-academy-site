import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { SEEDED_ANNOUNCEMENTS } from './announcement.js';
import {
  createAnnouncement,
  getAnnouncement,
  getAttachment,
  listAnnouncements,
  saveAnnouncement,
} from './store.js';

/**
 * Announcements against real Postgres.
 *
 * The interesting half of #27 is the attachment: a PDF is `bytea`, production is
 * neon-http and the tests are PGlite, and the two drivers hand back a different
 * shape for the same column. So the round trip is proved here byte-for-byte
 * against a real file from `docs/mirror/` rather than against a short string
 * that would pass under any encoding at all.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

/** The real board-update PDF — 105 KB of it, non-UTF-8 and full of nulls. */
async function boardUpdatePdf(): Promise<Buffer> {
  return readFile('docs/mirror/pdf/school-board-update-2026-07-01.pdf');
}

describe('the seeded announcements', () => {
  it('holds the school’s own six', async () => {
    const list = await listAnnouncements(db);
    expect(list).toHaveLength(SEEDED_ANNOUNCEMENTS.length);
  });

  it('lists them newest first', async () => {
    await createAnnouncement(
      db,
      {
        slug: '2026-09-01-a-later-notice',
        headline: 'A later notice',
        body: 'Something happened in September.',
        postedOn: '2026-09-01',
        linkUrl: null,
        linkLabel: null,
      },
      'Jill Kilker',
    );

    const list = await listAnnouncements(db);
    expect(list[0]!.slug).toBe('2026-09-01-a-later-notice');
    expect(list.map((a) => a.postedOn)).toEqual([...list.map((a) => a.postedOn)].sort().reverse());
  });

  it('carries the Weis link and its label together', async () => {
    const weis = await getAnnouncement(db, '2026-07-01-fundraising-for-pharos-through-weis-markets');
    expect(weis?.linkUrl).toBe('https://www.weis4school.com');
    expect(weis?.linkLabel).toBe('Register your Weis Rewards card');
  });

  it('seeds the board update as an ordinary row with no file yet', async () => {
    const update = await getAnnouncement(db, '2026-07-01-school-board-update-july-2026');
    expect(update?.attachmentFilename).toBeNull();
    expect(await getAttachment(db, update!.slug)).toBeUndefined();
  });

  it('hands back nothing for a slug that is not there', async () => {
    expect(await getAnnouncement(db, 'no-such-announcement')).toBeUndefined();
  });
});

describe('an empty list', () => {
  it('is a school with nothing to say, not a broken deployment', async () => {
    await db.execute('delete from announcements');
    await expect(listAnnouncements(db)).resolves.toEqual([]);
  });
});

describe('posting and editing', () => {
  it('stamps a new announcement on creation', async () => {
    const posted = await createAnnouncement(
      db,
      {
        slug: '2026-08-05-picture-day',
        headline: 'Picture day',
        body: 'Bring a comb.',
        postedOn: '2026-08-05',
        linkUrl: null,
        linkLabel: null,
      },
      'Jill Kilker',
    );

    expect(posted.lastEditedBy).toBe('Jill Kilker');
    expect(posted.lastEditedAt).toBeInstanceOf(Date);
  });

  it('overwrites the stamp on save rather than appending one', async () => {
    const slug = '2026-07-01-senators-game-fundraiser-24-july';
    await saveAnnouncement(
      db,
      slug,
      { ...fieldsOfSeed(slug), body: 'Corrected: $4 a ticket.' },
      'Jill Kilker',
    );
    const saved = await saveAnnouncement(
      db,
      slug,
      { ...fieldsOfSeed(slug), body: 'Corrected again.' },
      'George Jensen',
    );

    expect(saved.lastEditedBy).toBe('George Jensen');
    expect(saved.body).toBe('Corrected again.');
  });

  it('leaves the posted date alone when a typo is fixed', async () => {
    const slug = '2026-07-01-senators-game-fundraiser-24-july';
    const saved = await saveAnnouncement(
      db,
      slug,
      { ...fieldsOfSeed(slug), headline: 'Senators game fundraiser, 24 July' },
      'Jill Kilker',
    );
    expect(saved.postedOn).toBe('2026-07-01');
  });

  it('refuses a save against a slug that is not there', async () => {
    await expect(
      saveAnnouncement(
        db,
        'no-such-announcement',
        {
          headline: 'x',
          body: 'y',
          postedOn: '2026-08-05',
          linkUrl: null,
          linkLabel: null,
        },
        'Jill Kilker',
      ),
    ).rejects.toThrow(/no-such-announcement/);
  });
});

describe('the attached PDF', () => {
  it('comes back byte for byte', async () => {
    const bytes = await boardUpdatePdf();
    const slug = '2026-07-01-school-board-update-july-2026';

    await saveAnnouncement(
      db,
      slug,
      {
        ...fieldsOfSeed(slug),
        attachment: { filename: 'school-board-update-2026-07-01.pdf', bytes },
      },
      'Jill Kilker',
    );

    const attachment = await getAttachment(db, slug);
    expect(attachment?.filename).toBe('school-board-update-2026-07-01.pdf');
    expect(attachment?.bytes.length).toBe(bytes.length);
    expect(attachment?.bytes.equals(bytes)).toBe(true);
  });

  it('shows up as a filename on the list without dragging the bytes along', async () => {
    const slug = '2026-07-01-school-board-update-july-2026';
    await saveAnnouncement(
      db,
      slug,
      {
        ...fieldsOfSeed(slug),
        attachment: { filename: 'board-update.pdf', bytes: await boardUpdatePdf() },
      },
      'Jill Kilker',
    );

    const listed = (await listAnnouncements(db)).find((a) => a.slug === slug);
    expect(listed?.attachmentFilename).toBe('board-update.pdf');
    expect(listed).not.toHaveProperty('attachmentBytes');
  });

  it('is left alone by a save that does not mention it', async () => {
    const slug = '2026-07-01-school-board-update-july-2026';
    await saveAnnouncement(
      db,
      slug,
      {
        ...fieldsOfSeed(slug),
        attachment: { filename: 'board-update.pdf', bytes: await boardUpdatePdf() },
      },
      'Jill Kilker',
    );

    await saveAnnouncement(db, slug, { ...fieldsOfSeed(slug), body: 'Reworded.' }, 'Jill Kilker');

    expect((await getAttachment(db, slug))?.filename).toBe('board-update.pdf');
  });

  it('is removed, filename and bytes together, when the save says null', async () => {
    const slug = '2026-07-01-school-board-update-july-2026';
    await saveAnnouncement(
      db,
      slug,
      {
        ...fieldsOfSeed(slug),
        attachment: { filename: 'board-update.pdf', bytes: await boardUpdatePdf() },
      },
      'Jill Kilker',
    );

    const cleared = await saveAnnouncement(
      db,
      slug,
      { ...fieldsOfSeed(slug), attachment: null },
      'Jill Kilker',
    );

    expect(cleared.attachmentFilename).toBeNull();
    expect(await getAttachment(db, slug)).toBeUndefined();
  });

  it('can be posted with a new announcement', async () => {
    const bytes = await boardUpdatePdf();
    const posted = await createAnnouncement(
      db,
      {
        slug: '2026-08-05-the-handbook',
        headline: 'The handbook',
        body: 'Attached.',
        postedOn: '2026-08-05',
        linkUrl: null,
        linkLabel: null,
        attachment: { filename: 'handbook.pdf', bytes },
      },
      'Jill Kilker',
    );

    expect(posted.attachmentFilename).toBe('handbook.pdf');
    expect((await getAttachment(db, posted.slug))?.bytes.equals(bytes)).toBe(true);
  });
});

/** A seeded announcement's editable fields, so a test can change exactly one. */
function fieldsOfSeed(slug: string) {
  const seed = SEEDED_ANNOUNCEMENTS.find((announcement) => announcement.slug === slug)!;
  return {
    headline: seed.headline,
    body: seed.body,
    postedOn: seed.postedOn,
    linkUrl: seed.linkUrl,
    linkLabel: seed.linkLabel,
  };
}
