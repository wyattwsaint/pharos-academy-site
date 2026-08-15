import type { PolicyFile } from '../policies/store.js';
import { updatedOnLabel } from '../policies/views.js';
import { isPdf, MAX_UPLOAD_BYTES, megabytes, plainFilename } from './pdf-upload.js';

/**
 * A policy, as the admin's two forms post it (#28).
 *
 * **Two parsers, because there are two forms, and the smaller one is the
 * ticket.** Creating a policy is the one action in the whole admin that makes a
 * structurally wrong *thing* rather than merely a wrong value — a fifth
 * document on the parent path that nobody meant to publish, at an address that
 * is then permanent. So the create form asks three questions and this module
 * refuses to grow a fourth: no description, no file, no date. Everything a
 * mistake would be *correctable* in lives on the edit form next door.
 *
 * Both parsers work like `announcements.ts`: they always hand back values,
 * valid or not, so a rejected form redisplays what was typed, and they collect
 * every complaint at once rather than one per round trip.
 *
 * **There is no date field in either of them.** That is not an oversight to be
 * tidied up later — it is acceptance criterion 2. The updated date comes from
 * the upload's clock, so it cannot be wrong, because nobody types it.
 */

/** What the create form asks. Three questions, and that is the whole list. */
export type PolicyDraftFields = {
  title: string;
  /** Typed as text so a rejected form can redisplay "abc" rather than blanking it. */
  position: string;
  signed: boolean;
};

/** What the edit form asks: the same three, plus the sentence under the title. */
export type PolicyFields = PolicyDraftFields & {
  description: string;
};

export type PolicyErrors = Partial<Record<keyof PolicyFields | 'file', string>>;

export type ParsedPolicyDraft = {
  values: PolicyDraftFields;
  errors: PolicyErrors;
};

export type ParsedPolicy = {
  values: PolicyFields;
  /**
   * The uploaded file, present only when the form actually sent one.
   *
   * Two-valued rather than the announcements' three, and the missing value is
   * the point: there is **no way to remove a policy's file**. Taking the
   * document down while leaving the address up is exactly the broken link this
   * ticket exists to make impossible, so "remove" is not a control the screen
   * offers and not a state this type can express.
   */
  file?: PolicyFile;
  errors: PolicyErrors;
};

/** The human names of the fields, used in both forms and their errors. */
export const LABELS: Record<keyof PolicyFields | 'file', string> = {
  title: 'Title',
  description: 'What it is',
  position: 'Position in the list',
  signed: 'Parents sign this',
  file: 'The document',
};

/** The largest policy PDF. One limit, shared with announcements. */
export const MAX_POLICY_BYTES = MAX_UPLOAD_BYTES;

/**
 * Read the create form.
 *
 * Note what is *not* here: no file, no description, and no way to say either.
 * A policy is created and then filled in, which is two steps rather than one on
 * purpose — the second step is undoable and the first one is not.
 */
export function parsePolicyDraft(form: FormData): ParsedPolicyDraft {
  const values: PolicyDraftFields = {
    title: text(form, 'title'),
    position: text(form, 'position'),
    signed: form.get('signed') !== null,
  };

  const errors: PolicyErrors = {};
  if (!values.title) errors.title = `${LABELS.title} cannot be empty.`;
  const positionError = checkPosition(values.position);
  if (positionError) errors.position = positionError;

  return { values, errors };
}

/** Read the edit form, upload and all. */
export async function parsePolicy(form: FormData): Promise<ParsedPolicy> {
  const draft = parsePolicyDraft(form);
  const values: PolicyFields = {
    ...draft.values,
    description: text(form, 'description'),
  };
  const errors: PolicyErrors = { ...draft.errors };

  if (!values.description) {
    errors.description =
      'Say in one sentence what this document is, so a parent is not opening twenty pages to find out.';
  }

  const upload = await readFile(form);
  if (upload.error) errors.file = upload.error;

  const parsed: ParsedPolicy = { values, errors };
  if (upload.file) parsed.file = upload.file;
  return parsed;
}

/**
 * The uploaded file, if the form sent one.
 *
 * A browser posts an empty `File` for a file input nobody touched, so emptiness
 * is what means "leave the document alone" — which is what a save that only
 * fixed a typo in the description means, and it is the ordinary case.
 */
async function readFile(form: FormData): Promise<{ file?: PolicyFile; error?: string }> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return {};

  if (file.size > MAX_POLICY_BYTES) {
    return {
      error: `That PDF is ${megabytes(file.size)} MB. ${megabytes(
        MAX_POLICY_BYTES,
      )} MB is the most a policy can be — the largest the school publishes today is under a megabyte.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isPdf(file, bytes)) {
    return {
      error:
        'That file is not a PDF. Policies are PDFs — the school writes them in Word and exports them.',
    };
  }

  return { file: { filename: plainFilename(file.name, 'policy.pdf'), bytes } };
}

/**
 * What the screen says before a policy is deleted (#260, ADR-0021).
 *
 * The wording is here rather than in the page because it is the whole safety
 * net. There is no undo, no soft delete and no trash view; the only thing
 * standing between a stray press and a policy that has to be typed in again is
 * these four sentences, and a sentence that matters that much is testable at a
 * seam rather than asserted through a browser.
 *
 * **It names what is kept as loudly as what goes**, which is the one way this
 * confirmation differs from every other delete on the site. "Delete" reads as
 * though the documents go with the policy, and here they do not: an application
 * records its agreement as `handbook=parent@3` with no foreign key, so the PDF
 * a family was given has to stay readable forever whatever happens to the row
 * that used to own it. A confirmation that left that unsaid would be asking the
 * school to take a risk it is not actually taking.
 *
 * The empty case is not a footnote — it is the case this delete is mostly for.
 * A policy created with the wrong title before anybody uploaded anything has
 * nothing to keep, and saying so is what makes it obviously safe to press.
 */
export type PolicyDeletion = {
  heading: string;
  confirmLabel: string;
  declineLabel: string;
  /** What deleting it takes away. */
  goes: string;
  /** What it does not take away — or that there was never anything to keep. */
  kept: string;
  /** That the press is final. */
  undo: string;
};

export function policyDeletion(title: string, versions: number): PolicyDeletion {
  return {
    heading: `Delete ${title}?`,
    confirmLabel: `Yes, delete ${title}`,
    declineLabel: 'Go back without deleting',
    goes: `${title} comes off the policies page and out of this admin, and the short address the policies page links stops working.`,
    kept: keptSentence(versions),
    undo: 'There is no undo. Putting it back means typing it in again.',
  };
}

/**
 * The three cases, written out as three sentences.
 *
 * Assembled from fragments they would read as assembly — "the one document is"
 * against "all 3 documents are" is a plural agreement in four places inside one
 * template, and the sentence a person is relying on before an irreversible
 * press is the last one to write that way.
 */
function keptSentence(versions: number): string {
  if (versions === 0) {
    return 'No document has ever been uploaded to it, so there is nothing to keep and nothing else goes with it.';
  }
  if (versions === 1) {
    return 'The one document already uploaded is kept. It stays readable at the permanent address it was given, so a family who has already agreed to it can still open exactly what they were shown.';
  }
  return `All ${versions} documents already uploaded are kept. Each stays readable at the permanent address it was given, so a family who has already agreed to one of them can still open exactly what they were shown.`;
}

/**
 * What the screen says when a new policy's address already has documents (#268).
 *
 * The one question the site genuinely cannot answer for itself. A school
 * re-adding the Handbook it deleted last term and a school creating an unrelated
 * document that happens to mint `handbook` post the identical form, and guessing
 * is wrong in both directions: inherit, and a brand new policy silently adopts
 * three PDFs nobody meant; do not inherit, and a returning policy loses the
 * history it left behind — or worse, restarts at version 1 under a slug where
 * version 1 already means a different document.
 *
 * So the screen asks, and the asking is here rather than in the page for the
 * reason `policyDeletion` is: the two choices lead to permanently different
 * addresses, and the sentences a person picks between are worth a seam.
 *
 * It **names the documents it found** — how many, and when they arrived. That is
 * what makes the question answerable: "three documents, uploaded between March
 * and August" is recognisably the Handbook to the person who uploaded them, and
 * recognisably nothing to do with a new form that happens to be called one.
 */
export type PolicyInheritance = {
  heading: string;
  /** How many kept documents there are and when they were uploaded. */
  documents: string;
  /** What each of the two choices does, including the version it lands on. */
  choice: string;
  continueLabel: string;
  freshLabel: string;
  /** The banner after continuing the history. */
  continued: string;
  /** The banner after taking a different address. */
  separate: string;
};

/** What a kept document has to say about itself for the question to be asked. */
export type KeptDocument = {
  version: number;
  uploadedAt: Date;
};

/**
 * The sentence every create lands on, whichever way it went.
 *
 * A policy is published by its file and not by its row, so the one thing that
 * is true of a freshly created policy — including a re-added one, which is the
 * case a school would most reasonably expect to be back on the site already —
 * is that it is not on the policies page yet.
 */
export const NOT_PUBLISHED_YET =
  'It is not on the policies page yet — write the line that says what it is, choose the PDF, and save.';

export function policyInheritance(
  title: string,
  kept: readonly KeptDocument[],
  addresses: { existing: string; fresh: string },
): PolicyInheritance {
  const next = Math.max(...kept.map((document) => document.version)) + 1;

  return {
    heading: 'That Address Already Has Documents',
    documents: documentsSentence(kept, addresses.existing),
    choice: `If this is ${title} coming back, continue that history: the policy returns to ${addresses.existing}, and the next document uploaded to it is version ${next} rather than version 1, so no version number ever means two different documents. If it is a different document that happens to be called the same thing, give it ${addresses.fresh} instead and the kept documents stay exactly where they are.`,
    continueLabel: `Continue the history at ${addresses.existing}`,
    freshLabel: `Use ${addresses.fresh} instead`,
    continued: `Created at ${addresses.existing}, continuing the history that was already there — the next document uploaded is version ${next}. ${NOT_PUBLISHED_YET}`,
    separate: `Created at ${addresses.fresh}, with a history of its own. The documents kept at ${addresses.existing} were left exactly as they were. ${NOT_PUBLISHED_YET}`,
  };
}

/**
 * The documents that are already there, counted and dated.
 *
 * Written out per case rather than assembled, like `keptSentence` above and for
 * the same reason: this is the sentence the school reads to decide which of two
 * permanent addresses a document gets, and a plural agreement threaded through
 * a template is the wrong way to write the sentence that decision rests on.
 */
function documentsSentence(kept: readonly KeptDocument[], address: string): string {
  const dates = kept.map((document) => document.uploadedAt.getTime()).sort((a, b) => a - b);
  const oldest = dateLabel(dates[0]!);
  const newest = dateLabel(dates[dates.length - 1]!);

  if (kept.length === 1) {
    return `One document was uploaded to ${address}, on ${oldest}, by a policy that has since been deleted. It is still readable at its own permanent address, and an application that recorded an agreement still names it.`;
  }
  const when = oldest === newest ? `all on ${oldest}` : `between ${oldest} and ${newest}`;
  return `${kept.length} documents were uploaded to ${address}, ${when}, by a policy that has since been deleted. Each is still readable at its own permanent address, and an application that recorded an agreement still names one of them.`;
}

/** The upload date as the school writes it — the policies page's own format. */
function dateLabel(time: number): string {
  return updatedOnLabel(new Date(time));
}

/** The list position, as a number, or the reason it is not one. */
export function positionNumber(value: string): number {
  return Number.parseInt(value, 10);
}

/**
 * A position is a small whole number.
 *
 * Bounded above as well as below, because the failure worth catching on the
 * dangerous screen is a slip of the hand — a year typed into a position field —
 * rather than a genuine hundredth policy.
 */
function checkPosition(value: string): string | undefined {
  if (!/^\d+$/.test(value)) {
    return 'Give a position as a whole number — 1 puts it at the top of the list.';
  }
  const position = positionNumber(value);
  if (position < 1 || position > 99) {
    return 'A position is between 1 and 99. The school publishes four documents today.';
  }
  return undefined;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
