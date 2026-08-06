import { describe, expect, it } from 'vitest';

import { parsePolicy, parsePolicyDraft } from './policies.js';

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
