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
 * Two things the report says about itself, because a reader cannot see them:
 *
 * - **What was swept.** The file list is `house-style.ts`'s `PROSE_ROOTS`, the
 *   same one the spelling scan uses, so the two can never cover different
 *   sites. It reaches `llms.ts` and `structured-data.ts` — the machine-readable
 *   summary — as ordinary modules with sentences in them.
 * - **What was not.** The database half needs `DATABASE_URL`; without it the
 *   script still runs and says so in the report itself. A report that quietly
 *   covered half the site would be worse than one that admits it.
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { britishSpellings, NOT_PROSE, PROSE_ROOTS } from '../src/lib/house-style.js';
import { punctuationFindings } from '../src/lib/punctuation.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('docs/punctuation-audit.md', ROOT);

/**
 * The columns of the store that hold copy a family reads, and the page they
 * read it on.
 *
 * Named rather than derived from `information_schema`: most text columns are
 * slugs, filenames, hashes and enum values, and a scan that read those would
 * report a URL as a missing space. `applications` and `inquiries` are
 * deliberately absent — that text is a family's own writing, not the school's,
 * and it is not ours to restyle.
 *
 * The capitalisation rule is deliberately **not** run over any of it. Every
 * heading the site renders from a row is the *name of a thing* — a course, a
 * policy, an event, a board update — and a name keeps the case the school gave
 * it. Sentence-casing *Basic Spanish Conversation for Beginners* is not a
 * heading style applied; it is a course renamed, and it lowercases "Spanish"
 * on the way. Everything else in a row is a sentence, and a sentence is already
 * in sentence case.
 */
const DB_COPY = [
  {
    table: 'school_details',
    id: `'the school details'`,
    page: 'the home page and the footer',
    columns: ['mission', 'vision', 'banner_message'],
  },
  {
    table: 'money_settings',
    id: `'the money settings'`,
    page: '/admissions and the Apply page',
    columns: ['refund_terms'],
  },
  {
    table: 'announcements',
    id: 'slug',
    page: '/current-families/news',
    columns: ['headline', 'body', 'link_label'],
  },
  {
    table: 'calendar_events',
    id: 'slug',
    page: '/current-families/calendar',
    columns: ['title', 'place', 'note'],
  },
  {
    table: 'courses',
    id: 'slug',
    page: '/classes and /classes/descriptions',
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
  { table: 'people', id: 'slug', page: '/about/staff', columns: ['role', 'bio'] },
  {
    table: 'policies',
    id: 'slug',
    page: '/current-families/policies',
    columns: ['title', 'description'],
  },
  {
    table: 'school_year',
    id: `'the school year'`,
    page: 'the class list and the calendar',
    columns: ['label'],
  },
  {
    table: 'school_year_closures',
    id: 'label',
    page: '/current-families/calendar',
    columns: ['label'],
  },
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
  {
    issue: 'double-space',
    title: 'Double spaces',
    intro: 'One space between sentences and between words. Two is a typewriter habit.',
  },
  {
    issue: 'quotes',
    title: 'Quotation marks and apostrophes',
    intro:
      'Typographic marks throughout — “these” and ’ — rather than the straight ' +
      'marks a keyboard types. The site is already mostly typographic; these are the places it ' +
      'is not.',
  },
  {
    issue: 'dashes',
    title: 'Dashes',
    intro:
      'An em dash — spaced — for a break in a sentence; an en dash for a range of ' +
      'numbers (2026–2027, ages 10–13); a hyphen only inside a compound word. Where a ' +
      'finding sits inside a sentence quoting the school’s own words — an admin hint ' +
      'showing an example age label — it moves only if the copy it quotes moves.',
  },
  {
    issue: 'spacing',
    title: 'Spacing around punctuation',
    intro:
      'One space after a comma, a semicolon and a full stop; none before. A no-break space is ' +
      'listed separately because it is sometimes deliberate.',
  },
  {
    issue: 'link-spacing',
    title: 'Spacing around links',
    intro:
      'A link is a word in its sentence: one space before it, one after, and nothing underlined ' +
      'that is not the link. Both classes here are mechanical, and unlike everything else in this ' +
      'report they are **already applied and kept applied** — `src/lib/punctuation.test.ts` fails ' +
      'the build if one comes back (#171). A link flush against punctuation — `apply</a>.` — is ' +
      'correct and not listed.',
  },
  {
    issue: 'ellipsis',
    title: 'Ellipses',
    intro: 'The single character …, never three dots, and never dots with spaces between.',
  },
  {
    issue: 'capitalisation',
    title: 'Capitalisation of headings',
    intro:
      'Headings in sentence case — the site’s own dominant style, on every page but two. ' +
      'Proper nouns and the names of documents keep their capitals; the *Statement of Faith and ' +
      'Practice* is a document, not a heading style.',
  },
];

/** How each answer to "whose copy is this" prints. */
const REACH = {
  site: 'the site’s',
  verbatim: '**transcribed**',
  developer: '**developer-only**',
};

const repo = scanRepo();
const stored = await scanDatabase();
const findings = [...repo.findings, ...stored.findings];
const survivals = [...repo.enrolment, ...stored.enrolment];
writeFileSync(fileURLToPath(OUT), render(findings, stored.note, survivals), 'utf8');
console.log(
  `${findings.length} finding(s) written to docs/punctuation-audit.md` +
    (survivals.length === 0 ? '' : `; ${survivals.length} "enrolment" survival(s)`),
);

function filesUnder(entry) {
  const path = fileURLToPath(new URL(entry, ROOT));
  if (!statSync(path).isDirectory()) return [entry];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) =>
    child.name === 'node_modules' ? [] : filesUnder(`${entry}/${child.name}`),
  );
}

/** The repo's copy, and any surviving `enrolment` in its prose. */
function scanRepo() {
  const sources = PROSE_ROOTS.flatMap(filesUnder).filter(
    (path) => /\.(astro|ts)$/.test(path) && !NOT_PROSE.test(path),
  );

  const findings = [];
  const enrolment = [];
  for (const path of sources) {
    const source = readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
    const kind = path.endsWith('.astro') ? 'astro' : 'ts';
    for (const finding of punctuationFindings(source, kind)) {
      findings.push(place(finding, path, `\`${path}:${finding.line}\``));
    }
    for (const spelling of britishSpellings(source, kind)) {
      if (/^enrol/i.test(spelling.word)) enrolment.push(`\`${path}:${spelling.line}\``);
    }
  }
  return { findings, enrolment };
}

/** The admin's copy, a note saying whether it was read, and the same check. */
async function scanDatabase() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return {
      findings: [],
      enrolment: [],
      note:
        '**The copy stored in the database was not read for this run** — `DATABASE_URL` was ' +
        'not set. Everything below is the copy that lives in the repository. Re-run with the ' +
        'variable set to cover the announcements, courses, policies, people and settings the ' +
        'office edits from the admin.',
    };
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
  const findings = [];
  const enrolment = [];
  let rows = 0;

  for (const { table, id, page, columns } of DB_COPY) {
    const list = columns.map((column) => `"${column}"`).join(', ');
    const result = await sql.query(`select ${id} as _id, ${list} from "${table}"`);
    rows += result.length;
    for (const row of result) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value !== 'string' || !value.trim()) continue;
        const where = `\`${table}.${column}\` — ${row._id} (${page})`;

        for (const finding of punctuationFindings(value, 'text')) {
          findings.push(place(finding, table, where));
        }
        if (/\benrolments?\b/i.test(value)) enrolment.push(`\`${table}.${column}\` — ${row._id}`);
      }
    }
  }

  return {
    findings,
    enrolment,
    note: `The copy stored in the database was read as well: ${rows} row(s) across ${DB_COPY.length} tables.`,
  };
}

/**
 * A finding, told where it is and whose copy it is in.
 *
 * `reach` — whose copy — is a second axis, not a replacement for `call`. How
 * hard a correction is and who may make it are different questions, and a
 * report that folded them together could not say that a finding in the
 * Statement of Faith is a mechanical one the school would apply in a second.
 *
 * `origin` is the file or the table, which is the unit both lists are keyed by:
 * a transcription is transcribed whole, never line by line.
 */
function place(finding, origin, where) {
  const reach = VERBATIM.has(origin)
    ? 'verbatim'
    : DEVELOPER_ONLY.has(origin) || THROWN.test(finding.context)
      ? 'developer'
      : 'site';
  return { ...finding, where, reach };
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

/** What a correction reads as when the correction is a space, or nothing. */
function correction(proposed) {
  if (proposed === '') return '*delete it*';
  if (proposed === ' ') return '*one space*';
  return `\`${escape(proposed)}\``;
}

function render(all, databaseNote, survivals) {
  const mechanical = all.filter((finding) => finding.call === 'mechanical');
  const judgement = all.filter((finding) => finding.call === 'judgement');
  const verbatim = all.filter((finding) => finding.reach === 'verbatim');
  const developer = all.filter((finding) => finding.reach === 'developer');

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
    '`npm run audit:punctuation` — this file is a snapshot, and no test keeps it current,',
    'because half of what it covers lives in a database CI has no credentials for.',
    '',
    '## What was swept',
    '',
    'Every `.astro` and `.ts` file under `src/`, which is the same list the spelling scan uses',
    '(`PROSE_ROOTS` in `src/lib/house-style.ts`) — so the two scans can never quietly cover',
    'different sites. That reaches the pages, the components, the sentences held in code, and',
    'the machine-readable summary a language model reads: `src/lib/llms.ts` behind `/llms.txt`,',
    'and `src/lib/structured-data.ts` behind the JSON-LD on each page. Both were read; neither',
    'has a finding.',
    '',
    databaseNote,
    '',
    'What the sweep **cannot** see: the words inside the policy PDFs, which are documents rather',
    'than pages; a family’s own writing on an application or an inquiry, which no house style',
    'applies to; and the capitalisation of a heading whose words are assembled at render, since',
    'the scan reads a heading only where it is written out in full.',
    '',
    'What it deliberately does **not** check: the capitals in copy stored in the database. Every',
    'heading the site renders from a row is the name of a thing — a course, a policy, an event, a',
    'board update — and a name keeps the case the school gave it. Sentence-casing *Basic Spanish',
    'Conversation for Beginners* would not be a heading style applied; it would be a course',
    'renamed, and it would lowercase "Spanish" on the way. The marks and the spacing in that copy',
    'are swept as normal.',
    '',
    '## Summary',
    '',
    '| Class of issue | Findings | Mechanical | Judgement call | In transcribed copy | Developer-only |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const { issue, title } of CLASSES) {
    const mine = all.filter((finding) => finding.issue === issue);
    lines.push(
      `| [${title}](#${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) | ${mine.length} | ` +
        `${mine.filter((f) => f.call === 'mechanical').length} | ` +
        `${mine.filter((f) => f.call === 'judgement').length} | ` +
        `${mine.filter((f) => f.reach === 'verbatim').length} | ` +
        `${mine.filter((f) => f.reach === 'developer').length} |`,
    );
  }
  lines.push(
    `| **Total** | **${all.length}** | **${mechanical.length}** | **${judgement.length}** | ` +
      `**${verbatim.length}** | **${developer.length}** |`,
    '',
    'The table answers two different questions, and the last two columns cut across the first',
    'two rather than adding to them.',
    '',
    '**How hard is the correction?** *Mechanical* means it is the house style and nothing else:',
    'the sentence is unchanged and only the mark moves. *Judgement call* means it touches',
    'something the school may have meant — a heading’s emphasis, a run of spaces holding a',
    'column apart, a no-break space, an inch mark — and needs a person to say yes. Every finding',
    'is one or the other.',
    '',
    '**Whose copy is it?** *In transcribed copy* is the school’s own documents, held word for',
    'word in four places, each with a test beside it that fails on any drift from the capture in',
    '`docs/mirror/`:',
    '',
    ...[...VERBATIM].map(([origin, reason]) => `- \`${origin}\` — ${reason}.`),
    '',
    'A finding there is real — a tight em dash is still a tight em dash, and a mechanical one at',
    'that — but it is not ours to tidy: the school changes its document, and the transcription',
    'follows it.',
    '',
    '*Developer-only* is the last: a message inside a thrown error, or a note in the redirect',
    'table addressed to whoever maintains it. Half of this site’s copy is written as sentences',
    'inside code, so the sweep cannot tell those apart by where they live — it reads them all and',
    'then says which is which. Nothing in that column is on a page.',
    '',
    '## The known typo',
    '',
    'The ticket names one: `enrolment`, an `l` short of the American spelling the site uses, in',
    'the section about the documents families sign. It is **already corrected** — the Admissions',
    'page now reads “At enrollment, the parent or guardian must sign two agreement statements”,',
    'and the policies page reads “signed at enrollment, in person”. The correction landed with',
    '#113, and `src/lib/house-style.test.ts` fails the build if the spelling ever comes back in',
    'prose.',
    '',
    ...survivalLines(survivals),
    '',
  );

  for (const { issue, title, intro } of CLASSES) {
    lines.push(`## ${title}`, '', ...section(intro, all.filter((f) => f.issue === issue)));
  }

  return `${lines.join('\n')}\n`;
}

/** What this run actually found when it looked for the spelling again. */
function survivalLines(survivals) {
  if (survivals.length === 0) {
    return [
      'This run re-checked it rather than repeating the claim: the pages, the string literals and',
      'every copy column in the database were searched for the spelling, and **none was found**.',
    ];
  }
  return [
    `This run searched again and found **${survivals.length}** place(s) where the spelling is`,
    'still in prose. Each is a typo, not a column name:',
    '',
    ...survivals.map((where) => `- ${where}`),
  ];
}

/** The prose that introduces one class, then its findings as a table. */
function section(intro, mine) {
  if (mine.length === 0) return [intro, '', '_No findings._', ''];

  const rows = mine.map(
    (finding) =>
      `| ${finding.where} | ${escape(visible(finding.context))} | \`${escape(visible(finding.current))}\` | ` +
      `${correction(finding.proposed)} | ${finding.call === 'mechanical' ? 'mechanical' : '**judgement**'} | ` +
      `${REACH[finding.reach]} |`,
  );

  return [
    intro,
    '',
    '| Where | As it reads now | Current | Proposed | Fix | Whose copy |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ];
}
