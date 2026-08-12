import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `docs/agents/domain.md` names `CONTEXT.md` as the first thing any agent reads
 * before exploring this repo, and #19 fixes the seven terms that have to be in
 * it from day one. A term quietly dropped from the glossary is how the project
 * starts drifting to synonyms.
 */
const CONTEXT = readFileSync(fileURLToPath(new URL('../../CONTEXT.md', import.meta.url)), 'utf8');

const REQUIRED_TERMS = [
  'day track',
  'enrolment unit',
  'offering',
  'clash',
  'possible clash',
  'payment slot',
  'editable set',
  'announcement',
  'H.O.P.E.',
];

describe('CONTEXT.md', () => {
  it('exists and is not a placeholder', () => {
    expect(CONTEXT.length).toBeGreaterThan(500);
  });

  it.each(REQUIRED_TERMS)('defines "%s" under its own heading', (term) => {
    const headings = [...CONTEXT.matchAll(/^#{2,4}\s+(.+)$/gm)].map((m) => m[1].trim());
    expect(headings.map((h) => h.toLowerCase())).toContain(term.toLowerCase());
  });

  /**
   * The house-style contract (#115), stated where the glossary defines the term
   * it turns on.
   *
   * Until #112, #113 and #114 were paid, this document said the British
   * spelling *was* the school's term, "used consistently" — and the site read
   * that way. The rule is now narrower, and both halves have to be written
   * down: prose is American, and the British forms survive only as identifiers.
   * A document that states one half without the other is how the conversion
   * gets undone a page at a time.
   */
  describe('the house style', () => {
    it('states that prose is American', () => {
      expect(CONTEXT).toMatch(/prose\s*\n?\s*is\s*\n?\s*american/i);
    });

    it('names the three places a British spelling survives', () => {
      const survives = /column names, enum values and type\s*\n?\s*names/i;
      expect(CONTEXT).toMatch(survives);
      const clause = survives.exec(CONTEXT)![0];
      const sentence = CONTEXT.slice(CONTEXT.indexOf(clause) - 200, CONTEXT.indexOf(clause) + 200);
      expect(sentence).toMatch(/only/i);
    });

    it('no longer claims the British spelling is the term the school uses', () => {
      // The old sentence, verbatim. It licensed "enrolment" in a sentence a
      // family reads, and the scanner in `house-style.test.ts` now forbids that.
      expect(CONTEXT).not.toMatch(/"enrolment" is the term, used consistently/i);
    });
  });

  it('distinguishes clash from possible clash rather than treating them as one term', () => {
    // Matched against the parsed headings rather than raw offsets: the raw form
    // is line-ending sensitive, and this file is CRLF on a Windows checkout.
    const headings = [...CONTEXT.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1]);
    expect(headings).toContain('clash');
    expect(headings).toContain('possible clash');
  });
});
