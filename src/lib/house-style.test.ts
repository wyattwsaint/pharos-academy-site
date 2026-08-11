import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { britishSpellings, prose, RULES } from './house-style.js';

/**
 * The house-style scanner (#110): the words a family reads are American.
 *
 * This is the expand step of the British-to-American conversion. It ships green
 * on a repo that is still full of "cheque" and "enrolment", because the
 * allowlist below names every area that violates it today — the debt is written
 * down here rather than paid here. #112, #113 and #114 pay it down by deleting
 * entries, and #115 empties it. #114 has been paid: the admin pages, the
 * policies they publish, and the one seeded sentence behind them now read
 * American, and their entry is gone. So has #113 — Admissions and the Apply
 * flow — which leaves batch 1 and the shared modules as the last debt.
 *
 * The rule it encodes is **prose is American, identifiers are not**. A family
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

/** An area that violates the rule today, and the ticket that will fix it. */
interface Debt {
  readonly area: string;
  readonly paths: readonly string[];
}

/**
 * The debt, one entry per area.
 *
 * Every path here is a place the site currently reads British. Nothing in this
 * ticket rewords any of it: an entry is removed by the batch that fixes the
 * prose behind it, and `no allowlisted area has been paid off already` fails if
 * an entry outlives its violations, so an emptied area cannot sit here
 * unnoticed.
 *
 * The verbatim course catalogue is not listed because it does not violate the
 * rule today. If it ever does, it is not a debt: it is the school's own copy,
 * transcribed and held unedited, and it would need an exception with a reason
 * rather than a ticket.
 */
const ALLOWED: readonly Debt[] = [
  {
    // #112 — batch 1: the home page, the site chrome, and the shared modules
    // they read.
    area: 'shared modules and site plumbing',
    paths: [
      // `announcements/announcement.ts` was here until #114. Its one violation
      // was a *seeded* sentence — a row already live in Neon — so it belonged
      // with the batch that appends the migration to correct the live row, not
      // with the batch that reworded the pages around it.
      'src/lib/backup/export.ts',
      'src/lib/courses/store.ts',
      'src/lib/redirects.ts',
      'src/pages/api/cron/monthly-backup.ts',
    ],
  },
];

const ALLOWED_PATHS = new Set(ALLOWED.flatMap((debt) => debt.paths));

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

  it('finds no British spelling in prose outside the allowlist', () => {
    const unallowed = OFFENCES.filter((offence) => !ALLOWED_PATHS.has(offence.path));
    expect(unallowed.map((offence) => offence.line)).toEqual([]);
  });

  it.each(ALLOWED.flatMap((debt) => debt.paths.map((path) => [path, debt.area] as const)))(
    'still owes %s, allowed for %s',
    (path) => {
      // A path that no longer violates the rule has been paid off, and its
      // entry above is now hiding nothing. Delete it: the allowlist is the
      // record of what is left, and a stale line makes the record a lie.
      expect(OFFENCES.map((offence) => offence.path)).toContain(path);
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
