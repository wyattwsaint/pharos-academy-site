/**
 * What makes an application complete — the whole rule set, and nothing else.
 *
 * This is the seam the greyed **Send the application** button and the server's
 * POST both read (#85). One rule set, evaluated in two places, is the only way a
 * greyed button and a refused submission cannot disagree; two copies would drift
 * on the first change and the family would meet the difference.
 *
 * **It is a leaf on purpose.** `application.ts` re-exports everything here under
 * its old names, so no caller moved — the extraction exists because the page's
 * `<script>` imports these rules into the browser, and importing `application.ts`
 * would drag the Statement of Faith text, the catalogue, the clash rule and the
 * money graph across the wire to check that a text field is not empty. The only
 * imports allowed in this file are the email check and `agreements.ts`, which is
 * a leaf itself.
 *
 * **Answered, never agreed.** Every rule below gates on a question having been
 * answered. None of them gates on the answer. "No" passes, "Neither agrees"
 * passes, an objection typed into the box passes — an objection is the reason
 * the school wants to talk to this family, and `isFlagged` next door is what
 * routes it to that conversation. A future request to refuse an application from
 * a family who answered "No" is a different decision with a different cost and
 * needs its own ADR. See **ADR-0009**.
 *
 * **The children's sensitive data does not enter the site.** `ApplicationChild`
 * lives here now, and it is a name, an age and the classes — that is the entire
 * type. Date of birth, home address, allergies, medical conditions, evaluation
 * history and custody arrangements are all on the school's live Google Form and
 * are all deliberately absent. `application.test.ts` reads this file, the module
 * next door and the form component back and fails if any of them grows one of
 * those words. **ADR-0007** holds the decision and what reversing it would cost.
 */

import { agreementAnswer, type AgreementSlug, type Agreements } from './agreements.js';
import { isEmailAddress } from '../forms.js';

/**
 * Who is asked the three questions, separately.
 *
 * Separately, and not as one household answer, because the live form asks them
 * that way and because a household where one parent disagrees is exactly the
 * conversation the flag exists to start. A family with no second parent leaves
 * that column blank, which is why an unanswered question is neither a "no" nor
 * an error — and why the completeness rule asks for *one* full column rather
 * than all three.
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
   * **Optional**, matching the school's live form, and never a requirement:
   * saying what you think must cost a family nothing.
   */
  objections: string;
  /**
   * The Code of Conduct and Handbook agreements (#71), per family.
   *
   * Per family and not per child, because the live form asks once. Absent means
   * unanswered — or not asked, when the school has not published that document.
   * Since #85 an *asked* question must be answered before the application can be
   * sent; a question the school never asked carries no requirement at all.
   */
  agreements: Agreements;
};

/**
 * The six things that can be missing, in the order they appear on the page.
 *
 * The order is the reading order of the document, because it is what "the first
 * thing that needs attention" means to a family scrolling down: focus goes to
 * the first outstanding field in this list, and the still-needed list is
 * rendered in it.
 *
 * `children` before `classes` is the reading order of *one* row, which is the
 * order the still-needed list wants. It is not always the reading order of the
 * page, because the rows repeat and the class list is inside them — see
 * `firstError`, which is the one place that difference matters.
 */
export const ERROR_FIELDS = [
  'faith',
  'familyName',
  'email',
  'children',
  'classes',
  'agreements',
] as const;
export type ErrorField = (typeof ERROR_FIELDS)[number];

export type ApplicationErrors = Partial<Record<ErrorField, string>>;

/**
 * A document the form actually asked about.
 *
 * Structural rather than `AskableAgreement`, because the browser builds this
 * from the questions that were rendered and has no use for their titles — and
 * because a rule that needs only the slug should say so.
 */
export type AskedAgreement = { slug: AgreementSlug };

/**
 * Everything wrong with an application, in one pass (#85).
 *
 * Six things can be missing and none of them is an opinion: who is applying, how
 * to reach them, who the children are, whether any class was chosen, whether
 * anybody answered the Statement of Faith questions, and whether each published
 * document was answered. **What was answered is never wrong.** A "No", a
 * "Neither agrees" and a page of objections all pass, because the school asked
 * to be told, not to be agreed with.
 *
 * `asked` is what the page put on screen. A policy the school has not published
 * produces no question and therefore no requirement — the gate matches the form
 * a family was actually shown, always.
 */
export function validateApplication(
  values: ApplicationFields,
  asked: readonly AskedAgreement[] = [],
): ApplicationErrors {
  const errors: ApplicationErrors = {};

  if (!faithColumn(values.faith)) {
    errors.faith =
      'One parent or guardian needs to answer all three questions. Any answer counts — ' +
      '“No” is an answer, and it does not stop your application.';
  }

  if (!values.familyName) errors.familyName = 'We need a family name for the application.';
  if (!values.email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }

  const named = values.children.filter((child) => child.name);
  const ageless = named.find((child) => !child.age);
  if (named.length === 0) {
    errors.children = 'Tell us at least one child’s name, and their age.';
  } else if (ageless) {
    // Named, because "a child needs an age" is not actionable on an eight-row
    // form — and every child this can be about has a name by definition.
    errors.children = `${ageless.name} needs an age beside their name.`;
  }

  if (values.children.every((child) => child.offeringKeys.length === 0)) {
    errors.classes = 'Choose at least one class. If you are not sure yet, write to us instead.';
  }

  if (asked.some((document) => agreementAnswer(values.agreements, document.slug) === '')) {
    errors.agreements =
      'Tell us who agrees to each of these. “Neither agrees” is a real answer — ' +
      'we only need to know.';
  }

  return errors;
}

/**
 * Whether one respondent answered all three questions.
 *
 * One column, and which one is irrelevant: a father applying alone, a mother
 * applying alone and a legal guardian applying alone are the same application as
 * far as this rule is concerned, and a second column half filled in is extra
 * information rather than a new defect.
 */
export function faithColumn(answers: FaithAnswers): FaithRespondent | null {
  return (
    FAITH_RESPONDENTS.find((respondent) =>
      FAITH_QUESTIONS.every((question) => faithAnswer(answers, respondent, question.id) !== ''),
    ) ?? null
  );
}

/**
 * The first outstanding field in reading order, or null when nothing is (#88).
 *
 * `childRow` is the row the `children` rule is about — the first one short of a
 * name or an age. It is needed because the children's section is the one place
 * where `ERROR_FIELDS` and the page disagree: each child's class list is inside
 * that child's fieldset, so the first child's classes are above the *second*
 * child's name. A family whose first child is complete but classless and whose
 * second child has no age meets the empty class list first on the way down, and
 * sending them past it to the age box is exactly the hunt this ticket removes.
 *
 * Only the first row can be the one `classes` is about: the rule fires only when
 * no child anywhere has chosen a class, so row 0's list is always the first
 * empty one. That is why one row number settles it.
 */
export function firstError(errors: ApplicationErrors, childRow = 0): ErrorField | null {
  // The two swap places and nothing else moves, so the order stays one list
  // with one exception in it rather than two lists to keep in step.
  const order =
    childRow > 0
      ? ERROR_FIELDS.map((field) =>
          field === 'children' ? 'classes' : field === 'classes' ? 'children' : field,
        )
      : ERROR_FIELDS;

  return order.find((field) => errors[field] !== undefined) ?? null;
}
