import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { saveSchoolDetails } from '../admin/school-details.js';
import { createEphemeralDatabase, type Db } from '../db/client.js';
import { buildExport } from './export.js';
import {
  MAX_ATTACHMENT_BYTES,
  isAuthorisedCron,
  resendSender,
  sendMonthlyBackup,
  type Mail,
} from './monthly.js';

/**
 * The send on the 1st (#33, AC 4).
 *
 * The button is a backup nobody clicks, so the send is the one that actually
 * has to work — and it works unattended, once a month, where nobody is watching
 * it fail. Everything that could quietly go wrong is asserted here: that the
 * recipient comes from the settings rather than from a constant somebody typed
 * once, that the attached bytes are the *same* archive the button hands over,
 * and that the endpoint refuses anybody who is not the scheduler.
 *
 * The sender is injected rather than mocked at the module boundary, so what is
 * asserted is the mail this code decided to send, not that a function was
 * called.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

/** A sender that posts nothing and keeps everything. */
function recorder(): { sender: (mail: Mail) => Promise<void>; sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    sender: async (mail) => {
      sent.push(mail);
    },
  };
}

const AT = new Date('2026-09-01T08:00:00Z');
const FROM = 'backups@pharosacademy.net';

describe('the monthly send', () => {
  it('goes to the address in the settings, not to one written into the code', async () => {
    const details = await (await import('../admin/school-details.js')).getSchoolDetails(db);
    await saveSchoolDetails(
      db,
      {
        address: details.address,
        phone: details.phone,
        email: 'someone-else@pharosacademy.net',
        schoolYearStart: details.schoolYearStart,
        mission: details.mission,
        vision: details.vision,
        giveUrl: details.giveUrl,
      },
      'Jill',
    );

    const { sender, sent } = recorder();
    const result = await sendMonthlyBackup(db, { sender, from: FROM, at: AT });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('someone-else@pharosacademy.net');
    expect(result.to).toBe('someone-else@pharosacademy.net');
    expect(sent[0].from).toBe(FROM);
  });

  // AC 4's second half, and the reason `buildExport` has one caller shape: "the
  // same ZIP" stops being true the moment the email builds its own.
  it('carries the same archive the Download everything button hands over', async () => {
    const { sender, sent } = recorder();
    await sendMonthlyBackup(db, { sender, from: FROM, at: AT });

    const button = await buildExport(db, AT);
    expect(sent[0].attachment.filename).toBe(button.filename);
    expect(sent[0].attachment.bytes.equals(button.bytes)).toBe(true);

    // And it is still a ZIP after the trip through the mail shape — the thing
    // an attachment is most likely to stop being.
    const files = unzipSync(sent[0].attachment.bytes);
    expect(files['README.txt']).toBeDefined();
    expect(files['manifest.json']).toBeDefined();
  });

  it('says in plain words what the message is and what to do with it', async () => {
    const { sender, sent } = recorder();
    await sendMonthlyBackup(db, { sender, from: FROM, at: AT });

    // Whoever opens this is a school administrator, once a month, on a phone.
    expect(sent[0].subject).toMatch(/backup/i);
    expect(sent[0].subject).toContain('2026-09-01');
    expect(sent[0].text.length).toBeGreaterThan(100);
    expect(sent[0].text).toMatch(/attach/i);
  });

  /*
   * The one failure this send can have that nobody would see.
   *
   * Resend refuses an oversized attachment with a 4xx, and a monthly job that
   * 4xx-es into a log is a backup that stopped a year ago. Refusing here, with
   * the size in the message, makes the failure name its own cause — and the
   * cause is real: the archive grows by every retained policy version forever.
   */
  it('refuses loudly rather than mailing an archive too big to send', async () => {
    const { sender } = recorder();

    await expect(
      sendMonthlyBackup(db, { sender, from: FROM, at: AT, maxBytes: 10 }),
    ).rejects.toThrow(/too large|bytes/i);
  });

  it('refuses to send to an empty address rather than mailing nowhere', async () => {
    const details = await (await import('../admin/school-details.js')).getSchoolDetails(db);
    await db.execute(
      // The settings form will not save a blank email, so this is the state a
      // migration or a hand-edit could leave behind — not one Jill can create.
      (await import('drizzle-orm')).sql.raw("update school_details set email = '' where id = 1"),
    );
    expect(details.email).toBeTruthy();

    const { sender, sent } = recorder();
    await expect(sendMonthlyBackup(db, { sender, from: FROM, at: AT })).rejects.toThrow(/address/i);
    expect(sent).toHaveLength(0);
  });
});

describe('the Resend sender', () => {
  it('posts the archive to Resend as base64, under the API key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 });
    }) as unknown as typeof fetch;

    await resendSender('re_test_key', fakeFetch)({
      to: 'office@pharosacademy.net',
      from: FROM,
      subject: 'Backup',
      text: 'Attached.',
      attachment: { filename: 'backup.zip', bytes: Buffer.from('PK not really') },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.to).toEqual(['office@pharosacademy.net']);
    expect(body.attachments[0].filename).toBe('backup.zip');
    expect(Buffer.from(body.attachments[0].content, 'base64').toString()).toBe(
      'PK not really',
    );
  });

  it('throws with what Resend said, so a failed month is diagnosable', async () => {
    const fakeFetch = (async () =>
      new Response('{"message":"Invalid `from` field"}', { status: 422 })) as unknown as typeof fetch;

    await expect(
      resendSender('re_test_key', fakeFetch)({
        to: 'office@pharosacademy.net',
        from: 'nobody',
        subject: 'Backup',
        text: 'Attached.',
        attachment: { filename: 'backup.zip', bytes: Buffer.from('x') },
      }),
    ).rejects.toThrow(/422|Invalid `from` field/);
  });
});

describe('the cron endpoint’s guard', () => {
  const secret = 'a-long-scheduler-secret-value';

  function request(header?: string): Request {
    return new Request('https://example.test/api/cron/monthly-backup', {
      headers: header ? { authorization: header } : {},
    });
  }

  it('lets the scheduler through', () => {
    expect(isAuthorisedCron(request(`Bearer ${secret}`), secret)).toBe(true);
  });

  it('refuses a wrong token, a missing header, and a token of the wrong length', () => {
    expect(isAuthorisedCron(request('Bearer nope'), secret)).toBe(false);
    expect(isAuthorisedCron(request(), secret)).toBe(false);
    expect(isAuthorisedCron(request(`Bearer ${secret}x`), secret)).toBe(false);
  });

  /*
   * The dangerous default. An unset `CRON_SECRET` compared against an unset
   * header is two empty strings, which is equal — and the endpoint that mails
   * the school's whole content to anyone who asks would be open on the public
   * internet.
   */
  it('refuses everybody when no secret is configured, rather than everybody through', () => {
    expect(isAuthorisedCron(request('Bearer '), '')).toBe(false);
    expect(isAuthorisedCron(request(), '')).toBe(false);
    expect(isAuthorisedCron(request('Bearer   '), '   ')).toBe(false);
  });
});

describe('the schedule', () => {
  const VERCEL = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../vercel.json', import.meta.url)), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };

  it('fires on the 1st of the month, at the route that sends it', () => {
    const cron = VERCEL.crons?.find((entry) => entry.path.includes('monthly-backup'));
    expect(cron, 'vercel.json has no monthly-backup cron').toBeDefined();

    const [minute, hour, dayOfMonth, month, dayOfWeek] = cron!.schedule.split(/\s+/);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    // The 1st, every month, whatever weekday it lands on. `*` here would be a
    // daily email of the whole database.
    expect(dayOfMonth).toBe('1');
    expect(month).toBe('*');
    expect(dayOfWeek).toBe('*');
  });

  it('points at a route that exists', () => {
    const cron = VERCEL.crons!.find((entry) => entry.path.includes('monthly-backup'))!;
    const file = fileURLToPath(new URL(`../../pages${cron.path}.ts`, import.meta.url));
    expect(() => readFileSync(file, 'utf8')).not.toThrow();
  });
});

describe('the attachment ceiling', () => {
  it('sits under what Resend accepts, rather than at it', () => {
    // Resend's limit is 40 MB across the whole message, and base64 inflates by
    // a third — so the ceiling on the raw bytes has to leave room for both.
    expect(MAX_ATTACHMENT_BYTES).toBeLessThan((40 * 1024 * 1024 * 3) / 4);
  });
});
