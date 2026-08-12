import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { britishSpellings, prose, RULES } from './house-style.js';

/**
 * The house-style scanner (#110): the words a family reads are American.
 *
 * The conversion is finished (#115). This scan shipped green on a repo still
 * full of "cheque" and "enrolment", by writing the debt down as an allowlist of
 * areas awaiting a ticket; #112's home page and site chrome, #114's admin pages
 * and the seeded sentence behind them, and #113's Admissions and Apply flow
 * paid the last of it. What is left below is the contract, not the debt: no
 * path is exempt, and the only survivals are two words in identifier position,
 * each with a stated reason.
 *
 * The rule, as CONTEXT.md now states it: **prose is American; `enrolment` and
 * `cheque` survive only as column names, enum values and type names.** A family
 * reads "check", "enrollment" and "program"; the database keeps
 * `enrolment_units` and `payment_mode = 'cheque'`, because renaming a schema
 * for a spelling has migration cost and no user-visible payoff. `house-style.ts`
 * holds the reading that tells those apart; the first block below is that
 * reading's own tests, and the second is the scan.
 */

const ROOT = new URL('../../', import.meta.url);

/**
 * What the site says. Everything that renders to a browser, an email or an
 * HTTP response.
 *
 * Deliberately not scanned, each for its own reason:
 *
 * - **`docs/`, `CONTEXT.md`, ADRs and code comments** — addressed to
 *   developers, not families. Comments are dropped inside every scanned file
 *   too, which is why this file may discuss a "colour" without failing itself.
 * - **`e2e/` and `*.test.ts`** — they quote the prose rather than publish it. A
 *   spec asserting today's copy follows its page in the same commit, and
 *   flagging both would double every batch's diff for no reader's benefit.
 * - **`scripts/`** — a terminal the office never opens.
 * - **`prototypes/`** — throwaway by definition, and already outside vitest.
 * - **`public/`, `assets/` and `node_modules/`** — static, binary or vendored;
 *   nothing here is ours to reword.
 */
const SCANNED = ['src'];

/** Files inside `SCANNED` that are still not prose. */
const NOT_PROSE = /\.test\.ts$|\.test-helper\.ts$|\.d\.ts$/;

/** A word that stays British, and the reason it is allowed to. */
interface Exception {
  readonly word: string;
  readonly reason: string;
}

/**
 * The allowlist, emptied of batches (#115).
 *
 * It used to hold one entry per area of the site that still read British, each
 * with the ticket that would reword it. #112, #113 and #114 deleted the last of
 * those, and no path is exempt now: the entries below are words, not places,
 * and they buy nothing in prose. `enrolment` in a sentence fails on the Apply
 * page exactly as it fails anywhere else.
 *
 * Each exception states why it survives rather than which ticket will remove
 * it, because none will. The verbatim course catalogue is likewise not listed:
 * it is the school's own copy, transcribed unedited, and it happens to read
 * American already — if it ever stops, it earns a reason here too, never a
 * ticket.
 */
const IDENTIFIER_EXCEPTIONS: readonly Exception[] = [
  {
    word: 'enrolment',
    reason:
      'the `enrolment_units` column, the `enrolment` seed key and the `EnrolmentUnit` type — renaming a schema for a spelling has migration cost and no user-visible payoff',
  },
  {
    word: 'cheque',
    reason: "the `payment_mode = 'cheque'` enum value and the `PaymentMode` type naming it",
  },
];

/** One violation, in the form a failure prints it. */
interface Offence {
  readonly path: string;
  readonly line: string;
}

function filesUnder(entry: string): string[] {
  const path = fileURLToPath(new URL(entry, ROOT));
  if (!statSync(path).isDirectory()) return [entry];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) =>
    child.name === 'node_modules' ? [] : filesUnder(`${entry}/${child.name}`),
  );
}

const SOURCES = SCANNED.flatMap(filesUnder).filter(
  (path) => /\.(astro|ts)$/.test(path) && !NOT_PROSE.test(path),
);

const OFFENCES: Offence[] = SOURCES.flatMap((path) => {
  const source = readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
  return britishSpellings(source, path.endsWith('.astro') ? 'astro' : 'ts').map((found) => ({
    path,
    line: `${path}:${found.line} — "${found.word}", use "${found.american}"`,
  }));
});

describe('the house style', () => {
  it('found sources to check, so a broken scan cannot pass silently', () => {
    expect(SOURCES.length).toBeGreaterThan(80);
    expect(SOURCES).toContain('src/pages/index.astro');
    expect(SOURCES).toContain('src/pages/admissions/apply.astro');
  });

  it('rules on the words this project has argued about', () => {
    const ruled = (word: string) => RULES.some(({ british }) => new RegExp(british).test(word));
    expect(ruled('enrolment')).toBe(true);
    expect(ruled('cheque')).toBe(true);
    expect(ruled('programme')).toBe(true);
  });

  it('leaves the inflections the two Englishes agree on', () => {
    // "enrolling" and "enrolled" double the l on both sides of the Atlantic, so
    // a rule that flags them makes a page reword a word that was already right.
    const ruled = (word: string) => RULES.some(({ british }) => new RegExp(british).test(word));
    expect(ruled('enrolling')).toBe(false);
    expect(ruled('enrolled')).toBe(false);
  });

  it('finds no British spelling in prose, anywhere, with nothing exempted', () => {
    expect(OFFENCES.map((offence) => offence.line)).toEqual([]);
  });

  it('allows no path — the allowlist is words with reasons, not batches', () => {
    for (const { word, reason } of IDENTIFIER_EXCEPTIONS) {
      expect(reason.length).toBeGreaterThan(20);
      // A path would read as a batch waiting for a ticket, which is the shape
      // #115 removed. An exception names a word and says why it survives.
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it.each(IDENTIFIER_EXCEPTIONS)('lets $word through as an identifier only', ({ word }) => {
    const identifiers = `const ${word}Units = 3;\nconst column = '${word}_units';\ntype Mode = '${word}';`;
    expect(britishSpellings(identifiers, 'ts')).toEqual([]);
    // The same word in a sentence is the violation the exception does not buy.
    expect(britishSpellings(`const line = 'The ${word} was posted today.';`, 'ts')).not.toEqual([]);
  });

  it.each(SOURCES.filter((path) => /index\.astro$|apply\.astro$|home\/timetable\.ts$/.test(path)))(
    'fails when a British spelling is introduced into %s',
    (path) => {
      // The scan being green is only worth something if it is still live on the
      // files it covers. Reword a real one in memory and it goes red.
      const source = readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
      const kind = path.endsWith('.astro') ? 'astro' : 'ts';
      const reworded = `${source}\nconst introduced = 'The programme centre, in colour.';\n`;
      expect(britishSpellings(reworded, kind).map((found) => found.word)).toEqual([
        'centre',
        'colour',
        'programme',
      ]);
    },
  );
});

describe('prose and identifiers', () => {
  const ts = (source: string) => britishSpellings(source, 'ts').map((found) => found.word);
  const astro = (source: string) => britishSpellings(source, 'astro').map((found) => found.word);

  it('reads a sentence a family would see', () => {
    expect(ts(`const line = 'Post the cheque to the school.';`)).toEqual(['cheque']);
  });

  it('leaves a column name alone', () => {
    expect(ts(`const column = 'enrolment_units';`)).toEqual([]);
    expect(ts(`sql\`select enrolment_units from offerings where mode = 'cheque'\``)).toEqual([]);
  });

  it('leaves an identifier and an enum value alone', () => {
    expect(ts(`const enrolmentUnits = 3;\ntype PaymentMode = 'cheque' | 'card';`)).toEqual([]);
  });

  it('leaves a comment alone, because nobody outside the repo reads one', () => {
    expect(ts(`// The cheque column, spelled the school's way.\nconst a = 1;`)).toEqual([]);
    expect(ts(`/** An enrolment unit. */\nconst b = 2;`)).toEqual([]);
  });

  it('is not fooled by a regex holding a quote', () => {
    // `/['"]/` opens a string that never closes, if the scan is naive enough to
    // read it as one — and everything after it goes unscanned.
    expect(ts(`const quoted = /['"]/;\nconst line = 'A cheque, posted.';`)).toEqual(['cheque']);
  });

  it('reads template text and a prose attribute, not a class list or an href', () => {
    expect(
      astro(`<p class="grey mt-4"><a href="/enrolment">Post the cheque today</a></p>`),
    ).toEqual(['cheque']);
    expect(astro(`<img src="/a.png" alt="A cheque, made out to the school" />`)).toEqual(['cheque']);
  });

  it('reads markup returned from an expression', () => {
    // The Apply page is mostly this shape, and a scan that stops at `{` misses
    // every word inside it.
    expect(astro(`<div>{sent && (<p>Your cheque has not reached us.</p>)}</div>`)).toEqual([
      'cheque',
    ]);
  });

  it('does not read the code around that markup as text', () => {
    const source = `<div>{rows.filter((row) => row.enrolment > 0).map((row) => <b>{row.id}</b>)}</div>`;
    expect(astro(source)).toEqual([]);
  });

  it('skips style and script blocks whole', () => {
    expect(astro(`<style>/* the grey behind the colour band */\n.a { color: red }</style>`)).toEqual(
      [],
    );
    expect(astro(`<script>// the cheque toggle\nconst a = 1;</script>`)).toEqual([]);
  });

  it('counts the line a reader would find the word on', () => {
    const source = `---\nconst a = 1;\n---\n<p>\n  A cheque.\n</p>\n`;
    expect(britishSpellings(source, 'astro')).toEqual([
      { word: 'cheque', american: 'check', line: 5 },
    ]);
  });

  it('blanks what it hides rather than dropping it, so offsets still hold', () => {
    const source = `const a = 'x';\n// cheque\nconst b = 'A cheque.';\n`;
    const visible = prose(source, 'ts');
    expect(visible).toHaveLength(source.length);
    expect(visible.split('\n')).toHaveLength(source.split('\n').length);
    expect(visible.trim()).toBe('A cheque.');
  });
});
