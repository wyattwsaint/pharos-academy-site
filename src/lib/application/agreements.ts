/**
 * The Code of Conduct and Handbook agreements (#71, the live form's Q34 and Q35).
 *
 * Two questions, one answer each, asked once of the family: **Student agrees**,
 * **Parent agrees**, **Neither agrees**. The school's live form asks them that
 * way — once, not per child — and this module keeps that shape rather than
 * inferring a per-child question from the singular word "student".
 *
 * Three decisions are structural rather than cosmetic.
 *
 * **"Neither agrees" is a real answer and never gates a submission.** The live
 * form allows it. Nothing here returns an error, nothing here can be read as
 * one, and `isFlagged` does not consult these answers: the flag routes an
 * application to a conversation, and flagging every family who left the
 * Handbook question alone would bury the Statement of Faith signal under
 * routine noise. Whether that should change is Jill's call, not this module's,
 * and it is one line in `application.ts` when she makes it.
 *
 * **An unanswered question stays unanswered.** Absent is not "neither", exactly
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
    question: 'Who agrees to the Pharos Academy Code of Conduct?',
  },
  {
    slug: 'handbook',
    title: 'Handbook',
    question: 'Who agrees to the Pharos Academy Handbook?',
  },
] as const;

export type AgreementSlug = (typeof AGREEMENT_DOCUMENTS)[number]['slug'];

/**
 * The three answers, in the family's own words from the live form.
 *
 * Transcribed rather than drafted, for the reason the Statement's questions are:
 * what a school asks a family to agree to is the school's sentence.
 */
export const AGREEMENT_CHOICES = [
  { value: 'student', label: 'Student agrees' },
  { value: 'parent', label: 'Parent agrees' },
  { value: 'neither', label: 'Neither agrees' },
] as const;

/** One answer. Empty is ordinary and is never read as "neither". */
export type AgreementAnswer = 'student' | 'parent' | 'neither' | '';

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
 */
export function parseAgreements(form: FormData, askable: readonly AskableAgreement[]): Agreements {
  const agreements: Agreements = {};
  for (const document of askable) {
    const value = text(form, agreementKey(document.slug));
    if (isAgreementAnswer(value) && value !== '') {
      agreements[document.slug] = { answer: value, version: document.version };
    }
  }
  return agreements;
}

/** What one document was answered, or empty when it was not. */
export function agreementAnswer(agreements: Agreements, slug: AgreementSlug): AgreementAnswer {
  return agreements[slug]?.answer ?? '';
}

/** The answer as the admin reads it back — the family's own words. */
export function agreementLabel(answer: AgreementAnswer): string {
  return AGREEMENT_CHOICES.find((choice) => choice.value === answer)?.label ?? 'Not answered';
}

/**
 * The answers as `handbook=parent@3`, answered ones only.
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

export function decodeAgreements(cells: readonly string[]): Agreements {
  const agreements: Agreements = {};
  for (const cell of cells) {
    const at = cell.indexOf('=');
    if (at < 1) continue;
    const slug = cell.slice(0, at);
    if (!isAgreementSlug(slug)) continue;

    const [answer, version] = splitVersion(cell.slice(at + 1));
    if (!isAgreementAnswer(answer) || answer === '') continue;
    agreements[slug] = { answer, version };
  }
  return agreements;
}

/** `parent@3` as its two halves. A cell with no version is one from before one. */
function splitVersion(value: string): [string, number | null] {
  const at = value.lastIndexOf('@');
  if (at < 0) return [value, null];

  const version = Number(value.slice(at + 1));
  return [value.slice(0, at), Number.isInteger(version) ? version : null];
}

function isAgreementSlug(value: string): value is AgreementSlug {
  return AGREEMENT_DOCUMENTS.some((document) => document.slug === value);
}

function isAgreementAnswer(value: string): value is AgreementAnswer {
  return value === '' || AGREEMENT_CHOICES.some((choice) => choice.value === value);
}
