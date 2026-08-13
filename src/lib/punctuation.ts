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

import { lineOf, prose, visibleRanges } from './house-style.js';

/** The classes of issue the report groups by. */
export type Issue =
  | 'double-space'
  | 'quotes'
  | 'dashes'
  | 'spacing'
  | 'ellipsis'
  | 'capitalisation'
  | 'link-spacing';

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

  if (kind !== 'text') findings.push(...linkSpacingFindings(source, kind));
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
 * Names that carry their own capital wherever they appear — including the page
 * names this site capitalises, which is why "About" is here.
 *
 * A named list rather than a rule, for the reason `house-style.ts` gives about
 * its own: any rule general enough to catch "Pharos" catches "Dedicated" too.
 * A word not listed here is treated as an ordinary word, which is the safe
 * direction — it produces a finding a person reads, not a silent rewrite.
 *
 * May is the one month left out. It is a modal verb far more often than it is a
 * month, and listing it would silence "Families May Apply" — a heading in title
 * case that this scan exists to find.
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

/**
 * Links, spaced in a sentence the way any other word is (#171).
 *
 * A link is a word in a sentence, so it takes one space before it and one
 * after, and nothing that is not the link is underlined. Two ways that goes
 * wrong, and both are mechanical:
 *
 * - **the gap is missing** — `the<a …>classes page</a>and` — and the sentence
 *   reads as one long word.
 * - **the gap is inside the anchor** — `<a …>classes page </a>and` — which
 *   renders as a gap, so nothing looks wrong in a diff, but the underline runs
 *   a space past the last letter of the link.
 *
 * Everything here is judged on the **rendered** gap rather than the source's.
 * HTML collapses a newline and its indentation into a single space, so a link
 * wrapped across lines is correct and must never be reported — that shape is
 * most of the site, and a rule that flagged it would bury the handful of real
 * findings under a hundred false ones. Three things follow from reading it that
 * way, and each is the reason for one of the tests beside this file:
 *
 * - **A gap that collapses is still a gap.** `</a>\n  and` renders `</a> and`.
 * - **A gap at the edge of a block is not a gap at all.** Whitespace at the
 *   start and the end of a line box is dropped, so `<p>\n  <a>…</a>\n</p>` —
 *   every nav item, every button-styled call to action — underlines nothing
 *   extra. Those links are excluded by the shape of the rule rather than by a
 *   list of elements to skip: a link with no text beside it has no gap to get
 *   wrong.
 * - **Which of two collapsing spaces survives decides who owns it.** The first
 *   one wins. Before a link that means the outer space survives and the
 *   underline is clean; after a link it means the *inner* space survives and
 *   the underline extends. So `<a>…</a> and` with a trailing space inside the
 *   anchor is a finding, and ` <a>…</a>` with a leading one is not.
 *
 * A link sitting flush against punctuation — `<a …>apply</a>.`, `(<a …>…</a>)`,
 * `<a …>Pharos</a>’s` — is correct and not a finding. A space *before* that
 * punctuation is one, but it is the space-before-a-mark rule above that reports
 * it, on the text node after the anchor, and one finding per fault is the
 * point.
 */
function linkSpacingFindings(source: string, kind: 'astro' | 'ts'): Finding[] {
  const markup = readableMarkup(source, kind);
  // The neighbours are read out of the *prose*, not the markup: what follows a
  // link is often the `))` closing the expression that rendered it, and code is
  // not a word the link has run into.
  const visible = prose(source, kind);
  const findings: Finding[] = [];

  for (const match of markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const open = /^<a\b[^>]*>/i.exec(match[0])![0];
    const inner = match[1] ?? '';
    const close = match[0].length - open.length - inner.length;
    if (!/\S/.test(inner)) continue;
    const at = match.index;
    const end = at + match[0].length;

    const before = textNodeBefore(markup, visible, at);
    if (/\S/.test(before) && !/\s$/.test(before)) {
      if (!FLUSH_BEFORE.test(before)) {
        findings.push(
          linkFinding(source, at, open.length, {
            current: `${excerpt(before, 'end')}${tag(open)}${excerpt(inner, 'start')}`,
            proposed: `${excerpt(before, 'end')} ${tag(open)}${excerpt(inner.trimStart(), 'start')}`,
          }),
        );
      }
    }

    const after = textNodeAfter(markup, visible, end);
    const innerTrail = /\s*$/.exec(inner)![0];
    if (/\S/.test(after)) {
      const opens = /^\s/.test(after);
      const flush = FLUSH_AFTER.test(after);
      if (opens ? innerTrail !== '' : !flush) {
        findings.push(
          linkFinding(source, end - close, close, {
            current: `${excerpt(inner, 'end')}</a>${excerpt(after, 'start')}`,
            proposed: `${excerpt(inner.trimEnd(), 'end')}</a> ${excerpt(after.trimStart(), 'start')}`,
          }),
        );
      }
    }
  }

  return findings;
}

/**
 * Marks a link may sit flush against on its right: the punctuation that closes
 * a sentence or a bracket, the possessive that hangs off a name, and the
 * entity a template writes a space or a dash as.
 */
const FLUSH_AFTER = /^[,.;:!?)\]}"'’”…/\\&|–—-]/;

/** The same, on a link's left: what opens a bracket, a quotation or a path. */
const FLUSH_BEFORE = /[([{"'“‘/\\&|$–—-]$/;

/** One link-spacing finding, at `at` and `length` characters long. */
function linkFinding(
  source: string,
  at: number,
  length: number,
  said: { current: string; proposed: string },
): Finding {
  return {
    issue: 'link-spacing',
    call: 'mechanical',
    line: lineOf(source, at),
    current: said.current,
    proposed: said.proposed,
    context: contextOf(source, at, length),
  };
}

/** An opening tag, shortened once its attributes stop being worth printing. */
function tag(open: string): string {
  return open.length <= 40 ? open : '<a …>';
}

/** Enough of one side of a boundary to read it, from whichever end matters. */
function excerpt(text: string, from: 'start' | 'end'): string {
  const flat = text.replace(/[\r\n\t]+/g, ' ');
  if (flat.length <= 12) return flat;
  return from === 'start' ? `${flat.slice(0, 12)}…` : `…${flat.slice(-12)}`;
}

/**
 * The prose written immediately before `at`, back to whatever ended it.
 *
 * A tag, an expression's brace or the start of the file all end it, because
 * none of them is text a rule can read: what `{course.title}` renders as is not
 * in this file, and a link flush against the *value* of an expression is not
 * something the scan can claim to have found. The span is found in the markup
 * and then read out of the prose, so a `)` closing the `.map()` that rendered
 * the link comes back as the whitespace it renders as — nothing.
 */
function textNodeBefore(markup: string, visible: string, at: number): string {
  const from = Math.max(
    markup.lastIndexOf('>', at - 1),
    markup.lastIndexOf('{', at - 1),
    markup.lastIndexOf('}', at - 1),
  );
  return visible.slice(from + 1, at);
}

/** The same, forwards from `at`. */
function textNodeAfter(markup: string, visible: string, at: number): string {
  const ends = [markup.indexOf('<', at), markup.indexOf('{', at), markup.indexOf('}', at)].filter(
    (index) => index !== -1,
  );
  return visible.slice(at, ends.length === 0 ? visible.length : Math.min(...ends));
}

/**
 * `source` with everything that is not readable markup replaced by spaces, and
 * every offset still where it was.
 *
 * A `.ts` module is read through {@link prose}: its links, where it has any,
 * are inside the string literals that hold sentences, and its comments —
 * this file's own included — are full of `<a …>` written as an example.
 *
 * An `.astro` file is read as its template, with the HTML comments, the
 * `<style>` and `<script>` blocks and the frontmatter blanked. The frontmatter
 * is code, and a link built there is built out of data — an `href` and a label
 * assembled a piece at a time, with no sentence around either.
 */
function readableMarkup(source: string, kind: 'astro' | 'ts'): string {
  if (kind === 'ts') return prose(source, 'ts');

  const blanked = Array.from(source);
  const blank = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(to, source.length); i += 1) {
      if (blanked[i] !== '\n' && blanked[i] !== '\r') blanked[i] = ' ';
    }
  };

  if (/^---\r?\n/.test(source)) {
    const close = source.search(/\r?\n---\r?\n/);
    if (close !== -1) blank(0, close + source.slice(close).indexOf('---') + 3);
  }
  for (const comment of source.matchAll(/<!--[\s\S]*?-->/g)) {
    blank(comment.index, comment.index + comment[0].length);
  }
  for (const code of source.matchAll(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi)) {
    blank(code.index, code.index + code[0].length);
  }
  return blanked.join('');
}

/**
 * The sentence around a finding, on one line, with the match left as it is.
 *
 * Spaces are **not** collapsed. Half the findings here are runs of spaces, and
 * an excerpt that tidied them would show the reader a sentence with nothing
 * wrong in it. Only the characters that would end the row — newlines and tabs —
 * are replaced, and the excerpt is bounded by the line anyway.
 */
function contextOf(source: string, at: number, length: number): string {
  const from = Math.max(0, source.lastIndexOf('\n', at) + 1, at - 60);
  const lineEnd = source.indexOf('\n', at + length);
  const to = Math.min(lineEnd === -1 ? source.length : lineEnd, at + length + 60);
  return source.slice(from, to).replace(/[\r\n\t]+/g, ' ').trim();
}
