/**
 * The Code of Conduct and Handbook agreements (#71, #255, the live form's Q34
 * and Q35).
 *
 * Two questions, one answer each, asked once of the family: **Yes** or **No**.
 * The school's live form asks them once, not per child, and this module keeps
 * that shape rather than inferring a per-child question from it.
 *
 * The decisions below are structural rather than cosmetic.
 *
 * **The wording is the site's, and ADR-0020 is why.** These questions were once
 * transcribed from the live form — "Who agrees to the Pharos Academy Handbook?",
 * answered **Student agrees** / **Parent agrees** / **Neither agrees** — on the
 * rule that what a school asks a family to agree to is the school's sentence.
 * The school has since asked for a Yes-or-No question, so the site's questions
 * now differ from the live form's on purpose; that divergence is recorded in
 * `docs/adr/0020-yes-or-no-replaces-who-agrees.md` rather than here.
 *
 * **Old answers are read, never rewritten.** `student`, `parent` and `neither`
 * still decode and still read back — as "Agreed" and "Did not agree" — and only
 * `yes` and `no` are written from now on. There is no migration: rewriting a
 * parent's "Student agrees" into a family "Yes" would claim something no family
 * said, and what a family was shown is the point of storing the version with it.
 *
 * **No never gates a submission.** Nothing here returns an error and nothing
 * here can be read as one: the application gates on having *answered*
 * (ADR-0009), and a **No** is a complete application that sends like any other.
 * It does raise the conversation flag — that is `isFlagged`'s line in
 * `application.ts`, and the one behaviour ADR-0020 changed.
 *
 * **An unanswered question stays unanswered.** Absent is not "no", exactly
 * as an absent `faith` cell is not a "no" — so an answer is stored only once it
 * is given, and the array shape next door is copied for that reason.
 *
 * **The recorded version is the policy's, and the link is not.** A family reads
 * the *current* Handbook, so the question links to the fixed address; the record
 * keeps the version number they were shown, the way `statement_version` keeps
 * which text of the Statement was on screen. A later upload appends a version
 * and cannot reach back into an application that says what was agreed in August.
 *
 * **A policy with no document is not asked about at all.** A policy exists
 * before its file does (`policies/policy.ts`, `publishedPolicies`), and asking a
 * family to agree to a link to nothing is the failure this avoids. The question
 * is absent from the form, nothing is recorded, and the family is not told about
 * a document the school has not published — which is the same rule the public
 * policies page already follows.
 */

import { textField as text } from '../forms.js';

/** The two documents, in the live form's order. Their slugs are `policy.ts`'s. */
export const AGREEMENT_DOCUMENTS = [
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    question: 'Does your family agree to the Pharos Academy Code of Conduct?',
  },
  {
    slug: 'handbook',
    title: 'Handbook',
    question: 'Does your family agree to the Pharos Academy Handbook?',
  },
] as const;

export type AgreementSlug = (typeof AGREEMENT_DOCUMENTS)[number]['slug'];

/**
 * The two answers, and the only two that are ever written (ADR-0020).
 *
 * There is no third radio: "Not answered" is what an untouched question already
 * is, and offering it as a choice invited a family to un-answer a question they
 * cannot un-ask. A mis-click is corrected by choosing the other answer.
 */
export const AGREEMENT_CHOICES = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

/**
 * The answers the record still holds from before ADR-0020, and how it reads
 * them back.
 *
 * Read-only: nothing writes these, and nothing rewrites the rows that have
 * them. `student` and `parent` both said the document was agreed to and neither
 * said by whom in a way the school acted on, so both read back as "Agreed".
 */
const LEGACY_ANSWERS = [
  { value: 'student', label: 'Agreed' },
  { value: 'parent', label: 'Agreed' },
  { value: 'neither', label: 'Did not agree' },
] as const;

/** One answer. Empty is ordinary and is never read as a "no". */
export type AgreementAnswer = 'yes' | 'no' | 'student' | 'parent' | 'neither' | '';

/** What was answered, and against which version of the document. */
export type Agreement = {
  answer: AgreementAnswer;
  /** The policy version on screen when they answered. Null before an upload. */
  version: number | null;
};

/** Answers by policy slug. A slug that is absent was not asked or not answered. */
export type Agreements = Partial<Record<AgreementSlug, Agreement>>;

/**
 * A document as the form can actually ask about it: published, with a version.
 *
 * The page builds these from `publishedPolicies`, so an unpublished Handbook
 * produces no question rather than a question with no link.
 */
export type AskableAgreement = (typeof AGREEMENT_DOCUMENTS)[number] & { version: number };

/** `agreement-handbook` — one radio group per document, and its form field name. */
export function agreementKey(slug: AgreementSlug): string {
  return `agreement-${slug}`;
}

/** The fixed address a family reads the document at. Never the versioned one. */
export function agreementHref(slug: AgreementSlug): string {
  return `/policies/${slug}.pdf`;
}

/**
 * Which of the two the form may ask about, given what is published.
 *
 * `policies` is whatever the policies store holds — the shape is narrowed to the
 * two fields this needs so the caller can hand over `Policy` rows untouched.
 */
export function askableAgreements(
  policies: readonly { slug: string; version: number | null }[],
): AskableAgreement[] {
  return AGREEMENT_DOCUMENTS.flatMap((document) => {
    const policy = policies.find((one) => one.slug === document.slug);
    return policy && policy.version !== null ? [{ ...document, version: policy.version }] : [];
  });
}

/**
 * Read the two answers off a submitted form.
 *
 * Only the documents that were *asked about* are read: a value posted for a
 * policy the page did not render — a stale form, or a hand-made POST — records
 * nothing, because the version it would be recorded against is the version the
 * family was never shown.
 *
 * Only `yes` and `no` are taken. A posted `parent` is a form from before
 * ADR-0020 or one built by hand, and writing it would put a fourth vocabulary
 * into a record that is only ever meant to gain rows in the new one.
 */
export function parseAgreements(form: FormData, askable: readonly AskableAgreement[]): Agreements {
  const agreements: Agreements = {};
  for (const document of askable) {
    const value = text(form, agreementKey(document.slug));
    if (isWritableAnswer(value)) {
      agreements[document.slug] = { answer: value, version: document.version };
    }
  }
  return agreements;
}

/** What one document was answered, or empty when it was not. */
export function agreementAnswer(agreements: Agreements, slug: AgreementSlug): AgreementAnswer {
  return agreements[slug]?.answer ?? '';
}

/**
 * The answer as the office reads it back — a sentence, never a bare "No".
 *
 * The radios say **Yes** and **No** under a question that supplies the rest;
 * the admin list and the notification email have no such question beside them,
 * and "Handbook: No" in a scanned column says nothing about which way it points.
 * Rows from before ADR-0020 read back as "Agreed" and "Did not agree", which is
 * what they said without claiming they said "family".
 */
export function agreementLabel(answer: AgreementAnswer): string {
  if (answer === 'yes') return 'Family agrees';
  if (answer === 'no') return 'Family does not agree';
  return LEGACY_ANSWERS.find((legacy) => legacy.value === answer)?.label ?? 'Not answered';
}

/**
 * The answers as `handbook=yes@3`, answered ones only.
 *
 * One array column rather than four, for the reason `faith` is one: it is one
 * repeated control, and an unanswered question must be able to be *absent*
 * rather than stored as a blank that a later reader mistakes for "neither".
 * The version rides in the same cell because an answer without the version it
 * was given against is the thing #71 exists to stop.
 */
export function encodeAgreements(agreements: Agreements): string[] {
  return AGREEMENT_DOCUMENTS.flatMap((document) => {
    const agreement = agreements[document.slug];
    if (!agreement || agreement.answer === '') return [];
    const version = agreement.version === null ? '' : `@${agreement.version}`;
    return [`${document.slug}=${agreement.answer}${version}`];
  });
}

/**
 * Every answer the record can hold, including the three no form writes any
 * longer.
 *
 * A reader is deliberately wider than a writer here: the rows carrying
 * `student`, `parent` and `neither` are not migrated, so a decoder that only
 * knew `yes` and `no` would silently blank the applications this school already
 * took (ADR-0020).
 */
export function decodeAgreements(cells: readonly string[]): Agreements {
  const agreements: Agreements = {};
  for (const cell of cells) {
    const at = cell.indexOf('=');
    if (at < 1) continue;
    const slug = cell.slice(0, at);
    if (!isAgreementSlug(slug)) continue;

    const [answer, version] = splitVersion(cell.slice(at + 1));
    if (!isStorableAnswer(answer)) continue;
    agreements[slug] = { answer, version };
  }
  return agreements;
}

/** `yes@3` as its two halves. A cell with no version is one from before one. */
function splitVersion(value: string): [string, number | null] {
  const at = value.lastIndexOf('@');
  if (at < 0) return [value, null];

  const version = Number(value.slice(at + 1));
  return [value.slice(0, at), Number.isInteger(version) ? version : null];
}

function isAgreementSlug(value: string): value is AgreementSlug {
  return AGREEMENT_DOCUMENTS.some((document) => document.slug === value);
}

/** One of the two a form may post. Blank and the old three are not among them. */
function isWritableAnswer(value: string): value is 'yes' | 'no' {
  return AGREEMENT_CHOICES.some((choice) => choice.value === value);
}

/** One of the five the record may hold — the two written and the three kept. */
function isStorableAnswer(value: string): value is Exclude<AgreementAnswer, ''> {
  return isWritableAnswer(value) || LEGACY_ANSWERS.some((legacy) => legacy.value === value);
}
