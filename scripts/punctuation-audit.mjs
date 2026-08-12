#!/usr/bin/env node
/**
 * The punctuation and spacing audit (#148).
 *
 *   npm run audit:punctuation        rewrite docs/punctuation-audit.md
 *
 * Sweeps every piece of copy a family can read — the pages and the string
 * literals in the repo, and the copy the office typed into the admin, which
 * lives in the database and is in no file — and writes the findings out grouped
 * by class of issue.
 *
 * **It writes a report, not a fix.** The rules it applies are in
 * `src/lib/punctuation.ts` and the style they encode is `docs/house-style.md`;
 * neither is licence to reword the school's copy. The report exists so the site
 * owner can say yes or no to a list, one line at a time.
 *
 * The database half needs `DATABASE_URL`; without it the script still runs and
 * says, in the report itself, that the admin's copy was not read. A report that
 * quietly covered half the site would be worse than one that admits it.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { punctuationFindings } from '../src/lib/punctuation.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('docs/punctuation-audit.md', ROOT);

/** The same reading of "what the site says" the house-style scan uses. */
const SCANNED = ['src'];
const NOT_PROSE = /\.test\.ts$|\.test-helper\.ts$|\.d\.ts$/;

/**
 * The columns of the store that hold copy a family reads.
 *
 * Named rather than derived from `information_schema`: most text columns are
 * slugs, filenames, hashes and enum values, and a scan that read those would
 * report a URL as a missing space. `applications` and `inquiries` are
 * deliberately absent — that text is a family's own writing, not the school's,
 * and it is not ours to restyle.
 */
const DB_COPY = [
  { table: 'school_details', id: `'the school details'`, columns: ['mission', 'vision', 'banner_message'] },
  { table: 'money_settings', id: `'the money settings'`, columns: ['refund_terms'] },
  { table: 'announcements', id: 'slug', columns: ['headline', 'body', 'link_label'] },
  { table: 'calendar_events', id: 'slug', columns: ['title', 'place', 'note'] },
  {
    table: 'courses',
    id: 'slug',
    columns: [
      'title',
      'description',
      'age_label',
      'required_text',
      'optional_text',
      'materials_to_buy',
      'materials_fee_note',
      'assessment_fee_note',
      'prerequisites',
    ],
  },
  { table: 'people', id: 'slug', columns: ['role', 'bio'] },
  { table: 'policies', id: 'slug', columns: ['title', 'description'] },
  { table: 'school_year', id: `'the school year'`, columns: ['label'] },
  { table: 'school_year_closures', id: 'label', columns: ['label'] },
];

/**
 * Copy that is transcribed rather than written, and why it cannot simply be
 * tidied.
 *
 * Three files and one table hold the school's own documents word for word, and
 * each has a test beside it that fails on any drift from the capture in
 * `docs/mirror/` — `story.ts` says so in as many words: "including a tidied
 * dash or a corrected space". A finding here is still a finding, and the report
 * still lists it; what changes is who can act on it. The school changes its
 * document, and the transcription follows.
 */
const VERBATIM = new Map([
  [
    'src/lib/about/beliefs.ts',
    'the Statement of Faith and Practice, transcribed from the school’s own document; `beliefs.test.ts` fails on any drift',
  ],
  [
    'src/lib/about/story.ts',
    'the About page, transcribed from the live site; `story.test.ts` fails on any drift, "including a tidied dash or a corrected space"',
  ],
  [
    'src/lib/courses/catalogue.ts',
    'the course catalogue, carried from `docs/mirror/` unedited and reconciled against the school’s nine published sources',
  ],
  ['courses', 'the same course copy as the catalogue seed, as the office edits it in the admin'],
]);

/**
 * Prose in the repo that no family ever reads.
 *
 * The scan's reading of "prose" is `house-style.ts`'s, and it is deliberately
 * generous: a sentence in a string literal counts, because that is how half the
 * site's copy is written. The cost is that a thrown error and a redirect's
 * `because:` field read as sentences too. They are swept — a report that
 * quietly skipped files would not be the complete list the ticket asks for —
 * and then labelled, so nobody spends an afternoon on a message only a
 * developer will ever see.
 */
const DEVELOPER_ONLY = new Map([
  ['src/lib/redirects.ts', 'the redirect table’s `because:` notes, written to whoever maintains it'],
]);

/** A thrown error's message: read in a log, never on a page. */
const THROWN = /new Error\(|throw new/;

/** The classes the report groups by, in the order it prints them. */
const CLASSES = [
  ['double-space', 'Double spaces'],
  ['quotes', 'Quotation marks and apostrophes'],
  ['dashes', 'Dashes'],
  ['spacing', 'Spacing around punctuation'],
  ['ellipsis', 'Ellipses'],
  ['capitalisation', 'Capitalisation of headings'],
];

const stored = await scanDatabase();
const findings = [...scanRepo(), ...stored.findings];
writeFileSync(fileURLToPath(OUT), render(findings, stored.note), 'utf8');
console.log(`${findings.length} finding(s) written to docs/punctuation-audit.md`);

function filesUnder(entry) {
  const path = fileURLToPath(new URL(entry, ROOT));
  if (!statSync(path).isDirectory()) return [entry];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) =>
    child.name === 'node_modules' ? [] : filesUnder(`${entry}/${child.name}`),
  );
}

function scanRepo() {
  const sources = SCANNED.flatMap(filesUnder).filter(
    (path) => /\.(astro|ts)$/.test(path) && !NOT_PROSE.test(path),
  );
  return sources.flatMap((path) => {
    const source = readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
    const kind = path.endsWith('.astro') ? 'astro' : 'ts';
    return punctuationFindings(source, kind).map((finding) =>
      place(finding, path, `\`${path}:${finding.line}\``),
    );
  });
}

/** The admin's copy, and a note saying whether it was read at all. */
async function scanDatabase() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return {
      findings: [],
      note:
        '**The copy stored in the database was not read for this run** — `DATABASE_URL` was ' +
        'not set. Everything below is the copy that lives in the repository. Re-run with the ' +
        'variable set to cover the announcements, courses, policies, people and settings the ' +
        'office edits from the admin.',
    };
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
  const found = [];
  let rows = 0;

  for (const { table, id, columns } of DB_COPY) {
    const list = columns.map((column) => `"${column}"`).join(', ');
    const result = await sql.query(`select ${id} as _id, ${list} from "${table}"`);
    rows += result.length;
    for (const row of result) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value !== 'string' || !value.trim()) continue;
        for (const finding of punctuationFindings(value, 'text')) {
          found.push(place(finding, table, `\`${table}.${column}\` — ${row._id}`));
        }
      }
    }
  }

  return {
    findings: found,
    note: `The copy stored in the database was read as well: ${rows} row(s) across ${DB_COPY.length} tables.`,
  };
}

/**
 * A finding, told where it is and whether anyone here may act on it.
 *
 * `origin` is the file or the table, which is the unit `VERBATIM` is keyed by —
 * a transcription is transcribed whole, never line by line.
 */
function place(finding, origin, where) {
  const call = VERBATIM.has(origin)
    ? 'verbatim'
    : DEVELOPER_ONLY.has(origin) || THROWN.test(finding.context)
      ? 'developer'
      : finding.call;
  return { ...finding, where, call };
}

/**
 * One cell of a table: no pipe to end it early, no backtick to open a code span
 * that never closes, and no newline to end the row.
 */
function escape(text) {
  return text
    .replace(/\|/g, '\\|')
    .replace(/`/g, '&#96;')
    .replace(/\r?\n/g, ' ⏎ ');
}

/** A run of spaces shown as something a reader can count. */
function visible(text) {
  return text.replace(/\u00a0/g, '␣(no-break)').replace(/ {2,}/g, (run) => '·'.repeat(run.length));
}

function render(all, databaseNote) {
  const mechanical = all.filter((finding) => finding.call === 'mechanical');
  const judgement = all.filter((finding) => finding.call === 'judgement');
  const verbatim = all.filter((finding) => finding.call === 'verbatim');
  const developer = all.filter((finding) => finding.call === 'developer');

  const lines = [
    '# Punctuation and spacing audit',
    '',
    '<!-- Generated by `npm run audit:punctuation` (#148). Do not edit by hand. -->',
    '',
    'Every punctuation and spacing inconsistency in the copy a family can read — the pages in',
    'this repository, the sentences inside their code, and the copy the office types into the',
    'admin and the site stores in the database.',
    '',
    '**Nothing in this list has been applied.** The list is the deliverable; the corrections',
    'land once the site owner has said yes to them. The one exception is the `enrolment`',
    'spelling the ticket names, which was already corrected — see *The known typo* below.',
    '',
    'The style being measured against is written down in [docs/house-style.md](house-style.md),',
    'and the rules that find these are `src/lib/punctuation.ts`. Regenerate with',
    '`npm run audit:punctuation`.',
    '',
    databaseNote,
    '',
    '## Summary',
    '',
    '| Class of issue | Findings | Mechanical | Judgement call | Verbatim copy | Developer-only |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const [issue, title] of CLASSES) {
    const mine = all.filter((finding) => finding.issue === issue);
    lines.push(
      `| [${title}](#${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) | ${mine.length} | ` +
        `${mine.filter((f) => f.call === 'mechanical').length} | ` +
        `${mine.filter((f) => f.call === 'judgement').length} | ` +
        `${mine.filter((f) => f.call === 'verbatim').length} | ` +
        `${mine.filter((f) => f.call === 'developer').length} |`,
    );
  }
  lines.push(
    `| **Total** | **${all.length}** | **${mechanical.length}** | **${judgement.length}** | ` +
      `**${verbatim.length}** | **${developer.length}** |`,
    '',
    '**Mechanical** means the correction is the house style and nothing else: the sentence is',
    'unchanged and only the mark moves. **Judgement call** means the correction touches',
    "something the school may have meant — a heading's emphasis, a run of spaces holding a",
    'column apart, a no-break space — and needs a person to say yes.',
    '',
    '**Verbatim copy** is the third answer, and here it is the largest one. Four places hold the',
    'school’s own documents word for word, and each has a test beside it that fails on any',
    'drift from the capture in `docs/mirror/`:',
    '',
    ...[...VERBATIM].map(([origin, reason]) => `- \`${origin}\` — ${reason}.`),
    '',
    'A finding there is real — a tight em dash is still a tight em dash — but it is not ours to',
    'tidy: the school changes its document, and the transcription follows it. They are listed so',
    'the site owner can see them, not so they can be applied here.',
    '',
    '**Developer-only** is the last: a message inside a thrown error, or a note in the redirect',
    'table addressed to whoever maintains it. Half of this site’s copy is written as sentences',
    'inside code, so the sweep cannot tell those apart by where they live — it reads them all and',
    'then says which is which. Nothing in this column is on a page.',
    '',
    '## The known typo',
    '',
    'The ticket names one: `enrolment`, an `l` short of the American spelling the site uses, in',
    'the section about the documents families sign. It is **already corrected** — the Admissions',
    "page's copy about what families sign now reads \u201cAt enrollment, the parent or guardian must",
    'sign two agreement statements\u201d, and the policies page reads \u201csigned at enrollment, in',
    'person\u201d. The correction landed with #113, and `src/lib/house-style.test.ts` fails the build',
    'if the spelling ever comes back in prose. This audit re-checked the pages, the string',
    'literals and the database copy and found no remaining occurrence.',
    '',
  );

  for (const [issue, title] of CLASSES) {
    const mine = all.filter((finding) => finding.issue === issue);
    lines.push(`## ${title}`, '', ...section(issue, mine));
  }

  return `${lines.join('\n')}\n`;
}

/** The prose that introduces one class, then its findings as a table. */
function section(issue, mine) {
  const intro = {
    'double-space': 'One space between sentences and between words. Two is a typewriter habit.',
    quotes:
      'Typographic marks throughout — \u201cthese\u201d and \u2019 — rather than the straight ' +
      'marks a keyboard types. The site is already mostly typographic; these are the places it ' +
      'is not.',
    dashes:
      'An em dash \u2014 spaced \u2014 for a break in a sentence; an en dash for a range of ' +
      'numbers (2026\u20132027, ages 10\u201313); a hyphen only inside a compound word. Where a ' +
      'finding sits inside a sentence quoting the school\u2019s own words \u2014 an admin hint ' +
      'showing an example age label \u2014 it moves only if the copy it quotes moves.',
    spacing:
      'One space after a comma, a semicolon and a full stop; none before. A no-break space is ' +
      'listed separately because it is sometimes deliberate.',
    ellipsis: 'The single character \u2026, never three dots, and never dots with spaces between.',
    capitalisation:
      'Headings in sentence case — the site\u2019s own dominant style, on every page but two. ' +
      'Proper nouns and the names of documents keep their capitals; the *Statement of Faith and ' +
      'Practice* is a document, not a heading style.',
  }[issue];

  if (mine.length === 0) return [intro, '', '_No findings._', ''];

  const rows = mine.map(
    (finding) =>
      `| ${finding.where} | ${escape(visible(finding.context))} | \`${escape(visible(finding.current))}\` | \`${escape(finding.proposed)}\` | ${finding.call === 'mechanical' ? 'mechanical' : `**${finding.call}**`} |`,
  );

  return [
    intro,
    '',
    '| Where | As it reads now | Current | Proposed | Call |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ];
}
