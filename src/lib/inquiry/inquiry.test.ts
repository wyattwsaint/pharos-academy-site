import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { Mail } from '../backup/monthly.js';
import {
  inquiryConfirmation,
  inquiryNotification,
  parseInquiry,
  RECEIVED_MESSAGE,
  submitInquiry,
  type InquiryFields,
} from './inquiry.js';

/**
 * The inquiry's rules (#25).
 *
 * Every acceptance criterion that is a property of the decision rather than of
 * a page is proved here: that a phone field does not exist, that no copy on
 * this path promises a response time, that the confirmation carries the three
 * links it owes a family, and — the one that matters most — that persisting and
 * emailing cannot lose one another.
 */

const FIELDS: InquiryFields = {
  name: 'Ruth Marsh',
  email: 'ruth@example.com',
  ages: '6, 9 and 13',
  message: 'Is there room in Latin?',
};

/** A sender that records what it was handed. */
function recorder() {
  const sent: Mail[] = [];
  return { sent, send: async (mail: Mail) => void sent.push(mail) };
}

/** A sender that always refuses, the way Resend does on a bad key. */
const refuses = async () => {
  throw new Error('Resend refused the email (401): invalid api key');
};

const options = (extra: Partial<Parameters<typeof submitInquiry>[1]>) => ({
  store: async () => 'row-1',
  sender: undefined,
  to: ['jkilker@enolacog.com'],
  from: 'site@pharosacademy.net',
  site: 'https://www.pharosacademy.net',
  schoolEmail: 'jkilker@enolacog.com',
  ...extra,
});

describe('the fields', () => {
  it('asks for a name, an email and the children’s ages, and nothing else required', () => {
    const { errors } = parseInquiry(form({ name: '', email: '', ages: '', message: '' }));
    expect(Object.keys(errors).sort()).toEqual(['ages', 'email', 'name']);
  });

  it('accepts a submission with no message at all', () => {
    const { errors, values } = parseInquiry(form({ ...FIELDS, message: '' }));
    expect(errors).toEqual({});
    expect(values.message).toBe('');
  });

  it('keeps the ages exactly as they were typed, because families have several children', () => {
    // A dropdown could not hold this, which is the whole reason the field is
    // free text (CONTEXT.md, "age band" — the school serves a fourteen-year span).
    const { values } = parseInquiry(form({ ...FIELDS, ages: '4, 7, 11 and one on the way' }));
    expect(values.ages).toBe('4, 7, 11 and one on the way');
  });

  it('rejects an address that is obviously not one', () => {
    const { errors } = parseInquiry(form({ ...FIELDS, email: 'ruth at example' }));
    expect(errors.email).toBeTruthy();
  });

  it('gives back everything typed when it refuses, so nothing is retyped', () => {
    const { values } = parseInquiry(form({ ...FIELDS, email: '' }));
    expect(values.name).toBe('Ruth Marsh');
    expect(values.ages).toBe('6, 9 and 13');
    expect(values.message).toBe('Is there room in Latin?');
  });

  /**
   * #25 AC 6, as a test rather than as an intention.
   *
   * A phone number raises the perceived commitment of the form more than any
   * other field, and a parent who wants a call says so. The form markup is read
   * from disk because that is the surface a field would actually be added to.
   */
  it('has no phone field, in the parser or in the form', async () => {
    const parsed = parseInquiry(form({ ...FIELDS, phone: '717-555-0142' } as never));
    expect(Object.keys(parsed.values)).toEqual(['name', 'email', 'ages', 'message']);

    const markup = await readFile('src/components/InquiryForm.astro', 'utf8');
    expect(markup).not.toMatch(/name="phone"/);
    expect(markup).not.toMatch(/type="tel"/);
    expect(markup).not.toMatch(/autocomplete="tel"/);
  });
});

/**
 * #25 AC 5, and it is a scan rather than a spot check: the promise could be
 * added to any of the three strings a family reads, and only one of them is on
 * a page somebody would think to look at.
 */
describe('the response-time promise', () => {
  const CLOCKS =
    /\b(within|in)\s+(a|an|one|two|three|24|48|72|\d+)\s*(hour|hours|day|days|week|weeks|business)/i;

  const everythingAFamilyReads = [
    RECEIVED_MESSAGE,
    inquiryConfirmation(FIELDS, { from: 'x@y.z', site: 'https://example.com' }).text,
    inquiryConfirmation(FIELDS, { from: 'x@y.z', site: 'https://example.com' }).subject,
  ];

  it('appears in none of the copy this module can put in front of a family', () => {
    for (const copy of everythingAFamilyReads) {
      expect(copy, copy).not.toMatch(CLOCKS);
    }
  });

  it('says only that we will get back to them', () => {
    expect(RECEIVED_MESSAGE).toBe('We’ll get back to you!');
  });
});

describe('the notification the school gets', () => {
  it('carries the name, the address and the ages in the body, not only in a header', () => {
    // A school office forwards these, and a forwarded message loses its
    // reply-to.
    const mail = inquiryNotification(FIELDS, { to: 'jill@x.z', from: 'a@b.c', stored: true });
    expect(mail.to).toBe('jill@x.z');
    expect(mail.subject).toContain('Ruth Marsh');
    expect(mail.text).toContain('ruth@example.com');
    expect(mail.text).toContain('6, 9 and 13');
    expect(mail.text).toContain('Is there room in Latin?');
  });

  it('says the inquiry is also on the website when it was stored', () => {
    const mail = inquiryNotification(FIELDS, { to: 'jill@x.z', from: 'a@b.c', stored: true });
    expect(mail.text).toContain('saved on the website');
    expect(mail.text).not.toContain('WARNING');
  });

  it('warns in plain words when the email is the only copy that exists', () => {
    // The half of "neither failure silently loses the other" that points this
    // way: a Neon outage must not turn into a lead nobody knows to act on.
    const mail = inquiryNotification(FIELDS, { to: 'jill@x.z', from: 'a@b.c', stored: false });
    expect(mail.text).toContain('could NOT be saved');
    expect(mail.text).toContain('only copy');
  });
});

describe('the confirmation the family gets', () => {
  const mail = inquiryConfirmation(FIELDS, {
    from: 'site@pharosacademy.net',
    site: 'https://www.pharosacademy.net',
  });

  it('goes to the address they gave', () => {
    expect(mail.to).toBe('ruth@example.com');
  });

  it('carries the class list, the Statement of Faith and a quiet application link', () => {
    expect(mail.text).toContain('https://www.pharosacademy.net/classes');
    expect(mail.text).toContain('https://www.pharosacademy.net/about/beliefs');
    expect(mail.text).toContain('https://www.pharosacademy.net/admissions');
  });

  it('puts the application link last and small, under a rule', () => {
    // "A small line at the bottom", not a second call to action competing with
    // the two things the family was asked to read first.
    const lines = mail.text.split('\n').filter(Boolean);
    expect(lines[lines.length - 1]).toContain('/admissions');
    expect(lines[lines.length - 2]).toBe('—');
  });

  it('says what Pharos is in two lines rather than selling', () => {
    expect(mail.text).toContain('Christian classical');
    expect(mail.text).toContain('Enola');
  });

  it('builds absolute links, because an email has no base URL', () => {
    for (const path of ['/classes', '/about/beliefs', '/admissions']) {
      expect(mail.text).not.toMatch(new RegExp(`\\s${path}\\b`));
    }
  });
});

/**
 * #25 AC 2, in all four combinations. This is the block the whole module exists
 * for: a submission persists **and** emails, and neither failure silently loses
 * the other.
 */
describe('a submission', () => {
  it('stores it and emails both the school and the family', async () => {
    const mailer = recorder();
    const stored: InquiryFields[] = [];

    const outcome = await submitInquiry(
      FIELDS,
      options({
        sender: mailer.send,
        store: async (values) => {
          stored.push(values);
          return 'row-1';
        },
      }),
    );

    expect(stored).toEqual([FIELDS]);
    expect(outcome.held).toBe(true);
    expect(outcome.id).toBe('row-1');
    expect(outcome.notified).toBe(true);
    expect(outcome.confirmed).toBe(true);
    expect(outcome.message).toBe(RECEIVED_MESSAGE);
    expect(mailer.sent.map((mail) => mail.to)).toEqual([
      'jkilker@enolacog.com',
      'ruth@example.com',
    ]);
  });

  it('emails every address in the settings list, not just the first', async () => {
    const mailer = recorder();
    await submitInquiry(
      FIELDS,
      options({ sender: mailer.send, to: ['jill@x.z', 'george@x.z'] }),
    );
    expect(mailer.sent.map((mail) => mail.to)).toEqual(['jill@x.z', 'george@x.z', 'ruth@example.com']);
  });

  it('still emails the school when the database write fails', async () => {
    const mailer = recorder();
    const outcome = await submitInquiry(
      FIELDS,
      options({
        sender: mailer.send,
        store: async () => {
          throw new Error('Neon is unreachable');
        },
      }),
    );

    expect(outcome.id).toBeUndefined();
    expect(outcome.storeError).toContain('Neon is unreachable');
    expect(outcome.notified).toBe(true);
    // Held, because the school has it — in an inbox rather than in a table.
    expect(outcome.held).toBe(true);
    expect(outcome.message).toBe(RECEIVED_MESSAGE);
    // And the mail says the row is missing, so nobody assumes there is a copy.
    expect(mailer.sent[0]!.text).toContain('could NOT be saved');
  });

  it('still stores it when the send fails, and says who was not told', async () => {
    const outcome = await submitInquiry(FIELDS, options({ sender: refuses }));

    expect(outcome.id).toBe('row-1');
    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('invalid api key');
    expect(outcome.confirmed).toBe(false);
    // Held, because the school has it — the admin screen is the record.
    expect(outcome.held).toBe(true);
    expect(outcome.message).toBe(RECEIVED_MESSAGE);
  });

  it('treats a deployment with no mailer as a refused send, never as success', async () => {
    const outcome = await submitInquiry(FIELDS, options({ sender: undefined }));
    expect(outcome.notified).toBe(false);
    expect(outcome.notificationError).toContain('RESEND_API_KEY');
  });

  it('counts the school as told when one of two addresses bounces', async () => {
    const outcome = await submitInquiry(
      FIELDS,
      options({
        to: ['good@x.z', 'bad@x.z'],
        sender: async (mail) => {
          if (mail.to === 'bad@x.z') throw new Error('550 no such mailbox');
        },
      }),
    );

    expect(outcome.notified).toBe(true);
    expect(outcome.notificationError).toContain('bad@x.z');
  });

  it('refuses to say anything reassuring when nothing at all worked', async () => {
    const outcome = await submitInquiry(
      FIELDS,
      options({
        sender: refuses,
        store: async () => {
          throw new Error('Neon is unreachable');
        },
      }),
    );

    expect(outcome.held).toBe(false);
    expect(outcome.message).not.toContain(RECEIVED_MESSAGE);
    // …and it names the address that does work, which is the whole point of
    // failing loudly rather than quietly.
    expect(outcome.message).toContain('jkilker@enolacog.com');
  });
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}
