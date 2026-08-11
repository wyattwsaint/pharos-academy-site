/**
 * House style: the words a family reads are American (#110).
 *
 * The rule agreed for the British-to-American conversion is **prose is
 * American, identifiers are not**. A page says "check", "enrollment" and
 * "program"; the database keeps `enrolment_units`, `payment_mode = 'cheque'`
 * and the types named after them, because renaming a schema for a spelling has
 * migration cost and no user-visible payoff.
 *
 * That split is the whole difficulty, and it is why this module exists rather
 * than the test being a `grep`. A repo-wide search for `enrolment` finds a
 * column, a type, a variable, a comment and a sentence, and only the last of
 * those is a violation. So the scan is narrowed twice:
 *
 * - **to prose.** {@link prose} blanks a source file down to the text a reader
 *   could see — template text and the prose-carrying attributes beside it, plus
 *   the string literals that read as sentences — and leaves everything else as
 *   spaces. Comments go first: they are written to developers, this file's own
 *   neighbours are full of "behaviours" and "labelled", and none of it ships.
 * - **to whole words.** `enrolmentUnits` and `enrolment_units` survive
 *   {@link britishSpellings} untouched, because the character after `enrolment`
 *   is a word character in both and `\b` does not match there. An identifier
 *   quoted in prose is the one case that still trips, and that is the right
 *   answer: `<code>enrolment</code>` in a sentence is a schema name shown to a
 *   family.
 *
 * The blanking is deliberate: the returned string is the same length as the
 * source, so a match's offset is still the source's offset and a failure can
 * name the line the reader would find the word on.
 */

/** A British spelling and the American form the house style asks for. */
interface Rule {
  readonly british: RegExp;
  readonly american: string;
}

const rule = (british: string, american: string): Rule => ({
  british: new RegExp(`\\b${british}\\b`, 'gi'),
  american,
});

/**
 * The spellings this repo rules on.
 *
 * Explicit words rather than a general `-ise`/`-our` pattern, because the
 * general pattern is wrong more often than it is right: "promises",
 * "exercises", "advertising" and "fundraising" are all correct American English
 * and all match `-is(e|ing)`. A named list is longer and never has to be argued
 * with.
 *
 * Anything not listed is not ruled on. Adding a word here is how the rule
 * grows, and a word added later fails the suite until its prose is fixed or the
 * allowlist admits it.
 */
export const RULES: readonly Rule[] = [
  // The two the school's own vocabulary turns on.
  rule('enrolments?', 'enrollment'),
  rule('enrol(?:s|ling)?', 'enroll'),
  rule('cheques?', 'check'),
  // The rest, alphabetically.
  rule('amongst', 'among'),
  rule('analyse[ds]?', 'analyze'),
  rule('analysing', 'analyzing'),
  rule('apologis(?:e[ds]?|ing)', 'apologize'),
  rule('authoris(?:e[ds]?|ing|ation)', 'authorize'),
  rule('behaviours?', 'behavior'),
  rule('behavioural', 'behavioral'),
  rule('cancell(?:ed|ing)', 'canceled'),
  rule('catalogues?', 'catalog'),
  rule('categoris(?:e[ds]?|ing|ation)', 'categorize'),
  rule('centres?', 'center'),
  rule('centred', 'centered'),
  rule('centrepieces?', 'centerpiece'),
  rule('colours?', 'color'),
  rule('coloured', 'colored'),
  rule('colourful', 'colorful'),
  rule('customis(?:e[ds]?|ing|ation)', 'customize'),
  rule('defence', 'defense'),
  rule('emphasis(?:e[ds]?|ing)', 'emphasize'),
  rule('enquir(?:e[ds]?|ies|y|ing)', 'inquire'),
  rule('favour(?:s|ed|ing|able)?', 'favor'),
  rule('favourites?', 'favorite'),
  rule('fibres?', 'fiber'),
  rule('greys?', 'gray'),
  rule('greyed', 'grayed'),
  rule('honour(?:s|ed|ing|able)?', 'honor'),
  rule('initialis(?:e[ds]?|ing|ation)', 'initialize'),
  rule('labelled', 'labeled'),
  rule('labelling', 'labeling'),
  rule('labour(?:s|ed|ing)?', 'labor'),
  rule('learnt', 'learned'),
  rule('licence', 'license'),
  rule('litres?', 'liter'),
  rule('maths', 'math'),
  rule('maximis(?:e[ds]?|ing)', 'maximize'),
  rule('memoris(?:e[ds]?|ing)', 'memorize'),
  rule('metres?', 'meter'),
  rule('minimis(?:e[ds]?|ing)', 'minimize'),
  rule('neighbour(?:s|hood|hoods|ing)?', 'neighbor'),
  rule('normalis(?:e[ds]?|ing|ation)', 'normalize'),
  rule('offence', 'offense'),
  rule('optimis(?:e[ds]?|ing|ation)', 'optimize'),
  rule('organis(?:e[ds]?|ing|ation|ations)', 'organize'),
  rule('practis(?:e[ds]?|ing)', 'practice'),
  rule('prioritis(?:e[ds]?|ing)', 'prioritize'),
  rule('programmes?', 'program'),
  rule('realis(?:e[ds]?|ing)', 'realize'),
  rule('recognis(?:e[ds]?|ing|able)', 'recognize'),
  rule('serialis(?:e[ds]?|ing|ation)', 'serialize'),
  rule('specialis(?:e[ds]?|ing|ation)', 'specialize'),
  rule('spelt', 'spelled'),
  rule('summaris(?:e[ds]?|ing)', 'summarize'),
  rule('synthesis(?:e[ds]?|ing)', 'synthesize'),
  rule('theatres?', 'theater'),
  rule('travell(?:ed|ing|er|ers)', 'traveled'),
  rule('utilis(?:e[ds]?|ing|ation)', 'utilize'),
  rule('visualis(?:e[ds]?|ing|ation)', 'visualize'),
  rule('whilst', 'while'),
];

/** One British spelling, where a reader would find it. */
export interface Finding {
  /** The offending word, as written. */
  readonly word: string;
  /** The form the house style asks for. */
  readonly american: string;
  /** 1-based, counted in the original source. */
  readonly line: number;
}

/**
 * Every British spelling in `source`'s prose, in source order.
 *
 * `kind` selects the reader: `.astro` files carry a template, everything else
 * is scanned as TypeScript.
 */
export function britishSpellings(source: string, kind: 'astro' | 'ts'): Finding[] {
  const visible = prose(source, kind);
  const found: Finding[] = [];
  for (const { british, american } of RULES) {
    british.lastIndex = 0;
    for (const match of visible.matchAll(british)) {
      found.push({ word: match[0], american, line: lineOf(visible, match.index) });
    }
  }
  return found.sort((a, b) => a.line - b.line || a.word.localeCompare(b.word));
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/**
 * `source` with everything a reader cannot see replaced by spaces.
 *
 * Same length as the input and newline-for-newline identical to it, so offsets
 * and line numbers still mean what they meant.
 */
export function prose(source: string, kind: 'astro' | 'ts'): string {
  const out: string[] = Array.from(source, (char) => (char === '\n' || char === '\r' ? char : ' '));
  const visible =
    kind === 'astro' ? astroRanges(source) : tsProseRanges(source, 0, source.length);
  for (const [start, end] of visible) {
    for (let i = start; i < end; i += 1) out[i] = source[i]!;
  }
  return out.join('');
}

/** Half-open `[start, end)` slices of the source that a reader can see. */
type Range = readonly [number, number];

/**
 * An Astro file: an optional TypeScript frontmatter, then a template.
 *
 * The fence has to be found rather than assumed — `---` also occurs inside the
 * template, and an Astro file with no frontmatter at all is legal.
 */
function astroRanges(source: string): Range[] {
  if (!/^---\r?\n/.test(source)) return templateRanges(source, 0, source.length);
  const close = source.search(/\r?\n---\r?\n/);
  if (close === -1) return templateRanges(source, 0, source.length);
  const open = source.indexOf('\n') + 1;
  const bodyStart = close + source.slice(close).indexOf('---') + 3;
  return [...tsProseRanges(source, open, close), ...templateRanges(source, bodyStart, source.length)];
}

/** Attributes that carry words rather than machinery. */
const PROSE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-roledescription',
  'aria-placeholder',
  'aria-valuetext',
  'content',
  'label',
  'placeholder',
  'title',
]);

function templateRanges(source: string, from: number, to: number): Range[] {
  const ranges: Range[] = [];
  readMarkup(source, from, to, ranges, false);
  return ranges;
}

/** Elements that never carry children, so never open a level of nesting. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Markup: text nodes, prose attributes, and whatever the `{…}` expressions
 * between them turn out to hold.
 *
 * `<style>` and `<script>` are skipped whole. Both are code, and the CSS
 * comments in this repo's `<style>` blocks are some of its densest British
 * prose — they explain colour choices to developers, at length.
 *
 * With `untilClose`, the scan stops at the closing tag that matches the element
 * whose children it was called on, and returns the index past it. That is what
 * lets an element inside an expression — `{sent && (<p>…</p>)}`, which is most
 * of the Apply page — hand the rest of the expression back to the code scanner
 * instead of swallowing it as text.
 */
function readMarkup(
  source: string,
  from: number,
  to: number,
  ranges: Range[],
  untilClose: boolean,
): number {
  let depth = 0;
  let i = from;
  let text = i;
  const flushText = () => {
    if (i > text) ranges.push([text, i]);
  };
  while (i < to) {
    if (source.startsWith('<!--', i)) {
      flushText();
      i = skipTo(source, i + 4, '-->', to);
      text = i;
    } else if (/^<(style|script)\b/i.test(source.slice(i, i + 8))) {
      flushText();
      const name = source.slice(i + 1, i + 7).toLowerCase().startsWith('style') ? 'style' : 'script';
      const close = source.toLowerCase().indexOf(`</${name}`, i);
      i = close === -1 ? to : skipTo(source, close, '>', to);
      text = i;
    } else if (source.startsWith('</', i)) {
      flushText();
      i = skipTo(source, i, '>', to);
      text = i;
      if (depth === 0 && untilClose) return i;
      depth -= 1;
    } else if (source[i] === '<' && /[a-zA-Z>]/.test(source[i + 1] ?? '')) {
      flushText();
      const start = i;
      i = readTag(source, i, to, ranges);
      if (opensChildren(source.slice(start, i))) depth += 1;
      text = i;
    } else if (source[i] === '{') {
      flushText();
      const end = matchingBrace(source, i, to);
      ranges.push(...tsProseRanges(source, i + 1, end));
      i = end + 1;
      text = i;
    } else {
      i += 1;
    }
  }
  flushText();
  return i;
}

/** Whether a complete opening tag expects a matching closing tag. */
function opensChildren(tag: string): boolean {
  if (/\/\s*>$/.test(tag)) return false;
  const name = /^<\s*([a-zA-Z][-.\w]*)/.exec(tag)?.[1]?.toLowerCase();
  return name === undefined || !VOID_ELEMENTS.has(name);
}

function skipTo(source: string, from: number, needle: string, to: number): number {
  const at = source.indexOf(needle, from);
  return at === -1 ? to : at + needle.length;
}

/**
 * One tag, from its `<` to past its `>`, keeping any prose attribute values.
 *
 * An attribute whose value is an expression (`aria-label={heading}`) is scanned
 * as TypeScript, which is how a sentence passed through a helper is still seen.
 */
function readTag(source: string, from: number, to: number, ranges: Range[]): number {
  let i = from + 1;
  while (i < to && /[^\s/>]/.test(source[i] ?? '')) i += 1;
  while (i < to && source[i] !== '>') {
    const name = /^([@:a-zA-Z_][-.:\w]*)\s*=/.exec(source.slice(i, to));
    if (!name) {
      i += 1;
      continue;
    }
    let value = i + name[0].length;
    while (value < to && /\s/.test(source[value] ?? '')) value += 1;
    const quote = source[value];
    if (quote === '"' || quote === "'") {
      const close = source.indexOf(quote, value + 1);
      const end = close === -1 ? to : close;
      if (PROSE_ATTRIBUTES.has(name[1]!.toLowerCase())) ranges.push([value + 1, end]);
      i = end + 1;
    } else if (quote === '{') {
      const end = matchingBrace(source, value, to);
      ranges.push(...tsProseRanges(source, value + 1, end));
      i = end + 1;
    } else {
      i = value;
      while (i < to && /[^\s>]/.test(source[i] ?? '')) i += 1;
    }
  }
  return i + 1;
}

/** The `}` closing the `{` at `from`, counting depth and ignoring strings. */
function matchingBrace(source: string, from: number, to: number): number {
  let depth = 0;
  let i = from;
  while (i < to) {
    const char = source[i];
    if (char === '"' || char === "'" || char === '`') {
      i = endOfString(source, i, to);
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return to;
}

/**
 * The prose string literals in `[from, to)` of a TypeScript source.
 *
 * Comments are dropped, and so is every literal that does not read as prose —
 * see {@link readsAsProse}. Template-literal `${…}` holes are stepped over and
 * their contents scanned in turn, so a sentence interpolating a name is still
 * read as one sentence.
 */
function tsProseRanges(source: string, from: number, to: number): Range[] {
  const ranges: Range[] = [];
  let i = from;
  let previous = '';
  while (i < to) {
    const char = source[i]!;
    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1 || i > to) return ranges;
      previous = '';
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i = skipTo(source, i + 2, '*/', to);
      previous = '';
      continue;
    }
    // A regex literal, told from division by what precedes it. `/["']/` would
    // otherwise open a string that never closes and swallow the rest of the
    // file.
    if (char === '/' && '(=,:[!&|?{};+*%<>~^'.includes(previous)) {
      i = endOfRegex(source, i, to);
      previous = '/';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const end = endOfString(source, i, to);
      ranges.push(...literalProse(source, i, end, char));
      i = end;
      previous = char;
      continue;
    }
    // Markup returned from an expression: `{sent && (<p>…</p>)}`. Told from a
    // comparison by what precedes it — an element can only start where a value
    // can, never after an identifier or a closing bracket.
    if (char === '<' && /[a-zA-Z>]/.test(source[i + 1] ?? '') && '(=,:[{&|?;>'.includes(previous)) {
      const start = i;
      i = readTag(source, i, to, ranges);
      if (opensChildren(source.slice(start, i))) i = readMarkup(source, i, to, ranges, true);
      previous = '>';
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    i += 1;
  }
  return ranges;
}

/** Past the closing quote of the string opening at `from`. */
function endOfString(source: string, from: number, to: number): number {
  const quote = source[from];
  let i = from + 1;
  while (i < to) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === quote) return i + 1;
    if (quote === '`' && char === '$' && source[i + 1] === '{') {
      i = matchingBrace(source, i + 1, to) + 1;
      continue;
    }
    // An unterminated single- or double-quoted string cannot cross a newline;
    // treating it as closed there keeps a stray apostrophe in a comment this
    // scan already dropped from eating the file.
    if (quote !== '`' && char === '\n') return i;
    i += 1;
  }
  return to;
}

/** Past the closing `/` of the regex literal opening at `from`. */
function endOfRegex(source: string, from: number, to: number): number {
  let i = from + 1;
  let inClass = false;
  while (i < to) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return i + 1;
    else if (char === '\n') return i;
    i += 1;
  }
  return to;
}

/** The prose segments of one string literal, `${…}` holes excluded. */
function literalProse(source: string, from: number, to: number, quote: string): Range[] {
  const segments: Range[] = [];
  let start = from + 1;
  let i = start;
  while (i < to - 1) {
    if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
      segments.push([start, i]);
      i = matchingBrace(source, i + 1, to) + 1;
      start = i;
      continue;
    }
    if (source[i] === '\\') i += 1;
    i += 1;
  }
  segments.push([start, Math.max(start, to - 1)]);
  return segments.filter(([a, b]) => readsAsProse(source.slice(a, b)));
}

/**
 * Whether a string literal is something a reader reads.
 *
 * Two whitespace-separated words of plain letters is the whole test, and it is
 * enough because of what the alternatives look like: a column name
 * (`enrolment_units`), a module path (`../lib/courses/store.js`), a class list
 * (`flex items-center gap-2`) and an enum value (`cheque`) offer at most one
 * such word between them, because the character that would end the word is
 * part of the token. A sentence offers several.
 *
 * SQL is the exception the shape cannot catch — `select enrolment_units from
 * offerings` reads as three plain words — so it is named.
 */
function readsAsProse(literal: string): boolean {
  if (/\b(?:select|insert into|update|delete from|create table|alter table)\b/i.test(literal)) {
    return false;
  }
  const words = literal
    .split(/\s+/)
    .filter((token) => /^[(“"']?[a-zA-Z][a-zA-Z']*[.,;:!?)”"']?$/.test(token));
  return words.length >= 2;
}
