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
 * the application to a conversation. Since #85 the form does insist that
 * *somebody answered* the questions, and that is a different thing:
 * **the gate is on having answered, never on having agreed.** Of the Statement
 * of Faith and of the agreements, `validateApplication` asks only whether the
 * question has an answer and never which answer it is, so "No" to all three
 * sends exactly as "Yes" does. There is still **no scroll-gate** — nothing
 * waits on the Statement's disclosure being opened, and nothing is held back
 * until something has been scrolled through. **ADR-0009** holds both, and holds
 * that a future "require a Yes" is a reversal of the decision rather than a
 * tightening of the check.
 *
 * **The children's sensitive data does not enter the site.** `ApplicationChild`
 * has a name, an age and the classes, and that is the entire type. Date of
 * birth, home address, allergies, medical conditions, evaluation history and
 * custody arrangements are all on the school's live Google Form and are all
 * deliberately absent here — they move to paper signed at enrolment. This is
 * what deletes the stricter storage tier rather than building it, and
 * `application.test.ts` reads this file, `validation.ts` and the form component back
 * and fails if any of them grows one of those words. **ADR-0007** holds the
 * decision and what reversing it would cost.
 *
 * **The rules themselves live in `validation.ts`, and only their name lives here.**
 * Everything this module exported before #85 it still exports, under the same
 * names, so no caller and no test moved. The split is about bundle weight: the
 * page's `<script>` needs the rules in the browser, and this file's imports —
 * the Statement's text, the catalogue, the clash rule, the money graph — are not
 * things a browser should download to notice an empty text field.
 */

import { BELIEFS_ARTICLES, BELIEFS_CLOSING } from '../about/beliefs.js';
import { parseAgreements, type AskableAgreement } from './agreements.js';
import type { EnrolmentUnit } from '../courses/course.js';
import { textField as text } from '../forms.js';
import {
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  faithKey,
  paymentMethodOf,
  validateApplication,
  type ApplicationChild,
  type ApplicationErrors,
  type ApplicationFields,
  type FaithAnswers,
} from './validation.js';
import { sumOwed } from '../money/live.js';
import { amountOwed, type AmountOwed, type Selection } from '../money/owed.js';
import type { MoneySettings } from '../money/settings.js';
import type { SchoolYear } from '../calendar/year.js';
import { clashesAmong, findOffering, type Offering, type OfferingClash } from './offerings.js';

/** The address of the page that holds the flow and takes its POST. */
export const APPLICATION_PATH = '/admissions/apply';

/**
 * The stages, as anchors on one document.
 *
 * Five since #71, and the fifth is conditional on the school having published
 * the documents it asks about: the Code of Conduct and Handbook agreements need
 * somewhere to live that is neither the Statement of Faith (a different question
 * entirely) nor the class picker. A stage that renders only when there is a
 * document behind it is the honest shape — see `agreements.ts`.
 *
 * One long page rather than a stepped flow (#31): the entry point is warm — a
 * family that has already spoken to the school — so the abandonment argument
 * that favours splitting is weak, and "on the same page" is what the inquiry's
 * recap email promised. Headed sections with anchors keep a stepped variant a
 * CSS decision rather than a rebuild.
 */
export const APPLICATION_STAGES = [
  { id: 'faith', title: 'What We Believe' },
  { id: 'classes', title: 'Choosing Classes' },
  { id: 'agreements', title: 'What You Agree To' },
  // "What to Pay" and no longer "What to Post": the whole of it is one payment
  // through the giving page, and the envelope is the fallback (#219, ADR-0017).
  { id: 'payment', title: 'What to Pay' },
  { id: 'confirmation', title: 'Sending It' },
] as const;

/*
 * The vocabulary and the rules, from the leaf module, under the names they have
 * always had here. Re-exported rather than moved-and-updated so that #85 costs
 * no caller a change — `validation.ts` is the file to read, this is where to import
 * from.
 */
export {
  ERROR_FIELDS,
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  PAYMENT_METHODS,
  faithAnswer,
  faithColumn,
  faithKey,
  firstError,
  paymentMethodOf,
  validateApplication,
} from './validation.js';
export type {
  ApplicationChild,
  ApplicationErrors,
  ApplicationFields,
  AskedAgreement,
  ErrorField,
  FaithAnswer,
  FaithAnswers,
  FaithQuestionId,
  FaithRespondent,
  PaymentMethod,
} from './validation.js';

export type ParsedApplication = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: ApplicationFields;
  /**
   * Empty when the submission is good.
   *
   * It can name the Statement of Faith since #85 — but only ever to say that
   * nobody answered it, never to say that an answer was the wrong one.
   */
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
 *
 * `askable` is the same rule for the two agreements (#71): the documents the
 * page could actually ask about, so an answer to an unpublished Handbook is
 * dropped rather than recorded against a version nobody was shown. Defaulted to
 * none, because a form with neither document published is a real form.
 */
export function parseApplication(
  form: FormData,
  offerings: readonly Offering[],
  askable: readonly AskableAgreement[] = [],
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
    agreements: parseAgreements(form, askable),
    // Anything but one of the two words is unanswered (#219). A page with no
    // giving page posts it from a hidden field rather than a radio, because
    // there is nothing to choose between — and it is the same answer either way.
    paymentMethod: paymentMethodOf(text(form, 'payment-method')),
  };

  // The same `askable` the questions were rendered from, so the gate can only
  // ever require an answer to a question the family was actually shown.
  return {
    values,
    errors: validateApplication(values, askable),
    flagged: isFlagged(values),
  };
}

/**
 * Whether this application goes to a conversation rather than straight through.
 *
 * An unanswered cell does not flag: a household with no legal guardian leaves
 * that column blank, and treating silence as dissent would flag most of the
 * intake and make the flag mean nothing.
 *
 * #85 did not touch this function. The gate asks whether a question was
 * answered; the flag asks what the answer was. Keeping them apart is the whole
 * reason a family can answer "No" to every article and still send their
 * application.
 *
 * **A "no" to an agreement flags** (#255, ADR-0020) — the one line the old note
 * here anticipated. The three-way answer did not: "Neither agrees" was as often
 * a family declining to nominate a person as a refusal, and flagging it would
 * have put the routine case in the same queue as an objection to article 9. A
 * blunt **No** to a document the school requires is a conversation. The old
 * answers still on file are not reread as one — this is computed at submission,
 * so a row written before the change keeps the flag it was given.
 */
export function isFlagged(values: ApplicationFields): boolean {
  if (values.objections.trim().length > 0) return true;
  if (Object.values(values.agreements).some((agreement) => agreement.answer === 'no')) return true;
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
    agreements: {},
    // Nothing on an inquiry says how a family means to pay, and guessing at it
    // would tick a radio on their behalf for a question they have not read.
    paymentMethod: '',
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
    const chosen = childOfferings(child, offerings);
    return { child, offerings: chosen, owed: amountOwed(selectionsOf(chosen), settings) };
  });

  return { perChild, total: sumOwed(perChild.map((one) => one.owed)) };
}

/** One child's chosen offerings, resolved against the catalogue and in their picked order. */
export function childOfferings(
  child: ApplicationChild,
  offerings: readonly Offering[],
): Offering[] {
  return child.offeringKeys
    .map((key) => findOffering(offerings, key))
    .filter((offering): offering is Offering => offering !== null);
}

/** One child and the clashes in their own timetable. Only children who have one. */
export type ChildClashes = {
  child: ApplicationChild;
  /** The child's position in the form, so an unnamed child can still be addressed. */
  index: number;
  clashes: OfferingClash[];
};

/**
 * The clashes in a family's application, child by child (#31 AC 3, 4, 5).
 *
 * Per child, because a **clash** is a fact about one child's timetable: "the
 * family cannot attend both" is never true of two children — two siblings can
 * sit in two rooms at 10:40 on a Wednesday, and telling them otherwise invents
 * a clash the school would then have to talk them out of. Pooling the
 * family's selections also reports the same course as clashing with itself
 * whenever two children pick it in different units, which is not a mistake at
 * all.
 */
export function familyClashes(
  values: ApplicationFields,
  offerings: readonly Offering[],
  year: SchoolYear,
): ChildClashes[] {
  return values.children
    .map((child, index) => ({
      child,
      index,
      clashes: clashesAmong(childOfferings(child, offerings), year),
    }))
    .filter((one) => one.clashes.length > 0);
}
