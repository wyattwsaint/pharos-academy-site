import { describe, expect, it } from 'vitest';

import type { Mail } from '../backup/monthly.js';
import { CATALOGUE } from '../courses/catalogue.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { applicationCost, faithKey, type ApplicationFields } from './application.js';
import { offeringsOf } from './offerings.js';
import { classTally } from './tally.js';
import {
  applicationNotification,
  deliverApplication,
  refusedSubmissionNotice,
  type ApplicationSubmission,
} from './notices.js';

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
    reference: 'ref-1',
    ...over,
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

describe('the school’s copy', () => {
  it('carries the selections with their units and prices, and the amount owed', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payRegistrationAt: '',
    });

    expect(mail.to).toBe('jill@example.com');
    expect(mail.text).toContain('Algebra 1 (full year)');
    // $15/hour × 1 hour × 56 meetings across the two day tracks, from the
    // seeded settings — the figure the family was shown, not one this module
    // knows.
    expect(mail.text).toContain('$840');
    expect(mail.text).toContain('$125'); // registration plus one deposit
    expect(mail.text).toContain('Check they are posting: $125');
  });

  it('carries the Statement of Faith record, answered cells only', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payRegistrationAt: '',
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
      payRegistrationAt: '',
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
      payRegistrationAt: '',
    });

    expect(mail.text).toContain('THE CLASS TALLY');
    expect(mail.text).toContain('Algebra 1: 1');
  });

  it('says loudly when the email is the only copy that exists', () => {
    const lost = applicationNotification(submission({ reference: null }), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payRegistrationAt: '',
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
      payRegistrationAt: '',
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
      payRegistrationAt: '',
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
   * The email and the page agree about how the registration fee is paid (#149).
   *
   * The confirmation is the copy the family keeps after the screen is closed, so
   * an email that says "post a check for the lot" beside a page that offered a
   * link is not a wording slip — it is the school being told two different
   * things by the same submission.
   */
  it('gives the family the online link when the school has one, for the registration only', async () => {
    const mailer = recorder();
    await deliverApplication(submission(), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payRegistrationAt: PAY_AT,
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain(PAY_AT);
    expect(toFamily.text).toContain('$25'); // the registration, online
    // The deposits are still the school's, and still a check to the address.
    expect(toFamily.text).toContain('$100');
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toFamily.text).toContain('A place is held');
    // And it no longer asks for a check covering the registration as well.
    expect(toFamily.text).not.toContain('Please post a check for $125');
    expect(toFamily.text).not.toMatch(/cheque/i);
    expect(toFamily.text).not.toMatch(/\b(within|in) \d+ (hours|days|working days)\b/);
  });

  it('does not send a family with no deposits to the postal address at all (#149)', async () => {
    const mailer = recorder();
    const noClasses = fields({ children: [{ name: 'Ada', age: '13', offeringKeys: [] }] });
    await deliverApplication(submission({ values: noClasses }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payRegistrationAt: PAY_AT,
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain(PAY_AT);
    // Nothing is owed by check, so the address is not a payment instruction and
    // "post a check for $0.00" is an envelope nobody should mail.
    expect(toFamily.text).not.toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toMatch(/check for \$0/);
  });

  it('tells the school which part of the money is coming by check (#149)', () => {
    const online = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payRegistrationAt: PAY_AT,
    });

    // The school reconciles Vanco against this email by hand, so the line it
    // reads has to be the amount an envelope will actually contain — and it
    // says "offered", not "paid", because Vanco tells the site nothing.
    expect(online.text).toContain('Check they are posting: $100');
    expect(online.text).toContain('registration was offered online');
    expect(online.text).not.toContain('Check they are posting: $125');
  });

  it('tells the family when the submission was refused, rather than letting it age out (AC 4)', async () => {
    const mailer = recorder();
    const outcome = await deliverApplication(submission({ reference: null }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payRegistrationAt: '',
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.familyWasTold).toBe('refusal');
    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain('did not reach us');
    expect(toFamily.text).toContain('https://pharosacademy.net/admissions/apply');
    // What they chose, so sending it again is a copy rather than a memory test.
    expect(toFamily.text).toContain('Algebra 1');
  });

  it('reports a refused send instead of throwing, on either message', async () => {
    const outcome = await deliverApplication(submission(), {
      sender: async () => {
        throw new Error('Resend refused the email (422)');
      },
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payRegistrationAt: '',
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
      payRegistrationAt: '',
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
