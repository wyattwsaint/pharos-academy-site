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
    });

    expect(mail.to).toBe('jill@example.com');
    expect(mail.text).toContain('Algebra 1 (full year)');
    // $15/hour × 1 hour × 56 meetings across the two day tracks, from the
    // seeded settings — the figure the family was shown, not one this module
    // knows.
    expect(mail.text).toContain('$840');
    expect(mail.text).toContain('$125'); // registration plus one deposit
  });

  it('carries the Statement of Faith record, answered cells only', () => {
    const mail = applicationNotification(submission(), {
      to: 'jill@example.com',
      from: 'site@example.com',
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
    const mail = applicationNotification(flagged, { to: 'jill@example.com', from: 'site@example.com' });

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
    });

    expect(mail.text).toContain('THE CLASS TALLY');
    expect(mail.text).toContain('Algebra 1: 1');
  });

  it('says loudly when the email is the only copy that exists', () => {
    const lost = applicationNotification(submission({ reference: null }), {
      to: 'jill@example.com',
      from: 'site@example.com',
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
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.familyWasTold).toBe('confirmation');
    const toFamily = mailer.sent.find((mail) => mail.to === 'okonkwo@example.com')!;
    expect(toFamily.text).toContain('9 Sherwood Drive');
    expect(toFamily.text).toContain('A place is held');
    // No response-time promise, here or anywhere the school speaks (#9).
    expect(toFamily.text).not.toMatch(/\b(within|in) \d+ (hours|days|working days)\b/);
  });

  it('tells the family when the submission was refused, rather than letting it age out (AC 4)', async () => {
    const mailer = recorder();
    const outcome = await deliverApplication(submission({ reference: null }), {
      sender: mailer.send,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
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
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('422');
    expect(outcome.confirmed).toBe(false);
  });

  it('treats a deployment with no mailer as a school that was not told', async () => {
    const outcome = await deliverApplication(submission(), {
      sender: undefined,
      to: ['jill@example.com'],
      from: 'site@example.com',
      postTo: POST_TO,
      schoolEmail: 'school@example.com',
      site: 'https://pharosacademy.net',
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('RESEND_API_KEY');
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
