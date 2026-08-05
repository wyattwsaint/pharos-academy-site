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

  it('distinguishes clash from possible clash rather than treating them as one term', () => {
    // Matched against the parsed headings rather than raw offsets: the raw form
    // is line-ending sensitive, and this file is CRLF on a Windows checkout.
    const headings = [...CONTEXT.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1]);
    expect(headings).toContain('clash');
    expect(headings).toContain('possible clash');
  });
});
