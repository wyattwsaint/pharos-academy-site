import { describe, expect, it } from 'vitest';

import {
  agreementAnswer,
  agreementHref,
  agreementLabel,
  askableAgreements,
  decodeAgreements,
  encodeAgreements,
  parseAgreements,
  type AskableAgreement,
} from './agreements.js';
import { FAITH_QUESTIONS, faithKey, parseApplication } from './application.js';
import { offeringsOf } from './offerings.js';
import { CATALOGUE } from '../courses/catalogue.js';

/**
 * The two agreements (#71, #255).
 *
 * Four properties are worth a test each: an unanswered question stays absent
 * rather than becoming a "no", the version a family was shown travels with the
 * answer, neither answer can reach `errors`, and the answers written before
 * ADR-0020 still decode without being rewritten.
 */

const OFFERINGS = offeringsOf(CATALOGUE);

const ASKABLE: AskableAgreement[] = [
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    question: 'Does your family agree to the Pharos Academy Code of Conduct?',
    version: 2,
  },
  {
    slug: 'handbook',
    title: 'Handbook',
    question: 'Does your family agree to the Pharos Academy Handbook?',
    version: 5,
  },
];

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/**
 * A sendable application, without the agreements. #85 requires a family name,
 * an email, a child, a class and one answered column of the Statement of Faith
 * grid, and #312 adds a phone number and somewhere to post to — so a fixture
 * testing "the agreements never block" has to be complete in every other
 * respect, or it proves nothing about the agreements.
 */
const SENDABLE: Record<string, string> = {
  familyName: 'Marsh',
  email: 'ruth@example.com',
  phone: '717-555-0142',
  street: '12 Oak Lane',
  city: 'Gettysburg',
  state: 'PA',
  zip: '17325',
  'child-0-name': 'Obi',
  'child-0-age': '9',
  'child-0-classes': 'algebra-1:year',
  'payment-method': 'online',
  ...Object.fromEntries(FAITH_QUESTIONS.map((question) => [faithKey('Father', question.id), 'yes'])),
};

describe('reading the answers', () => {
  it('records the answer against the version the family was shown', () => {
    const agreements = parseAgreements(form({ 'agreement-handbook': 'yes' }), ASKABLE);

    expect(agreements.handbook).toEqual({ answer: 'yes', version: 5 });
  });

  it('leaves an unanswered document absent rather than storing a "no"', () => {
    const agreements = parseAgreements(form({ 'agreement-handbook': '' }), ASKABLE);

    expect(agreements.handbook).toBeUndefined();
    expect(agreementAnswer(agreements, 'handbook')).toBe('');
    // The distinction this whole shape exists for.
    expect(agreementAnswer(agreements, 'handbook')).not.toBe('no');
  });

  it('takes "no" as the real answer it is', () => {
    const agreements = parseAgreements(form({ 'agreement-code-of-conduct': 'no' }), ASKABLE);

    expect(agreements['code-of-conduct']).toEqual({ answer: 'no', version: 2 });
  });

  it('drops an answer to a document the form did not ask about', () => {
    // A stale form, or a hand-made POST. There is no version to record it
    // against, because the family was never shown one.
    const agreements = parseAgreements(form({ 'agreement-handbook': 'yes' }), []);

    expect(agreements).toEqual({});
  });

  it('writes none of the three answers ADR-0020 retired', () => {
    // A form from before the change, or one built by hand. They still decode
    // out of the record; nothing puts a new one into it.
    for (const retired of ['student', 'parent', 'neither']) {
      expect(parseAgreements(form({ 'agreement-handbook': retired }), ASKABLE)).toEqual({});
    }
  });

  it('ignores a value that is not an answer at all', () => {
    expect(parseAgreements(form({ 'agreement-handbook': 'maybe' }), ASKABLE)).toEqual({});
  });
});

describe('which documents can be asked about', () => {
  it('asks only about a policy that has a document behind it', () => {
    const askable = askableAgreements([
      { slug: 'handbook', version: 3 },
      { slug: 'code-of-conduct', version: null },
    ]);

    expect(askable.map((one) => one.slug)).toEqual(['handbook']);
  });

  it('asks about neither when the school has published neither', () => {
    expect(askableAgreements([])).toEqual([]);
  });

  it('links to the fixed address, never the versioned one', () => {
    expect(agreementHref('handbook')).toBe('/policies/handbook.pdf');
  });
});

describe('storing them', () => {
  it('round-trips the answer and its version', () => {
    const agreements = {
      handbook: { answer: 'yes' as const, version: 5 },
      'code-of-conduct': { answer: 'no' as const, version: 2 },
    };

    expect(decodeAgreements(encodeAgreements(agreements))).toEqual(agreements);
  });

  it('writes nothing for a document nobody answered', () => {
    expect(encodeAgreements({})).toEqual([]);
  });

  it('reads a cell with no version as an answer with no version', () => {
    expect(decodeAgreements(['handbook=yes'])).toEqual({
      handbook: { answer: 'yes', version: null },
    });
  });

  it('still reads the answers stored before ADR-0020, unrewritten', () => {
    // No migration runs, so the rows this school already took are read as they
    // were written — a "student" is never turned into a family "yes".
    expect(decodeAgreements(['code-of-conduct=student@1', 'handbook=neither@2'])).toEqual({
      'code-of-conduct': { answer: 'student', version: 1 },
      handbook: { answer: 'neither', version: 2 },
    });
    expect(decodeAgreements(['handbook=parent@4'])).toEqual({
      handbook: { answer: 'parent', version: 4 },
    });
  });

  it('skips a cell for a slug that is not one of the two', () => {
    expect(decodeAgreements(['child-protection=yes@1'])).toEqual({});
  });
});

describe('what the answers may never do', () => {
  it('does not block a submission, whatever was answered', () => {
    const parsed = parseApplication(
      form({
        ...SENDABLE,
        'agreement-handbook': 'no',
        'agreement-code-of-conduct': 'no',
      }),
      OFFERINGS,
      ASKABLE,
    );

    // A "no" to both is a complete application and sends (ADR-0009). It routes
    // to a conversation (ADR-0020) — which is not a delay and not a refusal.
    expect(parsed.errors).toEqual({});
    expect(parsed.flagged).toBe(true);
    expect(parsed.values.agreements.handbook).toEqual({ answer: 'no', version: 5 });
  });

  it('does not flag an application that agrees to both', () => {
    const parsed = parseApplication(
      form({ ...SENDABLE, 'agreement-handbook': 'yes', 'agreement-code-of-conduct': 'yes' }),
      OFFERINGS,
      ASKABLE,
    );

    expect(parsed.flagged).toBe(false);
  });

  it('is absent from an application to a school that has published neither document', () => {
    const parsed = parseApplication(form(SENDABLE), OFFERINGS);

    expect(parsed.values.agreements).toEqual({});
    // A question nobody was asked cannot be one a family failed to answer (#85).
    expect(parsed.errors).toEqual({});
  });
});

describe('reading them back', () => {
  it('says which way the answer points, never a bare Yes or No', () => {
    expect(agreementLabel('yes')).toBe('Family agrees');
    expect(agreementLabel('no')).toBe('Family does not agree');
    expect(agreementLabel('')).toBe('Not answered');
  });

  it('reads the retired answers without claiming the family said "family"', () => {
    expect(agreementLabel('student')).toBe('Agreed');
    expect(agreementLabel('parent')).toBe('Agreed');
    expect(agreementLabel('neither')).toBe('Did not agree');
  });
});
