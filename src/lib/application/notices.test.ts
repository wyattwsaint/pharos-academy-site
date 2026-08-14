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
    paymentMethod: 'online',
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
      payOnlineAt: '',
    });

    expect(mail.to).toBe('jill@example.com');
    expect(mail.text).toContain('Algebra 1 (full year)');
    // $15/hour × 1 hour × 56 meetings across the two day tracks, from the
    // seeded settings — the figure the family was shown, not one this module
    // knows.
    expect(mail.text).toContain('$840');
    // $840 less the credited deposit — the tuition the school is owed.
    expect(mail.text).toContain('Tuition:       $740');
    // One lump sum, itemised above it: $25 + $100 + $740 (#219).
    expect(mail.text).toContain('All of it:     $865');
    // With no online link there is one way to pay, whatever the form said.
    expect(mail.text).toContain('They say they are posting a check for $865');
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
    expect(toFamily.text).toContain(`Your reference is ${REFERENCE}.`);
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
   * The email and the page agree about what is paid online (#149, #187).
   *
   * The confirmation is the copy the family keeps after the screen is closed, so
   * an email that says "post a check for the lot" beside a page that offered a
   * link is not a wording slip — it is the school being told two different
   * things by the same submission.
   */
  it('gives the family the online link, and the whole total to enter at it (#219)', async () => {
    const mailer = recorder();
    await deliverApplication(submission(), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: PAY_AT,
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain(PAY_AT);
    // One payment covering all three amounts, and the itemisation beside it.
    expect(toFamily.text).toContain('$865');
    expect(toFamily.text).toContain('$25 in registration');
    expect(toFamily.text).toContain('$100 in deposits');
    expect(toFamily.text).toContain('$740 in tuition');
    // The giving page carries no amount, so the email names the one to enter.
    expect(toFamily.text).toContain('please enter $865');
    expect(toFamily.text).toContain('A place is held');
    // A family paying online is not also sent to the post box.
    expect(toFamily.text).not.toContain('Please post a check');
    expect(toFamily.text).not.toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toMatch(/cheque/i);
    expect(toFamily.text).not.toMatch(/\b(within|in) \d+ (hours|days|working days)\b/);
  });

  it('asks a family who chose the check for the whole total, never the deposits (#219)', async () => {
    const mailer = recorder();
    await deliverApplication(submission({ values: fields({ paymentMethod: 'check' }) }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: PAY_AT,
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    // The whole of it in one envelope. The old split — the deposits by check,
    // the rest online — is what ADR-0017 reversed, and $100 alone is the number
    // this must never ask for.
    expect(toFamily.text).toContain('Please post a check for $865');
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toFamily.text).not.toContain('post a check for $100');
    // And the giving page is not offered beside it — they said what they were
    // doing, and the email answers the one they chose.
    expect(toFamily.text).not.toContain(PAY_AT);
  });

  it('does not send a family with no deposits to the postal address at all (#149)', async () => {
    const mailer = recorder();
    const noClasses = fields({ children: [{ name: 'Ada', age: '13', offeringKeys: [] }] });
    await deliverApplication(submission({ values: noClasses }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      payOnlineAt: PAY_AT,
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

  it('tells the school whether to watch the post, from what the family said (#219)', () => {
    const online = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
      payOnlineAt: PAY_AT,
    });

    // "Say", not "have": Vanco tells the site nothing, so the office is told
    // what the family stated and matches the money up by hand.
    expect(online.text).toContain('They say they are paying the $865 online');
    expect(online.text).toContain('Nothing to watch for in the post');
    expect(online.text).not.toMatch(/posting a check/);

    const byCheck = applicationNotification(
      submission({ values: fields({ paymentMethod: 'check' }) }),
      { to: 'jill@example.com', from: 'site@example.com', payOnlineAt: PAY_AT },
    );
    // The whole total in one envelope, which is the figure the office weighs
    // the check against — never the deposits alone.
    expect(byCheck.text).toContain('They say they are posting a check for $865 — watch for it.');
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
