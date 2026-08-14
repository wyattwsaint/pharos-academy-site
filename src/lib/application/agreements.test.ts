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
 * The two agreements (#71).
 *
 * Three properties are worth a test each, and they are the three the ticket is
 * actually about: an unanswered question stays absent rather than becoming
 * "neither", the version a family was shown travels with the answer, and
 * neither answer can reach `errors` or `flagged`.
 */

const OFFERINGS = offeringsOf(CATALOGUE);

const ASKABLE: AskableAgreement[] = [
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    question: 'Who agrees to the Pharos Academy Code of Conduct?',
    version: 2,
  },
  { slug: 'handbook', title: 'Handbook', question: 'Who agrees to the Pharos Academy Handbook?', version: 5 },
];

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/**
 * A sendable application, without the agreements. #85 requires a family name, a
 * reachable address, a child, a class and one answered column of the Statement
 * of Faith grid — so a fixture testing "the agreements never block" has to be
 * complete in every other respect, or it proves nothing about the agreements.
 */
const SENDABLE: Record<string, string> = {
  familyName: 'Marsh',
  email: 'ruth@example.com',
  'child-0-name': 'Obi',
  'child-0-age': '9',
  'child-0-classes': 'algebra-1:year',
  'payment-method': 'online',
  ...Object.fromEntries(FAITH_QUESTIONS.map((question) => [faithKey('Father', question.id), 'yes'])),
};

describe('reading the answers', () => {
  it('records the answer against the version the family was shown', () => {
    const agreements = parseAgreements(form({ 'agreement-handbook': 'parent' }), ASKABLE);

    expect(agreements.handbook).toEqual({ answer: 'parent', version: 5 });
  });

  it('leaves an unanswered document absent rather than storing "neither"', () => {
    const agreements = parseAgreements(form({ 'agreement-handbook': '' }), ASKABLE);

    expect(agreements.handbook).toBeUndefined();
    expect(agreementAnswer(agreements, 'handbook')).toBe('');
    // The distinction this whole shape exists for.
    expect(agreementAnswer(agreements, 'handbook')).not.toBe('neither');
  });

  it('takes "neither agrees" as the real answer it is', () => {
    const agreements = parseAgreements(form({ 'agreement-code-of-conduct': 'neither' }), ASKABLE);

    expect(agreements['code-of-conduct']).toEqual({ answer: 'neither', version: 2 });
  });

  it('drops an answer to a document the form did not ask about', () => {
    // A stale form, or a hand-made POST. There is no version to record it
    // against, because the family was never shown one.
    const agreements = parseAgreements(form({ 'agreement-handbook': 'parent' }), []);

    expect(agreements).toEqual({});
  });

  it('ignores a value that is not one of the three answers', () => {
    expect(parseAgreements(form({ 'agreement-handbook': 'yes' }), ASKABLE)).toEqual({});
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
      handbook: { answer: 'student' as const, version: 5 },
      'code-of-conduct': { answer: 'neither' as const, version: 2 },
    };

    expect(decodeAgreements(encodeAgreements(agreements))).toEqual(agreements);
  });

  it('writes nothing for a document nobody answered', () => {
    expect(encodeAgreements({})).toEqual([]);
  });

  it('reads a cell with no version as an answer with no version', () => {
    expect(decodeAgreements(['handbook=parent'])).toEqual({
      handbook: { answer: 'parent', version: null },
    });
  });

  it('skips a cell for a slug that is not one of the two', () => {
    expect(decodeAgreements(['child-protection=parent@1'])).toEqual({});
  });
});

describe('what the answers may never do', () => {
  it('does not block a submission, whatever was answered', () => {
    const parsed = parseApplication(
      form({
        ...SENDABLE,
        'agreement-handbook': 'neither',
        'agreement-code-of-conduct': 'neither',
      }),
      OFFERINGS,
      ASKABLE,
    );

    expect(parsed.errors).toEqual({});
    // "Neither agrees" is not a conversation flag. It is an answer the school's
    // own form has always allowed (#71, and Jill's call to change).
    expect(parsed.flagged).toBe(false);
    expect(parsed.values.agreements.handbook).toEqual({ answer: 'neither', version: 5 });
  });

  it('is absent from an application to a school that has published neither document', () => {
    const parsed = parseApplication(form(SENDABLE), OFFERINGS);

    expect(parsed.values.agreements).toEqual({});
    // A question nobody was asked cannot be one a family failed to answer (#85).
    expect(parsed.errors).toEqual({});
  });
});

describe('reading them back', () => {
  it('says the family’s own words, and says so when there are none', () => {
    expect(agreementLabel('student')).toBe('Student agrees');
    expect(agreementLabel('neither')).toBe('Neither agrees');
    expect(agreementLabel('')).toBe('Not answered');
  });
});
