import { describe, expect, it } from 'vitest';

import {
  headingCase,
  punctuationFindings,
  sentenceCase,
  type Finding,
  type Issue,
} from './punctuation.js';

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

describe('capitalisation', () => {
  it('reads a heading written in sentence case', () => {
    expect(headingCase('Our mission and vision')).toBe('sentence');
    expect(headingCase('What you agree to')).toBe('sentence');
  });

  it('reads a heading written in title case', () => {
    expect(headingCase('What Makes Us Different')).toBe('title');
    expect(headingCase('Our Dedicated Staff')).toBe('title');
  });

  it('reads a heading that is neither', () => {
    expect(headingCase('Is Pharos the Right Fit for your Family?')).toBe('mixed');
  });

  it('reads a heading of two sentences as two sentences', () => {
    // "Mornings here. Afternoons yours." is sentence case twice over, and the
    // capital in the middle is a sentence starting, not a style.
    expect(headingCase('Mornings here. Afternoons yours.')).toBe('sentence');
    expect(sentenceCase('Mornings here. Afternoons yours.')).toBe('Mornings here. Afternoons yours.');
  });

  it('has no opinion when every capital in a heading is a name', () => {
    // "Why Pharos Academy" is written identically in both styles. Reading it as
    // title case would put a finding on a heading nobody would change.
    expect(headingCase('Why Pharos Academy')).toBe('undetermined');
    expect(headingCase('Teaching at Pharos Academy')).toBe('undetermined');
  });

  it('has no opinion about a heading of one word', () => {
    expect(headingCase('Notes')).toBe('undetermined');
    expect(headingCase('Leadership')).toBe('undetermined');
  });

  it('leaves a document title alone, because that is its name', () => {
    expect(headingCase('Statement of Faith and Practice')).toBe('name');
    expect(headingCase('Code of Conduct')).toBe('name');
  });

  it('proposes the sentence-case rewrite, keeping the names', () => {
    expect(sentenceCase('What Makes Us Different')).toBe('What makes us different');
    expect(sentenceCase('Is Pharos the Right Fit for your Family?')).toBe(
      'Is Pharos the right fit for your family?',
    );
  });

  it('reports a title-case heading in a page as a judgement call', () => {
    const [finding, ...rest] = scan('<h2>What Makes Us Different</h2>', 'astro');
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      issue: 'capitalisation',
      current: 'What Makes Us Different',
      proposed: 'What makes us different',
      call: 'judgement',
    });
  });

  it('says nothing about a heading whose words come from the database', () => {
    // `{policy.title}` is the school's own document name, and the scan cannot
    // see it anyway.
    expect(issues('<h2>{policy.title}</h2>', 'astro')).toEqual([]);
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

  it('shows the defect in the excerpt rather than tidying it away', () => {
    // The excerpt exists so a reader can see the problem. Collapsing its spaces
    // would print a sentence with nothing wrong in it.
    expect(scan('Classes meet on  Monday mornings.')[0]?.context).toContain('on  Monday');
    expect(scan('Ages 4' + NBSP + 'to 18.')[0]?.context).toContain(NBSP);
  });
});
