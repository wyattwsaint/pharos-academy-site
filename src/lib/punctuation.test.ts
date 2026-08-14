import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NOT_PROSE, PROSE_ROOTS } from './house-style.js';
import { punctuationFindings, type Finding, type Issue } from './punctuation.js';

/**
 * The punctuation and spacing scanner (#148).
 *
 * The scan reads the same prose the house-style scanner reads — see
 * `house-style.ts` for why that reading has to be narrowed to what a family can
 * actually see — and the tests below are about the rules layered on top of it.
 *
 * The scanner reports; it does not rewrite. So a finding is only worth having
 * if it carries the three things the report prints: where, what is there now,
 * and what it should say instead.
 */

/** Written out because the character it stands for is invisible in a diff. */
const NBSP = '\u00a0';

const scan = (source: string, kind: 'astro' | 'ts' | 'text' = 'text'): Finding[] =>
  punctuationFindings(source, kind);

const issues = (source: string, kind: 'astro' | 'ts' | 'text' = 'text'): Issue[] =>
  scan(source, kind).map((finding) => finding.issue);

describe('double spaces', () => {
  it('finds two spaces between words and asks for one', () => {
    const [finding, ...rest] = scan('Classes meet on  Monday mornings.');
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ issue: 'double-space', proposed: ' ', call: 'mechanical' });
  });

  it('leaves a longer run to a person, because it may be a column', () => {
    // The export's README lines its filenames up with spaces. That is a layout,
    // and collapsing it would break the thing it was doing.
    expect(scan('README.txt      This file.')[0]).toMatchObject({
      issue: 'double-space',
      call: 'judgement',
    });
  });

  it('leaves the indentation a template is written with alone', () => {
    // Every text node in an Astro file starts on its own indented line. Those
    // runs of spaces are the file's shape, not the sentence's.
    expect(issues('<p class="mt-4">\n      Classes meet on Monday mornings.\n    </p>', 'astro'))
      .toEqual([]);
  });

  it('does not read across the gap a blanked expression leaves behind', () => {
    // `{settings.phone}` is not prose, so the scan sees spaces where it was.
    // Two spaces that are really two different sentences are not a double space.
    expect(issues('<p>Call {settings.phone} today about a place.</p>', 'astro')).toEqual([]);
  });
});

describe('quotes and apostrophes', () => {
  it('finds a straight apostrophe and asks for a typographic one', () => {
    const [finding, ...rest] = scan("The school's day starts at nine.");
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ issue: 'quotes', current: "'", proposed: '’' });
  });

  it('carries the backslash when the apostrophe is escaped inside a literal', () => {
    // `'The school\'s day is long'` — the fix is the whole escape, not the quote
    // inside it, and a report that prints only `'` reads as a puzzle.
    const [finding] = scan("const line = 'The school\\'s day is long';", 'ts');
    expect(finding).toMatchObject({ current: "\\'", proposed: '’' });
  });

  it('tells an opening straight quote from a closing one', () => {
    const found = scan('She said "yes" before the bell.');
    expect(found.map((finding) => finding.proposed)).toEqual(['“', '”']);
  });

  it('reads a straight quote after a number as an inch mark', () => {
    // `18"x12" sketch pad` is a measurement. Closing it with a quotation mark
    // would be a worse sentence than the one it started with.
    expect(scan('18"x12" sketch pad').map((finding) => finding.proposed)).toEqual(['″', '″']);
    expect(scan('18"x12" sketch pad')[0]).toMatchObject({ call: 'judgement' });
  });

  it('leaves the typographic marks the house style asks for', () => {
    expect(issues('The school’s day — “nine sharp” — starts early.')).toEqual([]);
  });
});

describe('dashes', () => {
  it('finds a hyphen standing in for an em dash', () => {
    const [finding, ...rest] = scan('Classes meet in the morning - never after lunch.');
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ issue: 'dashes', proposed: ' — ' });
  });

  it('finds a double hyphen', () => {
    expect(scan('Two mornings--Monday and Thursday.')[0]).toMatchObject({
      issue: 'dashes',
      current: '--',
      proposed: '—',
    });
  });

  it('asks for an en dash in a number range', () => {
    expect(scan('Ages 10-13 are welcome.')[0]).toMatchObject({
      issue: 'dashes',
      proposed: '–',
    });
  });

  it('leaves a phone number alone, because it is not a range', () => {
    expect(issues('Call 717-555-0143 to ask about a place.')).toEqual([]);
  });

  it('leaves a hyphenated compound alone', () => {
    expect(issues('The high-school credit rate is fifteen dollars an hour.')).toEqual([]);
  });

  it('asks for spaces around an em dash set tight', () => {
    expect(scan('Two mornings—Monday and Thursday.')[0]).toMatchObject({
      issue: 'dashes',
      proposed: ' — ',
    });
  });
});

describe('spacing after punctuation', () => {
  it('finds a comma with no space after it', () => {
    expect(scan('Monday,Wednesday and Thursday.')[0]).toMatchObject({
      issue: 'spacing',
      proposed: ', ',
    });
  });

  it('leaves the comma in a number alone', () => {
    expect(issues('The fund raised 1,200 dollars.')).toEqual([]);
  });

  it('finds a sentence running into the next one', () => {
    expect(scan('Classes meet in the morning.Families teach the rest at home.')[0]).toMatchObject({
      issue: 'spacing',
      proposed: '. ',
    });
  });

  it('leaves a comma inside a closing quotation mark alone', () => {
    // American punctuation puts the comma inside the quote, and the quote is
    // not a word the comma has run into.
    expect(issues('“…the hope that is within,” (1 Peter 3:15) while loving the world.')).toEqual(
      [],
    );
  });

  it('leaves an acronym and a domain alone', () => {
    expect(issues('H.O.P.E. is the school’s own acronym, at pharosacademy.net.')).toEqual([]);
  });

  it('finds a space before a full stop', () => {
    expect(scan('Classes meet in the morning .')[0]).toMatchObject({
      issue: 'spacing',
      proposed: '',
    });
  });

  it('finds a no-break space and leaves the call to a person', () => {
    expect(scan('Ages 4' + NBSP + 'to 18.')[0]).toMatchObject({
      issue: 'spacing',
      call: 'judgement',
    });
  });
});

describe('ellipses', () => {
  it('finds three dots and asks for the single character', () => {
    expect(scan('Latin, Logic, Rhetoric...and more.')[0]).toMatchObject({
      issue: 'ellipsis',
      proposed: '…',
    });
  });

  it('finds dots set with spaces between them', () => {
    expect(scan('Latin, Logic . . . and more.')[0]).toMatchObject({
      issue: 'ellipsis',
      proposed: '…',
    });
  });

  it('leaves the single character alone', () => {
    expect(issues('Latin, Logic… and more.')).toEqual([]);
  });
});

/**
 * Link spacing (#171).
 *
 * The rule is about what a browser renders, not what the source looks like, and
 * every test below is a shape the two disagree on. The site is written with its
 * links wrapped across lines, so the tests that matter most are the ones
 * asserting *no* finding: a rule that reported those would report a hundred
 * places and be turned off the same afternoon.
 */
describe('links in a sentence', () => {
  const links = (source: string) =>
    scan(source, 'astro').filter((finding) => finding.issue === 'link-spacing');

  it('finds a link run into the word after it', () => {
    const [finding, ...rest] = links('<p>See the <a href="/classes">classes page</a>and apply.</p>');
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ issue: 'link-spacing', call: 'mechanical' });
    expect(finding?.proposed).toContain('</a> and');
  });

  it('finds a link run into the word before it', () => {
    const [finding, ...rest] = links('<p>See the<a href="/classes">classes page</a> today.</p>');
    expect(rest).toEqual([]);
    expect(finding?.current).toContain('the<a href="/classes">');
  });

  it('finds the space swallowed into the end of the anchor', () => {
    // Renders as a gap, so nothing looks wrong — but the underline runs a space
    // past the last letter of the link.
    const [finding, ...rest] = links('<p>See the <a href="/classes">classes page </a>and apply.</p>');
    expect(rest).toEqual([]);
    expect(finding?.proposed).toContain('</a> and');
  });

  it('finds it even when there is a space outside the anchor as well', () => {
    // Two spaces collapse to one, and the one that survives is the first — the
    // one inside the anchor. The underline still extends.
    expect(links('<p>See the <a href="/x">classes page </a> and apply.</p>')).toHaveLength(1);
  });

  it('leaves a leading space inside the anchor alone when one sits outside it', () => {
    // The same collapse, the other way round: the outer space is first, so it
    // is the one that renders, and the anchor underlines only its own text.
    expect(links('<p>See the <a href="/x"> classes page</a> and apply.</p>')).toEqual([]);
  });

  it('reads a newline and its indentation as the space it renders as', () => {
    // Most of the site is written this way. A rule that matched the raw source
    // would report every one of these.
    expect(
      links('<p>\n  See the\n  <a href="/classes">classes page</a>\n  and apply.\n</p>'),
    ).toEqual([]);
  });

  it('leaves a link that is the whole of its line alone', () => {
    // A nav item, a footer link, a button-styled call to action: whitespace at
    // the start and end of a line box is dropped, so there is nothing to
    // underline and no gap to get wrong. They are excluded by the shape of the
    // rule, not by a list of elements to skip.
    expect(links('<nav>\n  <a href="/classes">\n    Classes\n  </a>\n</nav>')).toEqual([]);
    expect(links('<p>\n  <a class="btn" href="/inquire"> Inquire </a>\n</p>')).toEqual([]);
  });

  it('leaves a link flush against the punctuation that follows it', () => {
    expect(links('<p>Read the <a href="/policies">policies</a>.</p>')).toEqual([]);
    expect(links('<p>Read the <a href="/policies">policies</a>, then apply.</p>')).toEqual([]);
    expect(links('<p>Read them (<a href="/policies">policies</a>) first.</p>')).toEqual([]);
    expect(links('<p>Read <a href="/about">Pharos</a>’s story.</p>')).toEqual([]);
  });

  it('leaves the space before a mark to the rule that already reports it', () => {
    // `</a> .` is a space before a full stop, which is a spacing finding on the
    // text node after the anchor. One fault, one finding.
    const found = scan('<p>Read the <a href="/policies">policies</a> .</p>', 'astro');
    expect(found.map((finding) => finding.issue)).toEqual(['spacing']);
  });

  it('says nothing about a link beside an expression it cannot read', () => {
    // What `{course.title}` renders as is not in this file, so whether a space
    // is missing is not something the scan can claim to have found.
    expect(links('<p>{intro}<a href="/classes">classes page</a>{outro}</p>')).toEqual([]);
  });

  it('does not read an example in a comment as markup', () => {
    expect(links('<!-- <a href="/x">classes</a>and -->\n<p>Fine.</p>')).toEqual([]);
    expect(
      scan('/** Written `<a href="/x">classes</a>and`. */\nconst a = 1;', 'ts').filter(
        (finding) => finding.issue === 'link-spacing',
      ),
    ).toEqual([]);
  });

  it('names the line the reader would find it on', () => {
    const source = ['---', 'const a = 1;', '---', '<p>', '  See<a href="/x">the page</a>', '</p>'];
    expect(links(source.join('\n'))[0]?.line).toBe(5);
  });
});

describe('where a finding is', () => {
  it('counts lines in the source, not in the prose it extracted', () => {
    const source = ['---', "const a = 1;", '---', '<p>', '  The  school day.', '</p>'].join('\n');
    expect(scan(source, 'astro')[0]?.line).toBe(5);
  });

  it('quotes enough of the line to recognise it', () => {
    const [finding] = scan('Classes meet on  Monday mornings.');
    expect(finding?.context).toContain('meet on');
  });

  it('names the closing tag rather than the sentence for a link finding', () => {
    const [finding] = scan('<p>Read the <a href="/x">policies</a>now.</p>', 'astro');
    expect(finding?.context).toContain('</a>now');
  });

  it('shows the defect in the excerpt rather than tidying it away', () => {
    // The excerpt exists so a reader can see the problem. Collapsing its spaces
    // would print a sentence with nothing wrong in it.
    expect(scan('Classes meet on  Monday mornings.')[0]?.context).toContain('on  Monday');
    expect(scan('Ages 4' + NBSP + 'to 18.')[0]?.context).toContain(NBSP);
  });
});

/**
 * The gate (#171).
 *
 * The rest of this scanner reports and never fails a build: the marks in a
 * school's copy are the school's, and #148 settled that applying a finding is a
 * separate, approved act. Link spacing is the one class that is different, and
 * for a reason worth writing down — a link run into the word beside it is a
 * typo, not a voice, and there is no version of the school's meaning that wants
 * "thepolicies page". So once the site is clean, the sweep below keeps it that
 * way, and only for the findings that are mechanical.
 */
const ROOT = new URL('../../', import.meta.url);

function filesUnder(entry: string): string[] {
  const path = fileURLToPath(new URL(entry, ROOT));
  if (!statSync(path).isDirectory()) return [entry];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) =>
    child.name === 'node_modules' ? [] : filesUnder(`${entry}/${child.name}`),
  );
}

const SOURCES = PROSE_ROOTS.flatMap(filesUnder).filter(
  (path) => /\.(astro|ts)$/.test(path) && !NOT_PROSE.test(path),
);

const LINK_OFFENCES = SOURCES.flatMap((path) => {
  const source = readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8');
  return punctuationFindings(source, path.endsWith('.astro') ? 'astro' : 'ts')
    .filter((finding) => finding.issue === 'link-spacing' && finding.call === 'mechanical')
    .map((finding) => `${path}:${finding.line} — ${finding.current} → ${finding.proposed}`);
});

describe('every link on the site', () => {
  it('found sources to check, so a broken scan cannot pass silently', () => {
    expect(SOURCES.length).toBeGreaterThan(80);
    expect(SOURCES).toContain('src/pages/about/index.astro');
  });

  it('is spaced from the words around it', () => {
    expect(LINK_OFFENCES).toEqual([]);
  });

  it('goes red when a link is run into the word after it', () => {
    // The sweep being green is only worth something if it is still live on the
    // files it covers.
    const source = readFileSync(fileURLToPath(new URL('src/pages/about/index.astro', ROOT)), 'utf8');
    const introduced = `${source}\n<p>Read the <a href="/policies">policies</a>today.</p>\n`;
    expect(
      punctuationFindings(introduced, 'astro').filter((finding) => finding.issue === 'link-spacing'),
    ).toHaveLength(1);
  });
});
