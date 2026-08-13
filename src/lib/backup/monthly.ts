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
 * The same ceiling, for a deployment sending through Gmail (#64).
 *
 * Gmail's limit is 25 MB for the *whole encoded message*, not for the file, so
 * base64's extra third comes out of the same allowance rather than sitting on
 * top of it: 25 MB of message is about 18 MB of archive, and this leaves room
 * for the headers. It is lower than Resend's, which is one of the costs of the
 * Gmail route and the reason the ceiling travels on the mailer instead of being
 * a single constant the cron reads.
 */
export const MAX_GMAIL_ATTACHMENT_BYTES = 17 * 1024 * 1024;

/**
 * What to set, named in the one message a person reads when nothing was sent.
 *
 * Both routes, because either one is a complete answer and a message naming
 * only the other sends whoever is reading it to the wrong dashboard. See
 * `configuredMailer`.
 */
export const MAILER_ENV_HINT = 'GMAIL_APP_PASSWORD, or RESEND_API_KEY';

/**
 * Why nothing was sent on a deployment with no credentials (#136).
 *
 * One sentence, exported, because two places say it: the refused send that gets
 * stamped on the row, and the standing warning across the admin. A second
 * spelling of it would be a screen whose warning and whose rows disagree about
 * what is wrong.
 */
export const NO_MAILER_CONFIGURED = `No mailer is configured on this deployment (${MAILER_ENV_HINT}).`;

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

/**
 * Send a batch and report whether **any** of it landed.
 *
 * "Any" rather than "all" because the school's notification list is a list: two
 * addresses where one bounces is a school that was told, and reporting that as
 * a failure would put a false alarm on the admin screen for ever.
 *
 * An absent sender — a deployment with no mail credentials — is a refused send
 * rather than a quiet success, because both mean the school was not told.
 *
 * It lives beside `Mail` and `Sender` rather than in either of the two forms
 * that use it, so the inquiry (#25) and the application (#32) cannot drift into
 * two different answers to "did that email go?".
 */
export async function sendAll(
  sender: Sender | undefined,
  mails: readonly Mail[],
): Promise<{ sent: boolean; error?: string }> {
  if (!sender) {
    return { sent: false, error: NO_MAILER_CONFIGURED };
  }
  if (mails.length === 0) {
    return { sent: false, error: 'There is nobody to send this to.' };
  }

  let sent = false;
  let error: string | undefined;
  for (const mail of mails) {
    try {
      await sender(mail);
      sent = true;
    } catch (failure) {
      error ??= `${mail.to}: ${describeFailure(failure)}`;
    }
  }
  return { sent, error: sent && !error ? undefined : error };
}

/** An error as a line somebody can act on, whatever was actually thrown. */
export function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
 * A Gmail sender over SMTP, for a deployment with no verified domain (#64).
 *
 * This exists because the Resend route needs DNS records on
 * `pharosacademy.net`, and those same records carry the school's mail
 * forwarding and the site that is still live at that domain. Gmail needs an app
 * password and nothing else, so the school's forms can stop swallowing families
 * in silence without anybody editing DNS on the day.
 *
 * `nodemailer` rather than a hand-written SMTP client, which is a departure
 * from the reasoning above `resendSender` and worth saying out loud. That
 * reasoning holds where the whole of the API is one POST. SMTP is a
 * conversation, and an attached export is a multipart MIME document with
 * base64 folded at 76 columns and leading dots escaped — a monthly job is
 * exactly the wrong place to find out that this file got one of those wrong.
 * The package has no dependencies of its own, so what there is to keep patched
 * is one thing.
 *
 * Imported inside the send rather than at the top of the file, so a deployment
 * on the Resend route never loads it and a page importing this module is not
 * importing an SMTP client.
 */
export function gmailSender(user: string, appPassword: string): Sender {
  return async (mail) => {
    const { createTransport } = await import('nodemailer');

    const transport = createTransport({
      service: 'gmail',
      auth: {
        user,
        // Google prints the app password in four spaced groups and people paste
        // what they were shown. The spaces are presentation; the password is
        // sixteen characters, and a pasted one with them left in fails as a
        // wrong password with nothing to say why.
        pass: appPassword.replace(/\s+/g, ''),
      },
    });

    try {
      await transport.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.attachment
          ? { attachments: [{ filename: mail.attachment.filename, content: mail.attachment.bytes }] }
          : {}),
      });
    } catch (failure) {
      throw new Error(`Gmail refused the email: ${describeGmailFailure(failure)}`);
    } finally {
      // One connection per send, closed here. A serverless instance is reused
      // between requests and a pool held across them is a socket Gmail has
      // already dropped by the next submission.
      transport.close();
    }
  };
}

/**
 * Gmail's refusals, in words that name what to go and change.
 *
 * `535` is the one that will actually happen, and Google's own text for it
 * ("Username and Password not accepted") sends people to reset the mailbox
 * password, which is not the credential in play here.
 */
function describeGmailFailure(error: unknown): string {
  const said = describeFailure(error);
  if (/\b535\b|BadCredentials|Username and Password not accepted/i.test(said)) {
    return `${said} — GMAIL_USER and GMAIL_APP_PASSWORD are a Google *app password*, not the mailbox password, and the account needs 2-Step Verification switched on before Google will issue one.`;
  }
  return said;
}

/** A configured way to send, and the limits that come with it. */
export type Mailer = {
  sender: Sender;
  /** The `From` header every message on this deployment carries. */
  from: string;
  /** The largest archive this route will carry, for the monthly send. */
  maxAttachmentBytes: number;
};

/**
 * The four values either route is configured by.
 *
 * Spelled out by the caller rather than read from `import.meta.env` in here,
 * because Vite replaces `import.meta.env.SOMETHING` where it is *written*: a
 * page handing over the whole object is a page whose credentials may or may not
 * survive the build, and the failure is a silent absent sender in production
 * that nothing local reproduces.
 */
export type MailEnv = {
  GMAIL_USER?: unknown;
  GMAIL_APP_PASSWORD?: unknown;
  RESEND_API_KEY?: unknown;
  MAIL_FROM?: unknown;
};

/**
 * Which mailer this deployment has, if it has one.
 *
 * One resolver for all four things that send — the inquiry (#25), the
 * application (#32), the volunteer form (#30) and the monthly export (#33) — so
 * that moving the school from Gmail to Resend later is an environment change
 * and not a fifth edit somebody forgets to make.
 *
 * Gmail wins where both are set. A deployment carrying both is one mid-move,
 * and the domain sender is the one being added; preferring Resend would switch
 * every family-facing email over the moment the key was pasted in, which is
 * before anybody has confirmed the domain actually sends.
 *
 * Returning `undefined` for a deployment with no credentials is deliberate and
 * is the case every form already handles honestly: the record is kept, and the
 * screen says nobody was emailed. The e2e suite runs in exactly this state.
 */
export function configuredMailer(env: MailEnv): Mailer | undefined {
  const gmailUser = text(env.GMAIL_USER);
  const gmailPassword = text(env.GMAIL_APP_PASSWORD);
  const resendKey = text(env.RESEND_API_KEY);
  const from = text(env.MAIL_FROM);

  if (gmailUser && gmailPassword) {
    return {
      sender: gmailSender(gmailUser, gmailPassword),
      // Gmail rewrites `From` to the authenticated account unless the address
      // is one the mailbox has verified under "Send mail as", so an unset
      // MAIL_FROM is the honest default rather than a missing configuration:
      // it is what the family will see either way.
      from: from || gmailUser,
      maxAttachmentBytes: MAX_GMAIL_ATTACHMENT_BYTES,
    };
  }

  // Resend has no account address to fall back on, so a key with no MAIL_FROM
  // is not a mailer — it is a send that would be refused at the far end.
  if (resendKey && from) {
    return {
      sender: resendSender(resendKey),
      from,
      maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    };
  }

  return undefined;
}

/** A configuration value as a usable string, or empty if it is anything else. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
