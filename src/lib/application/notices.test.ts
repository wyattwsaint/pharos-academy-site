import { describe, expect, it } from 'vitest';

import type { Mail } from '../backup/monthly.js';
import { CATALOGUE } from '../courses/catalogue.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import {
  applicationCost,
  faithKey,
  type ApplicationFields,
  type PaymentMethod,
} from './application.js';
import { offeringsOf } from './offerings.js';
import { classTally } from './tally.js';
import {
  applicationNotification,
  deliverApplication,
  refusedSubmissionNotice,
  type ApplicationSubmission,
} from './notices.js';
import { REFERENCE_PATTERN, applicationReference } from './reference.js';

/**
 * What leaves the site when an application arrives (#32 AC 4, 5, 6).
 *
 * The school's own copy is asserted against what #18 §11 says it receives —
 * the selections with units and prices, the Statement of Faith record, the
 * amount owed, the conversation flag and the tally — because "the school was
 * notified" is not the criterion; being able to act on the notification is.
 */

const OFFERINGS = offeringsOf(CATALOGUE);
const POST_TO = '9 Sherwood Drive\nEnola, PA 17025';
const PAY_AT = 'https://secure.myvanco.com/YNA9/campaign/C-12345';
/** A row, and what it calls itself — the emails carry the code, never the uuid (#218). */
const ROW_ID = '0f8b3a41-6c2d-4f7e-9a10-b5c6d7e8f901';
const REFERENCE = applicationReference(ROW_ID);

function fields(over: Partial<ApplicationFields> = {}): ApplicationFields {
  return {
    familyName: 'Okonkwo',
    email: 'okonkwo@example.com',
    children: [{ name: 'Ada', age: '13', offeringKeys: ['algebra-1:year'] }],
    faith: { [faithKey('Father', 'read')]: 'yes', [faithKey('Mother', 'agree')]: 'no' },
    objections: '',
    agreements: {},
    ...over,
  };
}

function submission(over: Partial<ApplicationSubmission> = {}): ApplicationSubmission {
  const values = over.values ?? fields();
  return {
    values,
    cost: applicationCost(values, OFFERINGS, SEEDED_MONEY_SETTINGS),
    settings: SEEDED_MONEY_SETTINGS,
    tally: classTally(
      [
        {
          id: 'a1',
          familyName: values.familyName,
          receivedAt: new Date('2026-09-01T10:00:00Z'),
          state: 'submitted',
          children: values.children,
        },
      ],
      OFFERINGS,
    ),
    flagged: false,
    reference: REFERENCE,
    paymentMethod: 'check',
    ...over,
  };
}

/**
 * One submission, delivered, with both messages read back.
 *
 * The two emails are asserted together rather than one per test because the
 * thing #221 is actually about is that they agree: a school told to expect an
 * envelope and a family told to pay online is the same submission saying two
 * things, and a test that opens only one of them cannot see it.
 */
async function delivered(
  method: PaymentMethod,
  options: { payOnlineAt: string; over?: Partial<ApplicationSubmission> } = {
    payOnlineAt: PAY_AT,
  },
): Promise<{ toSchool: Mail; toFamily: Mail }> {
  const mailer = recorder();
  await deliverApplication(submission({ paymentMethod: method, ...options.over }), {
    sender: mailer.send,
    to: ['jill@example.com'],
    from: 'site@example.com',
    postTo: POST_TO,
    payOnlineAt: options.payOnlineAt,
    schoolEmail: 'school@example.com',
    site: 'https://pharosacademy.net',
  });

  return {
    toSchool: mailer.sent.find((mail) => mail.to === 'jill@example.com')!,
    toFamily: mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!,
  };
}

/** A sender that keeps what it was handed, and one that refuses everything. */
function recorder(): { sent: Mail[]; send: (mail: Mail) => Promise<void> } {
  const sent: Mail[] = [];
  return {
    sent,
    send: async (mail) => {
      sent.push(mail);
    },
  };
}

/** The amount at the end of an itemized line, and the column it ends at. */
function amountColumns(text: string): number[] {
  return text
    .split('\n')
    .filter((line) => /^ {2}\S.*\s\$[\d,.]+$|^ {2}\S.*\s-\$[\d,.]+$/.test(line))
    .map((line) => line.length);
}

describe('the school’s copy', () => {
  it('carries the selections with their units and prices, and the amount owed', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: '',
    });

    expect(mail.to).toBe('jill@example.com');
    expect(mail.text).toContain('Algebra 1 (full year)');
    // $15/hour × 1 hour × 56 meetings across the two day tracks, from the
    // seeded settings — the figure the family was shown, not one this module
    // knows.
    expect(mail.text).toMatch(/^ {2}Tuition {2,}\$840$/m);
    // The credit is shown taking the deposits off, rather than the tuition
    // arriving already netted: a family reading $740 with no line explaining it
    // cannot check the arithmetic, and neither can the office.
    expect(mail.text).toMatch(/^ {2}Registration {2,}\$25$/m);
    expect(mail.text).toMatch(/^ {2}Deposits \(1 class\) {2,}\$100$/m);
    expect(mail.text).toMatch(/^ {2}Deposit credit against tuition {2,}-\$100$/m);
    // One total: $25 + $100 + $840 − $100.
    expect(mail.text).toMatch(/^ {2}TOTAL {2,}\$865$/m);
    expect(mail.text).toContain('Envelope to expect: $865 — the whole amount.');
  });

  it('carries the Statement of Faith record, answered cells only', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: '',
    });

    expect(mail.text).toContain('Father: read — yes');
    expect(mail.text).toContain('Mother: agree — no');
    // A household with no legal guardian left that column alone; the email says
    // nothing about it rather than printing three "not answered" lines.
    expect(mail.text).not.toContain('Legal guardian');
  });

  it('raises the conversation flag where it will be read (AC 5)', () => {
    const flagged = submission({
      values: fields({ objections: 'Article 9, on baptism.' }),
      flagged: true,
    });
    const mail = applicationNotification(flagged, {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: '',
    });

    expect(mail.subject).toContain('conversation flag');
    expect(mail.text.indexOf('CONVERSATION FLAG')).toBeLessThan(mail.text.indexOf('has applied'));
    expect(mail.text).toContain('Article 9, on baptism.');
    // And it is not a rejection, in the words the school reads.
    expect(mail.text).toContain('not a refusal');
  });

  it('carries the tally this application is counted in (AC 1)', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: '',
    });

    expect(mail.text).toContain('THE CLASS TALLY');
    expect(mail.text).toContain('Algebra 1: 1');
  });

  /**
   * The office matches a Vanco payment to an application by hand (ADR-0013), so
   * the code in this email is the one the family typed into the giving page —
   * which it can only be if it is also the code their own email carries (#218).
   */
  it('names the application by the code the family was given, not by its uuid', async () => {
    const mailer = recorder();
    await deliverApplication(submission(), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    const toSchool = mailer.sent.find((mail) => mail.to === 'jill@example.com')!;
    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(REFERENCE).toMatch(REFERENCE_PATTERN);
    expect(toSchool.text).toContain(`Reference:  ${REFERENCE}`);
    // On the family's invoice, under the total the reference belongs to (#221).
    expect(toFamily.text).toContain(`Reference: ${REFERENCE}`);
    for (const mail of [toSchool, toFamily]) expect(mail.text).not.toContain(ROW_ID);
  });

  it('says loudly when the email is the only copy that exists', () => {
    const lost = applicationNotification(submission({ reference: null }), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: '',
    });

    expect(lost.text).toContain('could NOT be saved');
  });
});

describe('what the family is told', () => {
  it('goes to every address in the settings list, and only those (AC 6)', async () => {
    const mailer = recorder();
    await deliverApplication(submission(), {
      sender: mailer.send,
      to: ['jill@example.com', 'george@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(mailer.sent.filter((mail) => mail.subject.startsWith('Application')).map((mail) => mail.to)).toEqual([
      'jill@example.com',
      'george@example.com',
    ]);
  });

  it('confirms a stored application with what to post and where', async () => {
    const mailer = recorder();
    const outcome = await deliverApplication(submission(), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.familyWasTold).toBe('confirmation');
    // A configured sender is a delivered send, with nothing to report (#136):
    // this is the direction the two failures below are measured against.
    expect(outcome.notified).toBe(true);
    expect(outcome.notificationError).toBeUndefined();
    expect(outcome.confirmed).toBe(true);
    expect(outcome.confirmationError).toBeUndefined();

    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toFamily.text).toContain('A place is held');
    // The email says "check" (#113). The scanner reads the source and this
    // reads the message, which is the half that catches a word rebuilt from
    // pieces the scanner sees separately.
    expect(toFamily.text).toContain('Please post a check');
    expect(toFamily.text).not.toMatch(/cheque/i);
    // No response-time promise, here or anywhere the school speaks (#9).
    expect(toFamily.text).not.toMatch(/\b(within|in) \d+ (hours|days|working days)\b/);
  });

  /**
   * The invoice, in the family's own copy (#221).
   *
   * The three amounts used to be three paragraphs of prose and no total
   * anywhere: a family scanning for "how much, and how do I pay it" had to
   * assemble a number the email never wrote down.
   */
  it('reads as an invoice — itemized, totalled, with the status and the reference', async () => {
    const { toFamily } = await delivered('check', { payOnlineAt: '' });

    expect(toFamily.text).toMatch(/^ {2}Registration {2,}\$25$/m);
    expect(toFamily.text).toMatch(/^ {2}Deposits \(1 class\) {2,}\$100$/m);
    expect(toFamily.text).toMatch(/^ {2}Tuition {2,}\$840$/m);
    expect(toFamily.text).toMatch(/^ {2}Deposit credit against tuition {2,}-\$100$/m);
    expect(toFamily.text).toMatch(/^ {2}TOTAL {2,}\$865$/m);
    expect(toFamily.text).toContain('Due in full — you told us you are paying by check.');
    expect(toFamily.text).toContain(`Reference: ${REFERENCE}`);

    // Warm at the top and the tail; the invoice is the middle, not the message.
    expect(toFamily.text.startsWith('Thank you — we have your application, Okonkwo.')).toBe(true);
    expect(toFamily.text).toContain('A place is held');
  });

  /** In a plain-text client the alignment *is* the table, so it is asserted. */
  it('lines the amounts up so the block reads as a table', async () => {
    const { toFamily, toSchool } = await delivered('check', { payOnlineAt: '' });

    for (const text of [toFamily.text, toSchool.text]) {
      const ends = amountColumns(text);
      expect(ends.length).toBeGreaterThanOrEqual(5);
      expect(new Set(ends).size).toBe(1);
    }
  });

  /**
   * One instruction, matching what the family chose (#221, #219).
   *
   * The email is the copy that outlives the confirmation screen, so a family
   * given both a link and an address for the same money is the school
   * contradicting itself in the half that gets kept.
   */
  it('gives a family paying online the giving page and the amount, and no address', async () => {
    const { toFamily, toSchool } = await delivered('online');

    expect(toFamily.text).toContain(PAY_AT);
    expect(toFamily.text).toContain('$865');
    expect(toFamily.text).toContain('Due in full — you told us you are paying online.');
    expect(toFamily.text).not.toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toContain('Please post a check');
    expect(toFamily.text).not.toMatch(/cheque/i);
    expect(toFamily.text).not.toMatch(/\b(within|in) \d+ (hours|days|working days)\b/);

    // And the school is told the same thing, from the same writer.
    expect(toSchool.text).toMatch(/^ {2}TOTAL {2,}\$865$/m);
    expect(toSchool.text).toContain('Due in full — you told us you are paying online.');
    expect(toSchool.text).toContain(
      'Envelope to expect: nothing — the family said they are paying online.',
    );
  });

  it('gives a family paying by check the address and the whole total, and no link', async () => {
    const { toFamily, toSchool } = await delivered('check');

    expect(toFamily.text).toContain('Please post a check for $865');
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toContain(PAY_AT);
    // Never the deposits alone — the envelope is the whole amount or nothing.
    expect(toFamily.text).not.toContain('Please post a check for $100');

    expect(toSchool.text).toContain('Envelope to expect: $865 — the whole amount.');
    expect(toSchool.text).not.toContain('the deposits only');
  });

  /**
   * A giving page that does not exist cannot be the instruction, whatever the
   * family answered — the alternative is an email whose one instruction is a
   * blank line where a link should be.
   */
  it('falls back to a check when the school has configured no giving page', async () => {
    const { toFamily, toSchool } = await delivered('online', { payOnlineAt: '' });

    expect(toFamily.text).toContain('Please post a check for $865');
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toSchool.text).toContain('Envelope to expect: $865 — the whole amount.');
  });

  it('asks a family who chose no classes for nothing at all', async () => {
    const noClasses = fields({ children: [{ name: 'Ada', age: '13', offeringKeys: [] }] });
    const { toFamily, toSchool } = await delivered('online', {
      payOnlineAt: PAY_AT,
      over: { values: noClasses },
    });

    // "Pay $0 online" and "post a check for $0.00" are both an instruction to
    // do nothing, written as though it were something.
    expect(toFamily.text).toContain('Nothing is due yet');
    expect(toFamily.text).not.toContain(PAY_AT);
    expect(toFamily.text).not.toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toMatch(/check for \$0/);
    expect(toSchool.text).toContain('Envelope to expect: nothing');
    expect(toSchool.text).not.toMatch(/Envelope to expect: \$0/);
  });

  it('tells the family when the submission was refused, rather than letting it age out (AC 4)', async () => {
    const mailer = recorder();
    const outcome = await deliverApplication(submission({ reference: null }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.familyWasTold).toBe('refusal');
    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain('did not reach us');
    expect(toFamily.text).toContain('https://pharosacademy.net/admissions/apply');
    // What they chose, so sending it again is a copy rather than a memory test.
    expect(toFamily.text).toContain('Algebra 1');
    // And it still says nothing about money (#221): there is no application to
    // invoice, and asking a family to pay for one that did not reach us is the
    // one thing worse than the failure itself.
    expect(toFamily.text).not.toMatch(/\$\d/);
    expect(toFamily.text).not.toMatch(/TOTAL|check|giving page/);
  });

  it('still mentions the conversation flag gently, after the money (#221)', async () => {
    const { toFamily } = await delivered('online', {
      payOnlineAt: PAY_AT,
      over: { values: fields({ objections: 'Article 9, on baptism.' }), flagged: true },
    });

    expect(toFamily.text).toContain('would like to talk about');
    expect(toFamily.text).toContain('does not hold your application up');
    // Gently: it is the tail of the message, not the headline the school's copy
    // leads with.
    expect(toFamily.text.indexOf('would like to talk about')).toBeGreaterThan(
      toFamily.text.indexOf('TOTAL'),
    );
  });

  it('reports a refused send instead of throwing, on either message', async () => {
    const outcome = await deliverApplication(submission(), {
      sender: async () => {
        throw new Error('Resend refused the email (422)');
      },
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('422');
    expect(outcome.confirmed).toBe(false);
    // Both errors, not just the school's: a thrown send is recorded against the
    // message it refused rather than swallowed (#136).
    expect(outcome.confirmationError).toContain('422');
    expect(outcome.confirmationError).toContain('okonkwo@example.com');
  });

  it('treats a deployment with no mailer as a school that was not told', async () => {
    const outcome = await deliverApplication(submission(), {
      sender: undefined,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('RESEND_API_KEY');
    // And the family's own copy, which is the half that used to pass unnoticed:
    // an absent mailer is an undelivered confirmation with a stated reason, not
    // a quiet success (#136).
    expect(outcome.confirmed).toBe(false);
    expect(outcome.confirmationError).toContain('No mailer is configured');
    expect(outcome.confirmationError).toContain('GMAIL_APP_PASSWORD');
  });

  it('names the address to write to when nothing else worked', () => {
    const notice = refusedSubmissionNotice(submission({ reference: null }), {
      from: 'site@example.com',
      schoolEmail: 'jkilker@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(notice.text).toContain('jkilker@example.com');
  });
});
