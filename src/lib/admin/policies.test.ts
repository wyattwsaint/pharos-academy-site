import { describe, expect, it } from 'vitest';

import {
  NOT_PUBLISHED_YET,
  parsePolicy,
  parsePolicyDraft,
  policyDeletion,
  policyInheritance,
} from './policies.js';

/**
 * The two policy forms (#28).
 *
 * The create form is the one worth testing hardest, and what is tested about it
 * is mostly what it *cannot* do: it takes three fields, and a submission that
 * smuggles a description, a file or a date past it changes nothing. That is the
 * ticket's "must stay genuinely simple" as an assertion rather than a comment,
 * because the way a form like this stops being simple is one field at a time.
 */

/** A form body, built the way a browser posts one. */
function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

/** A real, minimal PDF — the signature is what the parser actually checks. */
const PDF = new File(
  [Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'latin1')],
  'handbook.pdf',
  { type: 'application/pdf' },
);

describe('the create form', () => {
  it('takes a title, a position and the tick', () => {
    const parsed = parsePolicyDraft(form({ title: 'Photography Consent', position: '5' }));
    expect(parsed.errors).toEqual({});
    expect(parsed.values).toEqual({ title: 'Photography Consent', position: '5', signed: false });
  });

  it('reads an unticked box as not signed and a ticked one as signed', () => {
    expect(parsePolicyDraft(form({ title: 'A', position: '1' })).values.signed).toBe(false);
    expect(parsePolicyDraft(form({ title: 'A', position: '1', signed: 'on' })).values.signed).toBe(
      true,
    );
  });

  it('refuses a title of spaces, which the browser’s own required lets through', () => {
    const parsed = parsePolicyDraft(form({ title: '   ', position: '1' }));
    expect(parsed.errors.title).toContain('cannot be empty');
  });

  it('refuses a position that is not a whole number', () => {
    expect(parsePolicyDraft(form({ title: 'A', position: 'first' })).errors.position).toContain(
      'whole number',
    );
    expect(parsePolicyDraft(form({ title: 'A', position: '1.5' })).errors.position).toContain(
      'whole number',
    );
  });

  it('refuses a position that is a slip of the hand rather than a position', () => {
    expect(parsePolicyDraft(form({ title: 'A', position: '2026' })).errors.position).toContain(
      'between 1 and 99',
    );
    expect(parsePolicyDraft(form({ title: 'A', position: '0' })).errors.position).toContain(
      'between 1 and 99',
    );
  });

  // The simplicity is the requirement, so it is asserted rather than trusted.
  // A description or a file posted to this form is ignored, not stored.
  it('ignores anything posted to it that is not one of the three', () => {
    const parsed = parsePolicyDraft(
      form({
        title: 'Photography Consent',
        position: '5',
        description: 'Smuggled in.',
        updatedAt: '2020-01-01',
      }),
    );
    expect(Object.keys(parsed.values).sort()).toEqual(['position', 'signed', 'title']);
  });
});

describe('the edit form', () => {
  it('takes the sentence that says what the document is', async () => {
    const parsed = await parsePolicy(
      form({
        title: 'Handbook',
        description: 'How Pharos works day to day.',
        position: '1',
        signed: 'on',
      }),
    );
    expect(parsed.errors).toEqual({});
    expect(parsed.values.description).toBe('How Pharos works day to day.');
  });

  it('refuses to publish a policy with no sentence under its title', async () => {
    const parsed = await parsePolicy(form({ title: 'Handbook', description: '', position: '1' }));
    expect(parsed.errors.description).toContain('one sentence');
  });

  // The ordinary save: Jill fixing a typo. A file input nobody touched must
  // mean "leave the document alone", never "replace it with nothing".
  it('reports no file when the input was not touched', async () => {
    const parsed = await parsePolicy(
      form({ title: 'Handbook', description: 'A sentence.', position: '1' }),
    );
    expect('file' in parsed).toBe(false);
  });

  it('accepts a PDF and keeps its name', async () => {
    const parsed = await parsePolicy(
      form({ title: 'Handbook', description: 'A sentence.', position: '1', file: PDF }),
    );
    expect(parsed.errors).toEqual({});
    expect(parsed.file!.filename).toBe('handbook.pdf');
  });

  // The declared type and the `.pdf` on the end of the name are both typed by
  // whoever is uploading. The signature is the half that is not.
  it('refuses a file that is only called a PDF', async () => {
    const impostor = new File([Buffer.from('<html>not a pdf</html>')], 'handbook.pdf', {
      type: 'application/pdf',
    });
    const parsed = await parsePolicy(
      form({ title: 'Handbook', description: 'A sentence.', position: '1', file: impostor }),
    );
    expect(parsed.errors.file).toContain('not a PDF');
    expect(parsed.file).toBeUndefined();
  });

  it('strips a path off a filename rather than trusting it to be absent', async () => {
    const sneaky = new File([PDF], '../../etc/handbook.pdf', { type: 'application/pdf' });
    const parsed = await parsePolicy(
      form({ title: 'Handbook', description: 'A sentence.', position: '1', file: sneaky }),
    );
    expect(parsed.file!.filename).toBe('handbook.pdf');
  });
});

/**
 * The confirmation before a policy is deleted (#260).
 *
 * Asserted at this seam rather than through a browser because the wording *is*
 * the safety net: there is no undo, no soft delete and no trash view, so the
 * only thing between a stray press and a policy that has to be typed in again
 * is what these sentences say. A browser can show that a screen appeared; only
 * this can show that it said the thing that makes pressing safe.
 */
describe('what the screen says before deleting a policy', () => {
  it('names the policy in the heading and on the button that does it', () => {
    const deletion = policyDeletion('Handbook', 2);

    expect(deletion.heading).toBe('Delete Handbook?');
    expect(deletion.confirmLabel).toBe('Yes, delete Handbook');
    expect(deletion.declineLabel).toBe('Go back without deleting');
  });

  it('says what goes: the policies page and the admin', () => {
    const { goes } = policyDeletion('Handbook', 2);

    expect(goes).toContain('Handbook');
    expect(goes).toContain('policies page');
    expect(goes).toContain('this admin');
  });

  /*
   * The half that makes this confirmation different from every other delete on
   * the site. "Delete" reads as though the documents go too, and an application
   * records its agreement as `handbook=parent@3` with no foreign key — so the
   * screen has to say the PDFs are kept, or the school will reasonably believe
   * it is about to destroy what a family signed.
   */
  it('says what is kept, and that a family can still open what they agreed to', () => {
    const { kept } = policyDeletion('Handbook', 3);

    expect(kept).toContain('All 3 documents');
    expect(kept).toContain('are kept');
    expect(kept).toContain('permanent address');
    expect(kept).toContain('already agreed');
  });

  it('counts one document as one, in words that read like a sentence', () => {
    const { kept } = policyDeletion('Handbook', 1);

    expect(kept).toContain('The one document');
    expect(kept).toContain('is kept');
    expect(kept).not.toContain('documents');
  });

  // The case this delete mostly exists for: a policy created with the wrong
  // title before anybody uploaded anything. Promising that every document is
  // kept would be a reassurance about nothing.
  it('does not promise to keep documents when there are none', () => {
    const { kept } = policyDeletion('Transport Policy', 0);

    expect(kept).toContain('No document has ever been uploaded');
    expect(kept).toContain('nothing else goes with it');
    expect(kept).not.toContain('kept');
  });

  it('says the press is final', () => {
    for (const versions of [0, 1, 5]) {
      const { undo } = policyDeletion('Handbook', versions);
      expect(undo).toContain('no undo');
      expect(undo).toContain('typing it in again');
    }
  });
});

/**
 * The question asked when a new policy's address already has documents (#268).
 *
 * At this seam because the round trip and the wording are two different claims,
 * and only one of them needs a browser. What a browser shows is that a screen
 * appeared and that pressing each button led somewhere different; what only
 * this can show is that the screen said enough for the answer to be the right
 * one — how many documents are there, when they arrived, and what each choice
 * does to the address afterwards.
 */
describe('what the screen asks when an address already has documents', () => {
  const ADDRESSES = { existing: '/policies/handbook.pdf', fresh: '/policies/handbook-2.pdf' };

  function kept(versions: number[]): { version: number; uploadedAt: Date }[] {
    return versions.map((version) => ({
      version,
      uploadedAt: new Date(Date.UTC(2026, 2, version)),
    }));
  }

  it('offers the two choices, and names the address on each', () => {
    const asked = policyInheritance('Handbook', kept([1, 2, 3]), ADDRESSES);

    expect(asked.heading).toBe('That Address Already Has Documents');
    expect(asked.continueLabel).toContain('/policies/handbook.pdf');
    expect(asked.freshLabel).toContain('/policies/handbook-2.pdf');
  });

  // The facts that make the question answerable: a school recognises "three
  // documents, uploaded across the spring" as the Handbook it deleted, and
  // recognises it as nothing to do with a form it is inventing today.
  it('counts the documents and says when they were uploaded', () => {
    const asked = policyInheritance('Handbook', kept([1, 2, 3]), ADDRESSES);

    expect(asked.documents).toContain('3 documents');
    expect(asked.documents).toContain('/policies/handbook.pdf');
    expect(asked.documents).toContain('between 1 March 2026 and 3 March 2026');
  });

  it('counts one document as one, in words that read like a sentence', () => {
    const asked = policyInheritance('Handbook', kept([1]), ADDRESSES);

    expect(asked.documents).toContain('One document was uploaded');
    expect(asked.documents).toContain('on 1 March 2026');
    expect(asked.documents).not.toContain('documents');
  });

  it('says so plainly when they all arrived on one day', () => {
    const sameDay = [
      { version: 1, uploadedAt: new Date(Date.UTC(2026, 2, 4, 9)) },
      { version: 2, uploadedAt: new Date(Date.UTC(2026, 2, 4, 16)) },
    ];

    const asked = policyInheritance('Handbook', sameDay, ADDRESSES);

    expect(asked.documents).toContain('all on 4 March 2026');
    expect(asked.documents).not.toContain('between');
  });

  /*
   * The number is the reason the question is asked at all. Continuing means the
   * next upload is 4, not 1 — a second document at `/policies/handbook/v1.pdf`
   * is the one thing a permanent address may never mean.
   */
  it('says which version the next upload would be, on the history it found', () => {
    const asked = policyInheritance('Handbook', kept([1, 2, 3]), ADDRESSES);

    expect(asked.choice).toContain('version 4');
    expect(asked.choice).toContain('rather than version 1');
  });

  // The numbering follows the highest surviving version, not the count. The two
  // agree today and would stop agreeing the moment anything ever removed one.
  it('counts from the highest version there is, not from how many there are', () => {
    const asked = policyInheritance('Handbook', kept([3, 7]), ADDRESSES);

    expect(asked.choice).toContain('version 8');
  });

  it('says what each choice does to the address', () => {
    const asked = policyInheritance('Handbook', kept([1, 2]), ADDRESSES);

    expect(asked.choice).toContain('Handbook coming back');
    expect(asked.choice).toContain('/policies/handbook.pdf');
    expect(asked.choice).toContain('/policies/handbook-2.pdf');
    expect(asked.choice).toContain('stay exactly where they are');
  });

  /*
   * Both outcomes end on the same sentence, because it is true of both: a
   * policy is published by its file and not by its row, and a school that has
   * just re-added the Handbook is exactly the person who would assume otherwise.
   */
  it('reports either outcome by naming the address it landed on', () => {
    const asked = policyInheritance('Handbook', kept([1, 2, 3]), ADDRESSES);

    expect(asked.continued).toContain('/policies/handbook.pdf');
    expect(asked.continued).toContain('version 4');
    expect(asked.continued).toContain(NOT_PUBLISHED_YET);

    expect(asked.separate).toContain('/policies/handbook-2.pdf');
    expect(asked.separate).toContain('left exactly as they were');
    expect(asked.separate).toContain(NOT_PUBLISHED_YET);
  });
});
