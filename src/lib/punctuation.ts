/**
 * Punctuation and spacing, as the site sets them (#148).
 *
 * The site's copy was written across many pages by several hands, and the marks
 * drifted: curly apostrophes in most places and straight ones in others, em
 * dashes almost everywhere and a spaced hyphen here and there, sentence-case
 * headings on every page but two. This module is the reading that finds those,
 * so the report can list them.
 *
 * **It reports; it does not rewrite.** Prose on a school's site is the school's
 * voice, and a scan that silently normalised it would be changing copy nobody
 * asked it to change. Every rule below therefore produces a *finding* — where,
 * what is written now, what the house style asks for, and whether applying it
 * is mechanical or a judgement call about the voice. Applying them is a
 * separate, approved act.
 *
 * The house style the rules encode is written down in `docs/house-style.md`;
 * this module is that document, executable. Two things follow from that:
 *
 * - A rule here is only as good as its exceptions. A phone number is not an age
 *   range, `1,200` is not a comma with a missing space, and `H.O.P.E.` is not a
 *   sentence run into the next one. Each of those is named below, because a
 *   report full of false findings is a report the office stops reading.
 * - The scan reads **prose**, in `house-style.ts`'s sense: template text, the
 *   attributes beside it and the string literals that read as sentences, with
 *   comments and code blanked out. It reads the *ranges* rather than the
 *   blanked string, because the gap a `{…}` expression leaves behind is not a
 *   double space.
 */

import { visibleRanges } from './house-style.js';

/** The classes of issue the report groups by. */
export type Issue =
  | 'double-space'
  | 'quotes'
  | 'dashes'
  | 'spacing'
  | 'ellipsis'
  | 'capitalisation';

/**
 * Whether applying a finding is a decision.
 *
 * `mechanical` — the correction is the house style and nothing else; a straight
 * apostrophe becomes a typographic one and the sentence is otherwise untouched.
 * `judgement` — the correction rewords, restyles or removes something the
 * school may have meant. A heading in title case is the school's emphasis until
 * the school says otherwise.
 */
export type Call = 'mechanical' | 'judgement';

/** One inconsistency, where a reader would find it. */
export interface Finding {
  readonly issue: Issue;
  /** 1-based, counted in the original source. */
  readonly line: number;
  /** Exactly what is written there now. */
  readonly current: string;
  /** What the house style asks for in its place. */
  readonly proposed: string;
  /** Enough of the line around it to recognise the sentence. */
  readonly context: string;
  readonly call: Call;
}

/** A character-level rule: what it matches, and what it asks for instead. */
interface CharRule {
  readonly issue: Issue;
  /** A function where the same rule can be either, by what it matched. */
  readonly call: Call | ((match: string, before: string, after: string) => Call);
  /** Global, and matched against one visible slice at a time. */
  readonly pattern: RegExp;
  /**
   * The correction, or `null` when the surrounding text says this match is not
   * a violation after all — a phone number, a thousands separator, an acronym.
   */
  readonly propose: (match: string, before: string, after: string) => string | null;
}

const EM = '—';
const EN = '–';

/** A phone number as this site writes one: `717-555-0143`. */
const PHONE = /\d{3}-\d{3}-\d{4}/;

/**
 * The rules, in the order a match claims its characters.
 *
 * Order is the tie-break, not a ranking: `. . .` is an ellipsis first and a
 * space before a full stop second, and whichever rule matches first keeps the
 * characters. A later rule overlapping a claimed span is dropped, so one
 * stretch of text produces one finding.
 */
const CHAR_RULES: readonly CharRule[] = [
  {
    issue: 'ellipsis',
    call: 'mechanical',
    // Three or more dots, however they are spaced.
    pattern: /\.[ \t]*\.[ \t]*\.[.\t ]*/g,
    propose: () => '…',
  },
  {
    issue: 'dashes',
    call: 'mechanical',
    pattern: /--+/g,
    propose: () => EM,
  },
  {
    issue: 'dashes',
    call: 'mechanical',
    // A hyphen doing an em dash's work, and an en dash doing the same.
    pattern: /(?<=\S)[ \t]+[-–][ \t]+(?=\S)/g,
    propose: () => ` ${EM} `,
  },
  {
    issue: 'dashes',
    call: 'mechanical',
    // A range: ages, years, grades. Not a phone number, which is three groups
    // of digits and no range at all.
    pattern: /(?<=\d)[ \t]*-[ \t]*(?=\d)/g,
    propose: (_match, before, after) =>
      PHONE.test(`${before.slice(-9)}-${after.slice(0, 9)}`) ? null : EN,
  },
  {
    issue: 'dashes',
    call: 'mechanical',
    // An em dash set tight, where every other one on the site is set spaced.
    pattern: /(?<=\w)—(?=\w)/g,
    propose: () => ` ${EM} `,
  },
  {
    issue: 'spacing',
    call: 'mechanical',
    // A comma or semicolon with nothing after it. Not `1,200`; not the
    // semicolon that closes an HTML entity; and not the comma an American
    // closing quotation mark is set outside of, which has run into a mark
    // rather than into a word.
    pattern: /[,;](?=[^\s\d)\]}”’"'…—–])/g,
    propose: (match, before) => (/&[#a-zA-Z0-9]+$/.test(before) ? null : `${match} `),
  },
  {
    issue: 'spacing',
    call: 'mechanical',
    // A sentence running into the next. Two lowercase letters before the stop
    // is what tells a sentence from `H.O.P.E.`, `U.S.` or `e.g.`, and requiring
    // a capital after it is what leaves `pharosacademy.net` alone.
    pattern: /(?<=[a-z]{2})[.!?](?=[A-Z])/g,
    propose: (match) => `${match} `,
  },
  {
    issue: 'spacing',
    call: 'mechanical',
    // A space before the mark it belongs behind — but not the spaces inside an
    // ellipsis written as separate dots, which is the rule above's finding.
    pattern: /[ \t]+(?=[,;:.!?](?:[ \t]|$))/g,
    propose: (_match, _before, after) => (/^\.[ \t]*\.[ \t]*\./.test(after) ? null : ''),
  },
  {
    issue: 'spacing',
    call: 'judgement',
    // A no-break space. Sometimes deliberate typographic glue, more often a
    // paste from a word processor — which is why the office decides.
    pattern: /\u00a0/g,
    propose: () => ' ',
  },
  {
    issue: 'double-space',
    // Two spaces is a typewriter habit and nothing else. A longer run is more
    // often a layout — the export's README lines its filenames up in a column,
    // and collapsing that would break the thing the spaces were doing.
    call: (match) => (match.length === 2 ? 'mechanical' : 'judgement'),
    pattern: /(?<=\S)[ \t]{2,}(?=\S)/g,
    propose: () => ' ',
  },
  {
    issue: 'quotes',
    // After a digit it is an inch mark, not a quotation mark — `18"x12" sketch
    // pad`. The typographic form of that is a double prime, and whether the
    // school wants primes in a materials list at all is the school's call.
    call: (_match, before) => (isMeasure(before) ? 'judgement' : 'mechanical'),
    // A straight double quote, opening or closing by what precedes it.
    pattern: /"/g,
    propose: (_match, before) =>
      isMeasure(before) ? '″' : opensQuote(before) ? '“' : '”',
  },
  {
    issue: 'quotes',
    call: 'mechanical',
    // A straight apostrophe or single quote. The backslash of an escaped one
    // inside a string literal is part of the match, because the fix is the
    // whole escape.
    pattern: /\\?'/g,
    propose: (_match, before, after) => {
      if (/[\p{L}\p{N}]$/u.test(before.replace(/\\$/, ''))) return '’';
      return /^[\p{L}\p{N}]/u.test(after) && opensQuote(before) ? '‘' : '’';
    },
  },
];

/** Whether a straight double quote here is an inch mark rather than a quote. */
function isMeasure(before: string): boolean {
  return /\d$/.test(before);
}

/** Whether a quotation mark at this point opens rather than closes. */
function opensQuote(before: string): boolean {
  return /(^|[\s(\[{“‘—–])$/.test(before);
}

/**
 * Every punctuation and spacing inconsistency in `source`, in source order.
 *
 * `kind` selects the reader: `astro` for a template, `ts` for a module, `text`
 * for a string that is already prose — the copy the office typed into the
 * admin, which arrives from the database with no code around it.
 */
export function punctuationFindings(source: string, kind: 'astro' | 'ts' | 'text'): Finding[] {
  const ranges = kind === 'text' ? [[0, source.length] as const] : visibleRanges(source, kind);
  const findings: Finding[] = [];
  const claimed: [number, number][] = [];

  for (const rule of CHAR_RULES) {
    for (const [start, end] of ranges) {
      const slice = source.slice(start, end);
      rule.pattern.lastIndex = 0;
      for (const match of slice.matchAll(rule.pattern)) {
        const current = match[0];
        const at = start + match.index;
        const to = at + current.length;
        // Read either side out of the whole source rather than the slice: what
        // decides a phone number from a range, or an inch mark from a quote, is
        // the sentence around it, not where a text node happened to begin.
        const before = source.slice(Math.max(0, at - 40), at);
        const after = source.slice(to, to + 40);

        const proposed = rule.propose(current, before, after);
        if (proposed === null) continue;
        if (claimed.some(([from, until]) => at < until && to > from)) continue;
        claimed.push([at, to]);
        findings.push({
          issue: rule.issue,
          call: typeof rule.call === 'function' ? rule.call(current, before, after) : rule.call,
          line: lineOf(source, at),
          current,
          proposed,
          context: contextOf(source, at, current.length),
        });
      }
    }
  }

  if (kind === 'astro') findings.push(...capitalisationFindings(source));
  return findings.sort((a, b) => a.line - b.line || a.issue.localeCompare(b.issue));
}

/** A heading, and what its capitals say about the style it was written in. */
export type HeadingCase = 'sentence' | 'title' | 'mixed' | 'name' | 'undetermined';

/**
 * Words whose case says nothing, because both styles agree on them.
 *
 * Articles, coordinating conjunctions and the short prepositions — title case
 * leaves these lowercase too, so finding one lowercase is no evidence. Pronouns
 * are deliberately absent: title case capitalises "Us" and "Your", so those are
 * evidence.
 */
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'off',
  'on',
  'onto',
  'or',
  'over',
  'per',
  'the',
  'to',
  'up',
  'via',
  'with',
]);

/**
 * Names that carry their own capital wherever they appear.
 *
 * A named list rather than a rule, for the reason `house-style.ts` gives about
 * its own: any rule general enough to catch "Pharos" catches "Dedicated" too.
 * A word not listed here is treated as an ordinary word, which is the safe
 * direction — it produces a finding a person reads, not a silent rewrite.
 */
const PROPER_NOUNS = new Set([
  'about',
  'academy',
  'america',
  'american',
  'bible',
  'biblical',
  'christ',
  'christian',
  'enola',
  'god',
  'harrisburg',
  'pennsylvania',
  'pharos',
  'scripture',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

/**
 * Headings that are the name of a document, not a sentence.
 *
 * "Statement of Faith and Practice" is title case because it is what the paper
 * says on its front. Renaming it to match a heading style would rename the
 * document.
 */
const PROPER_NAMES = new Set(
  [
    'Statement of Faith and Practice',
    'Code of Conduct',
    'Child Protection',
    'Child Protection Background Check',
    'Handbook',
    'Helping Our Parents Educate',
  ].map((name) => name.toLowerCase()),
);

/** What a heading's capitals say about the style it was written in. */
export function headingCase(heading: string): HeadingCase {
  const text = heading.trim();
  if (PROPER_NAMES.has(text.replace(/[.?!]$/, '').toLowerCase())) return 'name';

  const words = text.split(/\s+/).filter(Boolean);
  const significant = evidenceIndices(words).map((at) => words[at]!);
  if (significant.length === 0) return 'undetermined';

  const capitals = significant.filter((word) => /^[A-Z]/.test(stripMarks(word))).length;
  if (capitals === significant.length) return 'title';
  if (capitals === 0) return 'sentence';
  return 'mixed';
}

/** `heading` written the way the house style asks, names and acronyms kept. */
export function sentenceCase(heading: string): string {
  // Splitting on a captured separator makes every even element a word and every
  // odd one the whitespace after it, so the heading rejoins exactly as it was.
  const parts = heading.split(/(\s+)/);
  const lower = new Set(evidenceIndices(parts.filter((_, at) => at % 2 === 0)));
  return parts
    .map((part, at) => (at % 2 === 0 && lower.has(at / 2) ? part.toLowerCase() : part))
    .join('');
}

/**
 * Which words in a heading are evidence of a style.
 *
 * The first word of every sentence is dropped, not just the first word of the
 * heading: "Mornings here. Afternoons yours." is sentence case twice over, and
 * reading its middle capital as a style would both misread it and propose
 * lowercasing the start of a sentence.
 */
function evidenceIndices(words: readonly string[]): number[] {
  return words
    .map((word, at) => {
      if (at === 0) return -1;
      if (/[.?!][)”’"']?$/.test(words[at - 1] ?? '')) return -1;
      return isEvidence(word) ? at : -1;
    })
    .filter((at) => at >= 0);
}

/**
 * Whether a word's case is evidence of a style.
 *
 * A name, an acronym and a small word all look the same in both styles, so only
 * an ordinary word counts either way.
 */
function isEvidence(word: string): boolean {
  const bare = stripMarks(word);
  if (!/^[A-Za-z][a-zA-Z]*$/.test(bare)) return false;
  if (SMALL_WORDS.has(bare.toLowerCase())) return false;
  if (PROPER_NOUNS.has(bare.toLowerCase())) return false;
  // An acronym — `PDF`, and `H.O.P.E.` once its periods are stripped — is
  // capitalised in every style there is.
  return !/^[A-Z]+$/.test(bare) || bare.length === 1;
}

/** A word with the punctuation and quotation marks around it removed. */
function stripMarks(word: string): string {
  return word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/\./g, '');
}

/**
 * Every heading whose capitals disagree with the house style.
 *
 * Only headings written out in full: one holding a `{…}` expression is the
 * school's own name for something, arriving from the database, and neither this
 * scan nor a house style has anything to say about it.
 */
function capitalisationFindings(source: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of source.matchAll(/<(h[1-6]|summary|legend)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const inner = match[2] ?? '';
    if (inner.includes('{')) continue;
    const text = inner
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;

    const style = headingCase(text);
    if (style !== 'title' && style !== 'mixed') continue;
    findings.push({
      issue: 'capitalisation',
      call: 'judgement',
      line: lineOf(source, match.index),
      current: text,
      proposed: sentenceCase(text),
      context: `<${match[1]}> ${text}`,
    });
  }
  return findings;
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/** The sentence around a finding, on one line, with the match left in place. */
function contextOf(source: string, at: number, length: number): string {
  const from = Math.max(0, source.lastIndexOf('\n', at) + 1, at - 60);
  const lineEnd = source.indexOf('\n', at + length);
  const to = Math.min(lineEnd === -1 ? source.length : lineEnd, at + length + 60);
  return source.slice(from, to).replace(/\s+/g, ' ').trim();
}
