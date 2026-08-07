/**
 * The family's application — everything about it that is not a page (#31).
 *
 * Four stages on one long document: the Statement of Faith, the classes, the
 * payment slot, the confirmation. This module is the three of them that are
 * arithmetic and rules; `offerings.ts` next door is the picker and the clash
 * rule, and the page is the fourth thing.
 *
 * Two decisions shape the whole file.
 *
 * **The Statement of Faith is disclose-and-discuss.** Nothing here can put an
 * error on a "No" or on an objection, because an objection is not a defect in
 * the form — it is the reason the school wants to talk to this family. So the
 * parser returns a `flagged` boolean rather than an error, and the flag routes
 * the application to a conversation. There is no scroll-gate, and there is
 * nothing here that could implement one: a gate is a WCAG 2.2 AA hazard for
 * keyboard and screen-reader users that buys no evidence anybody read anything.
 *
 * **The children's sensitive data does not enter the site.** `ApplicationChild`
 * has a name, an age and the classes, and that is the entire type. Date of
 * birth, home address, allergies, medical conditions, evaluation history and
 * custody arrangements are all on the school's live Google Form and are all
 * deliberately absent here — they move to paper signed at enrolment. This is
 * what deletes the stricter storage tier rather than building it, and
 * `application.test.ts` reads this file and the form component back and fails if
 * either grows one of those words.
 */

import { BELIEFS_ARTICLES, BELIEFS_CLOSING } from '../about/beliefs.js';
import type { EnrolmentUnit } from '../courses/course.js';
import { isEmailAddress, textField as text } from '../forms.js';
import { amountOwed, type AmountOwed, type Selection } from '../money/owed.js';
import type { MoneySettings } from '../money/settings.js';
import { findOffering, offeringKey, type Offering } from './offerings.js';

/** The address of the page that holds the flow and takes its POST. */
export const APPLICATION_PATH = '/admissions/apply';

/**
 * The four stages, as anchors on one document.
 *
 * One long page rather than a stepped flow (#31): the entry point is warm — a
 * family that has already spoken to the school — so the abandonment argument
 * that favours splitting is weak, and "on the same page" is what the inquiry's
 * recap email promised. Headed sections with anchors keep a stepped variant a
 * CSS decision rather than a rebuild.
 */
export const APPLICATION_STAGES = [
  { id: 'faith', title: 'What we believe' },
  { id: 'classes', title: 'Choosing classes' },
  { id: 'payment', title: 'What to post' },
  { id: 'confirmation', title: 'Sending it' },
] as const;

/**
 * Who is asked the three questions, separately.
 *
 * Separately, and not as one household answer, because the live form asks them
 * that way and because a household where one parent disagrees is exactly the
 * conversation the flag exists to start. A family with no second parent leaves
 * that column blank, which is why an unanswered question is neither a "no" nor
 * an error.
 */
export const FAITH_RESPONDENTS = ['Father', 'Mother', 'Legal guardian'] as const;
export type FaithRespondent = (typeof FAITH_RESPONDENTS)[number];

/**
 * The three questions, in the school's own words from its live form.
 *
 * Transcribed rather than drafted, for the same reason the Statement itself is
 * (`about/beliefs.ts`): what a Christian school asks a family to affirm is the
 * school's text, not this site's.
 */
export const FAITH_QUESTIONS = [
  { id: 'read', text: 'Have you read Pharos Academy’s Statement of Faith and Practice?' },
  { id: 'agree', text: 'Do you agree with Pharos Academy’s Statement of Faith and Practice?' },
  {
    id: 'comfortable',
    text:
      'Are you comfortable with your child being educated in alignment with Pharos Academy’s ' +
      'Statement of Faith and Practice?',
  },
] as const;
export type FaithQuestionId = (typeof FAITH_QUESTIONS)[number]['id'];

/**
 * One answer. Empty is a real, ordinary state — a family with no legal guardian
 * leaves that column alone — and is never treated as a "no".
 */
export type FaithAnswer = 'yes' | 'no' | '';

/** The nine cells of the grid, keyed by `faithKey`. Missing means unanswered. */
export type FaithAnswers = Record<string, FaithAnswer>;

/** `faith-Father-agree` — one radio group per cell, and its form field name. */
export function faithKey(respondent: FaithRespondent, question: FaithQuestionId): string {
  return `faith-${respondent.replace(/\s+/g, '-')}-${question}`;
}

/** What one cell was answered, or empty when it was not. */
export function faithAnswer(
  answers: FaithAnswers,
  respondent: FaithRespondent,
  question: FaithQuestionId,
): FaithAnswer {
  return answers[faithKey(respondent, question)] ?? '';
}

/**
 * One child, and the whole of what the site knows about one.
 *
 * A name, an age and the classes. **Nothing else may be added here** — see the
 * note at the top of this file, and the test that enforces it.
 */
export type ApplicationChild = {
  name: string;
  /** As typed. Free text, because the inquiry's ages are free text. */
  age: string;
  /** `<slug>:<unit>` keys, resolved against what is actually on sale. */
  offeringKeys: string[];
};

export type ApplicationFields = {
  familyName: string;
  email: string;
  children: ApplicationChild[];
  faith: FaithAnswers;
  /**
   * Objections to the Statement, in the family's own words.
   *
   * **Optional**, matching the school's live form. An objection that never
   * blocks submission reads more naturally as a field a family may leave alone
   * than as one they must type something into to proceed.
   */
  objections: string;
};

export type ApplicationErrors = {
  familyName?: string;
  email?: string;
  children?: string;
  classes?: string;
};

export type ParsedApplication = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: ApplicationFields;
  /** Empty when the submission is good. Never mentions the Statement of Faith. */
  errors: ApplicationErrors;
  /**
   * Whether this application needs a conversation before it is accepted.
   *
   * True on any "No" and on any objection — and it is *not* a rejection. The
   * school reads the objection and talks to the family; that is the whole
   * design (#31 AC 6). It is deliberately separate from `errors` so that no
   * future refactor can turn "we disagree with article 9" into a validation
   * failure that stops the form.
   */
  flagged: boolean;
};

/** How many children one form offers rows for. More than any family the school has. */
export const MAX_CHILDREN = 8;

/**
 * Read a submitted form.
 *
 * `offerings` is what is on sale right now, so a key posted from a form that a
 * republish has since staled is dropped rather than thrown on — the same rule
 * `selectedOfferings` applies, for the same reason.
 */
export function parseApplication(
  form: FormData,
  offerings: readonly Offering[],
): ParsedApplication {
  const children: ApplicationChild[] = [];
  for (let index = 0; index < MAX_CHILDREN; index += 1) {
    const name = text(form, `child-${index}-name`);
    const age = text(form, `child-${index}-age`);
    const offeringKeys = form
      .getAll(`child-${index}-classes`)
      .map(String)
      .filter((key) => findOffering(offerings, key) !== null);

    // A row nobody touched is not a child. Three blank rows on a two-child
    // application are the normal case, not an error to report.
    if (name || age || offeringKeys.length > 0) children.push({ name, age, offeringKeys });
  }

  const faith: FaithAnswers = {};
  for (const respondent of FAITH_RESPONDENTS) {
    for (const question of FAITH_QUESTIONS) {
      const key = faithKey(respondent, question.id);
      const value = text(form, key);
      faith[key] = value === 'yes' || value === 'no' ? value : '';
    }
  }

  const values: ApplicationFields = {
    familyName: text(form, 'familyName'),
    email: text(form, 'email'),
    children,
    faith,
    objections: text(form, 'objections'),
  };

  return { values, errors: validateApplication(values), flagged: isFlagged(values) };
}

/**
 * Everything wrong with an application, in one pass.
 *
 * Four things can be wrong and none of them is an opinion: who is applying, how
 * to reach them, who the children are, and whether any class was chosen. The
 * Statement of Faith cannot appear here — see `flagged`.
 */
export function validateApplication(values: ApplicationFields): ApplicationErrors {
  const errors: ApplicationErrors = {};

  if (!values.familyName) errors.familyName = 'We need a family name for the application.';
  if (!values.email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }

  const named = values.children.filter((child) => child.name);
  if (named.length === 0) {
    errors.children = 'Tell us at least one child’s name, and their age.';
  } else if (named.some((child) => !child.age)) {
    errors.children = 'Each child needs an age beside their name.';
  }

  if (values.children.every((child) => child.offeringKeys.length === 0)) {
    errors.classes = 'Choose at least one class. If you are not sure yet, write to us instead.';
  }

  return errors;
}

/**
 * Whether this application goes to a conversation rather than straight through.
 *
 * An unanswered cell does not flag: a household with no legal guardian leaves
 * that column blank, and treating silence as dissent would flag most of the
 * intake and make the flag mean nothing.
 */
export function isFlagged(values: ApplicationFields): boolean {
  if (values.objections.trim().length > 0) return true;
  return Object.values(values.faith).some((answer) => answer === 'no');
}

/** What the family typed on the inquiry, as much of it as this form can use. */
export type InquiryPrefill = { name: string; email: string; ages: string };

/**
 * The application as it opens, from the inquiry the family already sent (#31 AC 1).
 *
 * A family that has already told the school its name, its email and its
 * children's ages does not retype them. Null — a family who arrives without an
 * inquiry, or a link pasted into an email by somebody who did not look one up —
 * gives a clean slate with one blank child row, which is the same form.
 */
export function prefillFrom(inquiry: InquiryPrefill | null): ApplicationFields {
  const ages = inquiry ? childAges(inquiry.ages) : [];
  return {
    familyName: inquiry?.name ?? '',
    email: inquiry?.email ?? '',
    children: (ages.length > 0 ? ages : ['']).map((age) => ({ name: '', age, offeringKeys: [] })),
    faith: {},
    objections: '',
  };
}

/**
 * "6, 9 and 13" as three children.
 *
 * The numbers in the free text, and nothing cleverer. `ages` is a sentence a
 * parent wrote — "6, 9 and 13", "4 and 17", "twins, nearly 7" — so a strict
 * parser would fail on real input. Taking the numbers gets the ordinary case
 * exactly right and the odd one to *one blank row*, which is a form the family
 * fills in rather than a wrong one they have to correct.
 */
function childAges(ages: string): string[] {
  return (ages.match(/\d{1,2}/g) ?? []).slice(0, MAX_CHILDREN);
}

/**
 * The version of the Statement the family was shown, as a short stable hash.
 *
 * Recorded with the answers so that a family's agreement is never silently
 * reinterpreted against a later revision (#31 AC 6). The Statement is a file in
 * git rather than a row (`about/beliefs.ts`), so a revision arrives as a pull
 * request — and this hash changes with it, on its own, with nobody remembering
 * to bump a number.
 *
 * FNV-1a in plain TypeScript rather than `node:crypto`: this module is imported
 * by a page that is bundled for the browser's sake as well as the server's, and
 * a Node built-in on that path is a build failure rather than a runtime one.
 * It is not a security hash and nothing here pretends it is — it is a version
 * label whose only job is to differ when the text differs.
 *
 * The eleven articles and the closing paragraph, which is the doctrine a family
 * is agreeing about. The attribution notes are deliberately excluded: they are
 * copyright permissions, and a corrected permission line is not a revision of
 * what anybody believes.
 */
export function statementVersion(
  articles: readonly string[] = BELIEFS_ARTICLES,
  closing: string = BELIEFS_CLOSING,
): string {
  return `sof-${fnv1a([...articles, closing].join('\n'))}`;
}

/** FNV-1a, 32-bit, as eight hex digits. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    // The FNV prime, 16777619, in the shifts that keep it inside 32 bits.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * An enrolment unit as the price list means it.
 *
 * The catalogue sells four units and the rate card prices three: both semesters
 * are one price. This is the whole of the mapping, in one place, because the
 * alternative is a `switch` in the page — and a page that gets it wrong quotes
 * a family a semester of Algebra 1 for the price of a year.
 */
export function priceUnit(unit: EnrolmentUnit): Selection['unit'] {
  switch (unit) {
    case 'year':
      return 'year';
    case 'fall':
    case 'spring':
      return 'semester';
    case 'block':
      return 'flat';
  }
}

/** One child's chosen offerings as priced selections. */
export function selectionsOf(offerings: readonly Offering[]): Selection[] {
  return offerings.map((offering) => ({
    course: offering.course,
    unit: priceUnit(offering.unit),
  }));
}

/** One child, their offerings resolved, and what they cost. */
export type ChildCost = {
  child: ApplicationChild;
  offerings: Offering[];
  owed: AmountOwed;
};

export type ApplicationCost = {
  perChild: ChildCost[];
  /** Every child's figures added up. What the family actually posts and owes. */
  total: AmountOwed;
};

/**
 * What the whole application costs, child by child and then in total (#31 AC 8).
 *
 * Per child rather than per application, because the registration fee is "once
 * per student per year": a family enrolling three children pays it three times,
 * and totalling one flat list of selections would charge it once and understate
 * the cheque by $50.
 *
 * Every figure comes from the `MoneySettings` handed in. There is no rate in
 * this module and no default — a surface that has not read the settings cannot
 * total anything, which is what makes "changing a setting changes the totals"
 * true by construction.
 */
export function applicationCost(
  values: ApplicationFields,
  offerings: readonly Offering[],
  settings: MoneySettings,
): ApplicationCost {
  const perChild = values.children.map((child) => {
    const chosen = child.offeringKeys
      .map((key) => findOffering(offerings, key))
      .filter((offering): offering is Offering => offering !== null);
    return { child, offerings: chosen, owed: amountOwed(selectionsOf(chosen), settings) };
  });

  return { perChild, total: sumOwed(perChild.map((one) => one.owed)) };
}

/** Every offering anybody in the family chose, deduplicated, in picker order. */
export function familySelection(
  values: ApplicationFields,
  offerings: readonly Offering[],
): Offering[] {
  const chosen = new Set(values.children.flatMap((child) => child.offeringKeys));
  return offerings.filter((offering) => chosen.has(offeringKey(offering)));
}

function sumOwed(parts: readonly AmountOwed[]): AmountOwed {
  const add = (pick: (owed: AmountOwed) => number): number =>
    parts.reduce((sum, owed) => sum + pick(owed), 0);

  return {
    registration: add((owed) => owed.registration),
    deposits: add((owed) => owed.deposits),
    tuition: add((owed) => owed.tuition),
    creditedAgainstTuition: add((owed) => owed.creditedAgainstTuition),
    dueNow: add((owed) => owed.dueNow),
    dueToInstructors: add((owed) => owed.dueToInstructors),
    total: add((owed) => owed.total),
  };
}
