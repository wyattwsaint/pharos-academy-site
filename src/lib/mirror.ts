import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Reading the captured Wix site, for the provenance tests.
 *
 * Four suites now assert that what this codebase publishes as the school's own
 * words really is what the school published — the Statement of Faith, the About
 * page's method and values, the giving and volunteering copy, and the volunteer
 * form's five areas of help. All four were reading the capture and flattening
 * it the same way, in four copies. This is that, once.
 *
 * Test-only, and deliberately not imported by anything that renders: it reads
 * from disk, and `docs/mirror/` is a record of the old site rather than an
 * input to the new one. Everything the site *publishes* is transcribed into a
 * module a person has read, and these helpers exist to hold those
 * transcriptions honest.
 */
const ROOT = new URL('../../', import.meta.url);

/** The rendered text of one captured page, by its file basename. */
export function mirrorPage(name: string): string {
  return read(`docs/mirror/pages/${name}.txt`);
}

/** The rendered text of one captured Google Form, by its file basename. */
export function mirrorForm(name: string): string {
  return read(`docs/mirror/forms/${name}.txt`);
}

/** The mirror's record of every off-site link the old site carried. */
export function mirrorExternalLinks(): string {
  return read('docs/mirror/data/external.json');
}

/**
 * Flatten a capture, or a transcription, to just its words.
 *
 * Wix's output is full of non-breaking spaces and zero-width marks, and it
 * breaks a paragraph across lines wherever the editor did. None of that is
 * meaningful, so both sides of every comparison are flattened the same way —
 * and nothing else is normalised. Quotes, dashes and the school's own typos
 * survive, which is the point: they are the school's, not ours to correct.
 */
export function flattenCapture(text: string): string {
  return text.replace(/[ ​‎‏]/g, ' ').replace(/\s+/g, ' ').trim();
}

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
}
