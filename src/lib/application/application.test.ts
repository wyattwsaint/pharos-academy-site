import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { BELIEFS_ARTICLES, BELIEFS_CLOSING } from '../about/beliefs.js';
import { CATALOGUE } from '../courses/catalogue.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import {
  applicationCost,
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  faithKey,
  familySelection,
  isFlagged,
  MAX_CHILDREN,
  parseApplication,
  prefillFrom,
  priceUnit,
  statementVersion,
  type ApplicationFields,
} from './application.js';
import { offeringsOf } from './offerings.js';

/**
 * #31 AC 1, AC 6, AC 8 and AC 9 — the pure half of the family's application,
 * over the real catalogue and the real seeded money settings.
 */

const OFFERINGS = offeringsOf(CATALOGUE);

/** A form, from the field names the page actually posts. */
function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
  }
  return data;
}

/** A complete, valid submission. Individual tests spoil one field of it. */
function goodForm(over: Record<string, string | string[]> = {}): FormData {
  return form({
    familyName: 'Okonkwo',
    email: 'okonkwo@example.com',
    'child-0-name': 'Ada',
    'child-0-age': '13',
    'child-0-classes': ['algebra-1:year'],
    ...over,
  });
}

describe('pre-filling from an inquiry (#31 AC 1)', () => {
  it('carries the name, the email and one child per age', () => {
    const values = prefillFrom({ name: 'Okonkwo', email: 'o@example.com', ages: '6, 9 and 13' });

    expect(values.familyName).toBe('Okonkwo');
    expect(values.email).toBe('o@example.com');
    expect(values.children.map((child) => child.age)).toEqual(['6', '9', '13']);
    // Names are the school's guess to make, and it does not have one — the
    // inquiry never asked for the children's names.
    expect(values.children.every((child) => child.name === '')).toBe(true);
  });

  it('works from a clean slate, with one blank child row', () => {
    const values = prefillFrom(null);

    expect(values.familyName).toBe('');
    expect(values.email).toBe('');
    expect(values.children).toEqual([{ name: '', age: '', offeringKeys: [] }]);
    expect(values.objections).toBe('');
  });

  it('gives one blank row when the ages are words rather than numbers', () => {
    const values = prefillFrom({ name: 'Ruth', email: 'r@example.com', ages: 'twins, nearly five' });
    expect(values.children).toEqual([{ name: '', age: '', offeringKeys: [] }]);
  });

  it('never opens more rows than the form has', () => {
    const values = prefillFrom({
      name: 'Ruth',
      email: 'r@example.com',
      ages: '4 5 6 7 8 9 10 11 12 13 14',
    });
    expect(values.children).toHaveLength(MAX_CHILDREN);
  });
});

describe('reading a submitted application', () => {
  it('takes a good one with no errors', () => {
    const { values, errors, flagged } = parseApplication(goodForm(), OFFERINGS);

    expect(errors).toEqual({});
    expect(flagged).toBe(false);
    expect(values.children).toEqual([
      { name: 'Ada', age: '13', offeringKeys: ['algebra-1:year'] },
    ]);
  });

  it('ignores the blank rows nobody typed in', () => {
    const { values } = parseApplication(goodForm({ 'child-3-name': '  ' }), OFFERINGS);
    expect(values.children).toHaveLength(1);
  });

  it('drops a class that is no longer on sale', () => {
    // A form can be stale by a republish. The rest of the selection survives.
    const { values } = parseApplication(
      goodForm({ 'child-0-classes': ['algebra-1:year', 'algebra-1:spring'] }),
      OFFERINGS,
    );
    expect(values.children[0]!.offeringKeys).toEqual(['algebra-1:year']);
  });

  it('names who is applying, how to reach them, and asks for a class', () => {
    const { errors } = parseApplication(
      form({ 'child-0-name': 'Ada', 'child-0-age': '13' }),
      OFFERINGS,
    );

    expect(errors.familyName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.classes).toBeTruthy();
  });

  it('refuses an address that is not one', () => {
    const { errors } = parseApplication(goodForm({ email: 'okonkwo at example' }), OFFERINGS);
    expect(errors.email).toContain('does not look like');
  });

  it('asks for an age beside a name', () => {
    const { errors } = parseApplication(goodForm({ 'child-0-age': '' }), OFFERINGS);
    expect(errors.children).toBeTruthy();
  });
});

describe('the Statement of Faith is disclose-and-discuss (#31 AC 6)', () => {
  const yes = (): Record<string, string> => {
    const answers: Record<string, string> = {};
    for (const respondent of FAITH_RESPONDENTS) {
      for (const question of FAITH_QUESTIONS) answers[faithKey(respondent, question.id)] = 'yes';
    }
    return answers;
  };

  it('does not block submission on an objection', () => {
    const { errors, flagged } = parseApplication(
      goodForm({ ...yes(), objections: 'We disagree with the wording of article 9.' }),
      OFFERINGS,
    );

    expect(errors).toEqual({});
    expect(flagged).toBe(true);
  });

  it('does not block submission on a “No”', () => {
    const { errors, flagged } = parseApplication(
      goodForm({ ...yes(), [faithKey('Mother', 'agree')]: 'no' }),
      OFFERINGS,
    );

    expect(errors).toEqual({});
    expect(flagged).toBe(true);
  });

  it('never puts an error on the Statement, whatever is answered', () => {
    // The property, not one case: no combination of answers may produce an
    // error key, because an error is a refusal and this is a conversation.
    const answers: Record<string, string> = {};
    for (const respondent of FAITH_RESPONDENTS) {
      for (const question of FAITH_QUESTIONS) answers[faithKey(respondent, question.id)] = 'no';
    }
    const { errors } = parseApplication(
      goodForm({ ...answers, objections: 'All of it.' }),
      OFFERINGS,
    );

    expect(Object.keys(errors)).toEqual([]);
  });

  it('treats an unanswered question as unanswered, not as a “No”', () => {
    // A household with no legal guardian leaves that column alone. Flagging it
    // would flag the whole intake and make the flag mean nothing.
    const { values, flagged } = parseApplication(goodForm(yes()), OFFERINGS);
    const partial: ApplicationFields = {
      ...values,
      faith: { ...values.faith, [faithKey('Legal guardian', 'agree')]: '' },
    };

    expect(flagged).toBe(false);
    expect(isFlagged(partial)).toBe(false);
  });

  it('asks all three questions of all three people', () => {
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values.faith)).toHaveLength(FAITH_RESPONDENTS.length * FAITH_QUESTIONS.length);
  });

  it('records the version of the Statement that was shown', () => {
    const version = statementVersion();

    expect(version).toMatch(/^sof-[0-9a-f]{8}$/);
    // Stable across calls, and different the moment the text is.
    expect(statementVersion()).toBe(version);
    expect(statementVersion([...BELIEFS_ARTICLES, 'a twelfth article'], BELIEFS_CLOSING)).not.toBe(
      version,
    );
    expect(statementVersion(BELIEFS_ARTICLES, `${BELIEFS_CLOSING} And one more sentence.`)).not.toBe(
      version,
    );
  });
});

describe('what the family owes (#31 AC 8)', () => {
  const applied = (over: Record<string, string | string[]> = {}): ApplicationFields =>
    parseApplication(goodForm(over), OFFERINGS).values;

  it('prices every enrolment unit through the rate card', () => {
    expect(priceUnit('year')).toBe('year');
    expect(priceUnit('fall')).toBe('semester');
    expect(priceUnit('spring')).toBe('semester');
    expect(priceUnit('block')).toBe('flat');
  });

  it('totals registration, deposits and tuition from the settings', () => {
    const cost = applicationCost(applied(), OFFERINGS, SEEDED_MONEY_SETTINGS);

    expect(cost.total.registration).toBe(SEEDED_MONEY_SETTINGS.registrationFee);
    expect(cost.total.deposits).toBe(SEEDED_MONEY_SETTINGS.classDeposit);
    expect(cost.total.dueNow).toBe(
      SEEDED_MONEY_SETTINGS.registrationFee + SEEDED_MONEY_SETTINGS.classDeposit,
    );
    expect(cost.total.total).toBe(cost.total.dueNow + cost.total.dueToInstructors);
  });

  it('changes when a setting changes — every figure, not just one', () => {
    const before = applicationCost(applied(), OFFERINGS, SEEDED_MONEY_SETTINGS).total;
    const dearer = applicationCost(applied(), OFFERINGS, {
      ...SEEDED_MONEY_SETTINGS,
      registrationFee: SEEDED_MONEY_SETTINGS.registrationFee + 10,
      classDeposit: SEEDED_MONEY_SETTINGS.classDeposit + 25,
      rates: { standard: 20, highSchoolCredit: 30 },
    }).total;

    expect(dearer.registration).toBe(before.registration + 10);
    expect(dearer.deposits).toBe(before.deposits + 25);
    expect(dearer.tuition).toBe(before.tuition * 2);
    expect(dearer.total).toBeGreaterThan(before.total);
  });

  it('credits the deposit against tuition when the flag says so, and not when it does not', () => {
    const values = applied();
    const credited = applicationCost(values, OFFERINGS, SEEDED_MONEY_SETTINGS).total;
    const onTop = applicationCost(values, OFFERINGS, {
      ...SEEDED_MONEY_SETTINGS,
      depositCreditedAgainstTuition: false,
    }).total;

    expect(credited.creditedAgainstTuition).toBe(SEEDED_MONEY_SETTINGS.classDeposit);
    expect(onTop.creditedAgainstTuition).toBe(0);
    expect(onTop.total).toBe(credited.total + SEEDED_MONEY_SETTINGS.classDeposit);
  });

  it('charges the registration fee once per student, not once per family', () => {
    // "Once per student per year, however many classes" — a family of two pays
    // it twice, and totalling one flat list of selections would understate the
    // cheque by a whole fee.
    const twoChildren = applied({
      'child-1-name': 'Obi',
      'child-1-age': '9',
      'child-1-classes': ['kingdom-math:year'],
    });
    const cost = applicationCost(twoChildren, OFFERINGS, SEEDED_MONEY_SETTINGS);

    expect(cost.perChild).toHaveLength(2);
    expect(cost.total.registration).toBe(SEEDED_MONEY_SETTINGS.registrationFee * 2);
  });

  it('charges a child who chose nothing nothing at all', () => {
    const cost = applicationCost(
      applied({ 'child-1-name': 'Obi', 'child-1-age': '9' }),
      OFFERINGS,
      SEEDED_MONEY_SETTINGS,
    );

    expect(cost.perChild[1]!.owed.registration).toBe(0);
    expect(cost.perChild[1]!.owed.total).toBe(0);
  });

  it('gathers the family’s whole selection once, for the clash check', () => {
    const values = applied({
      'child-1-name': 'Obi',
      'child-1-age': '9',
      'child-1-classes': ['algebra-1:year', 'kingdom-math:year'],
    });

    // Algebra 1 chosen by both children is one class in the family's selection.
    expect(familySelection(values, OFFERINGS).map((one) => one.course.slug)).toEqual([
      'algebra-1',
      'kingdom-math',
    ]);
  });
});

describe('the children’s sensitive data does not enter the site (#31 AC 9)', () => {
  it('knows a name, an age and the classes, and nothing else', () => {
    // The acceptance criterion as a property of the type. A field added to
    // `ApplicationChild` fails here before it can reach a form.
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values.children[0]!).sort()).toEqual(['age', 'name', 'offeringKeys']);
  });

  it('holds a family name, an email, the children and the Statement, and nothing else', () => {
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values).sort()).toEqual([
      'children',
      'email',
      'familyName',
      'faith',
      'objections',
    ].sort());
  });

  /*
   * The same criterion against the form itself.
   *
   * The types above cannot be the whole test: a field on the page that posts
   * to a name the parser ignores still *collects* a date of birth, and the
   * harm the criterion is about is the collecting. So this reads the page off
   * disk and looks at what it asks for.
   *
   * **Attribute names, not prose.** The doc comments in `application.ts`,
   * `schema.ts`, `migrations.ts` and the page itself deliberately use every one
   * of these words to explain why the fields are absent, so a plain text grep
   * over any of them fails on its own explanation.
   */
  it('asks for no date of birth, address, medical, evaluation or custody field', () => {
    const page = readFileSync(
      fileURLToPath(new URL('../../pages/admissions/apply.astro', import.meta.url)),
      'utf8',
    );

    const asked = [...page.matchAll(/(?:name|id|for)=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
      (match) => (match[1] ?? match[2] ?? '').toLowerCase(),
    );
    expect(asked.length).toBeGreaterThan(0);

    for (const field of asked) {
      expect(field, `the form asks for ${field}`).not.toMatch(FORBIDDEN);
    }
  });
});

/**
 * What the site does not collect (#31 AC 9).
 *
 * Date of birth, home address, allergies, medical conditions, evaluation
 * history and custody arrangements are all on the school's live Google Form and
 * are all deliberately absent here — they move to paper signed at enrolment.
 * This is what deletes the stricter storage tier rather than building it, and
 * it is not a shortcut to be quietly reversed.
 */
const FORBIDDEN =
  /\b(dob|birth|address|street|zip|postcode|allerg|medical|medicat|diagnos|custody|iep|adhd|evaluation)/;
