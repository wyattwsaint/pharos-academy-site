import { timingSafeEqual } from 'node:crypto';

import { getSchoolDetails } from '../admin/school-details.js';
import type { Db } from '../db/client.js';
import { SCHOOL_NAME } from '../site.js';
import { buildExport } from './export.js';

/**
 * The backup that arrives whether or not anybody remembers it (#33).
 *
 * `/admin/backup` has a button, and a button is a backup nobody clicks:
 * realistically the school's only held copy would be whatever they downloaded
 * once during training, if that. So the same archive is mailed to the school on
 * the 1st of every month, and the held copy is a thing that happens rather than
 * a thing somebody has to do.
 *
 * It is the *same* archive — one `buildExport`, called from both places — for
 * the same reason: "the emailed copy is what the button gives you" is an
 * acceptance criterion, and two builders is how it stops being true.
 *
 * The recipient is read out of the school details at send time, not written
 * here. The address the school reaches its own backup at is the address the
 * school can change from its own settings screen, which matters on the day
 * whoever owns the Pharos Gmail leaves.
 */

/**
 * The largest archive this will hand to Resend.
 *
 * Resend caps a message at 40 MB and base64 inflates the bytes by a third, so
 * the real ceiling on the archive is 30 MB and this sits under it. Passing the
 * limit is not a bug to be swallowed: the archive grows by every retained policy
 * version forever, so one month this *will* be hit, and the failure has to name
 * itself while somebody can still act on it.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * One message, described in the terms this codebase cares about.
 *
 * The attachment is optional because there are now two things that send mail
 * from this site — the monthly backup, which is nothing *but* an attachment,
 * and the volunteer form (#30), which is a few lines of text somebody typed.
 * One `Sender` for both, so there is one place that knows how to talk to
 * Resend and one place to fix when it changes.
 */
export type Mail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachment?: { filename: string; bytes: Buffer };
};

/**
 * Whatever actually puts a message on the wire.
 *
 * A parameter rather than an import, so the tests assert the mail this code
 * decided to send instead of asserting that a module was called with something.
 */
export type Sender = (mail: Mail) => Promise<void>;

export type MonthlySendResult = {
  to: string;
  filename: string;
  bytes: number;
};

/**
 * Build the archive and send it.
 *
 * `at` is a parameter for the same reason it is one on `buildExport`: the
 * archive is reproducible, so a test can compare what was mailed against what
 * the button would have produced at the same instant, byte for byte.
 */
export async function sendMonthlyBackup(
  db: Db,
  options: { sender: Sender; from: string; at?: Date; maxBytes?: number },
): Promise<MonthlySendResult> {
  const { sender, from, at = new Date(), maxBytes = MAX_ATTACHMENT_BYTES } = options;

  const to = (await getSchoolDetails(db)).email.trim();
  if (!to) {
    throw new Error(
      'The school has no email address in its settings, so the monthly backup has nowhere to go. Set one on /admin/school-details.',
    );
  }

  const archive = await buildExport(db, at);
  if (archive.bytes.length > maxBytes) {
    throw new Error(
      `The backup archive is ${archive.bytes.length} bytes, which is too large to email (the limit is ${maxBytes}). The download on /admin/backup still works; the monthly send needs somewhere else to put a file this size.`,
    );
  }

  await sender({
    to,
    from,
    subject: `${SCHOOL_NAME} — website backup, ${at.toISOString().slice(0, 10)}`,
    text: body(archive.filename),
    attachment: { filename: archive.filename, bytes: archive.bytes },
  });

  return { to, filename: archive.filename, bytes: archive.bytes.length };
}

/**
 * A Resend sender over plain `fetch`.
 *
 * No SDK: the whole of the API being used is one POST with a base64 attachment,
 * and a dependency in the deployed function is a thing to keep patched for as
 * long as the school has a website.
 */
export function resendSender(apiKey: string, fetchImpl: typeof fetch = fetch): Sender {
  return async (mail) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        // Omitted entirely rather than sent empty when there is nothing to
        // attach — Resend rejects `attachments: []`.
        ...(mail.attachment
          ? {
              attachments: [
                {
                  filename: mail.attachment.filename,
                  content: mail.attachment.bytes.toString('base64'),
                },
              ],
            }
          : {}),
      }),
    });

    if (!response.ok) {
      // Carrying Resend's own words: a monthly job fails once a month, and
      // "the send failed" is not enough to fix it before the next one.
      const said = await response.text().catch(() => '');
      throw new Error(`Resend refused the email (${response.status}): ${said}`);
    }
  };
}

/**
 * Is this request the scheduler?
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The endpoint behind
 * this mails the school's entire content to the settings address, so an
 * unauthenticated one is a way for anyone on the internet to make the site do
 * that on demand — and a way to run the whole export as often as they like.
 *
 * An unset secret refuses *everybody*. The default that reads as harmless — an
 * empty secret compared against an absent header — is two empty strings, which
 * are equal, and the endpoint would be open precisely on the deployment where
 * nobody configured it.
 */
export function isAuthorisedCron(request: Request, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? '';
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;

  const offered = Buffer.from(match[1].trim(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  // Length is not a secret, and `timingSafeEqual` throws on a mismatch.
  if (offered.length !== wanted.length) return false;
  return timingSafeEqual(offered, wanted);
}

/**
 * What the school reads on the 1st.
 *
 * Addressed to somebody who did not ask for this email and will get eleven more
 * like it, so it says what to do with it in two sentences and does not explain
 * itself further.
 */
function body(filename: string): string {
  return `This is the monthly backup of everything on the ${SCHOOL_NAME} website that the school can edit — the classes, the people, the announcements, the policy documents and the school's own details.

It is attached as ${filename}. Nothing in it needs the website, a database or a password to read: unzip it and open the files. There is a README inside that says what is where.

Keep the newest copy somewhere that is not this mailbox. If this email ever stops arriving, the same file is available from the Backup screen in the website's admin.

You do not need to reply to this, and you do not need to do anything with it today.`;
}
