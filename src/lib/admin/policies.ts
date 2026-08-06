import type { PolicyFile } from '../policies/store.js';
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
