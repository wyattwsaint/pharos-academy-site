import { describe, expect, it } from 'vitest';

import { linkGapFaults, type LinkGap } from './link-gaps.js';
import { punctuationFindings } from './punctuation.js';

/**
 * The rendered reading of a link's spacing (#184).
 *
 * Every case here is written as the three strings a browser hands back — the
 * text node before the anchor, the anchor's text, the text node after it —
 * because that is the only form in which #184's fault exists. In the source it
 * was a newline; on the page it was nothing at all.
 *
 * Half of these assert *no* fault. A rule that flagged a nav item or a link
 * flush against a full stop would report most of the site, and would be turned
 * off the same afternoon.
 */
const gap = (before: string, text: string, after: string): LinkGap => ({ before, text, after });

describe('the gap either side of a link, as it renders', () => {
  it('finds the space the build ate before a link', () => {
    // Verbatim from the live site: `meets at<a …>Enola First Church of God</a>`.
    expect(linkGapFaults(gap('Pharos Academy meets at', 'Enola First Church of God', '.'))).toEqual([
      'run-into-before',
    ]);
  });

  it('finds the space the build ate after a link', () => {
    expect(linkGapFaults(gap('See the ', 'classes page', 'and apply.'))).toEqual([
      'run-into-after',
    ]);
  });

  it('reads a newline and its indentation as the space it renders as', () => {
    // What the same page looks like once the build stops deleting it. This is
    // how nearly every paragraph on the site is written.
    expect(linkGapFaults(gap('Pharos Academy meets at\n        ', 'Enola First', '.'))).toEqual([]);
    expect(linkGapFaults(gap('— or read\n  ', 'how applying works', ', which is next.'))).toEqual(
      [],
    );
  });

  it('leaves a link that is the whole of its line alone', () => {
    // A nav item, a footer link, a button-styled call to action: no prose
    // either side, so no gap to get wrong. Excluded by the shape of the rule
    // rather than by a list of elements to skip.
    expect(linkGapFaults(gap('\n  ', 'Classes', '\n'))).toEqual([]);
    expect(linkGapFaults(gap('', ' Inquire ', ''))).toEqual([]);
  });

  it('leaves a link flush against the punctuation around it', () => {
    expect(linkGapFaults(gap('Read the ', 'policies', '.'))).toEqual([]);
    expect(linkGapFaults(gap('Read them (', 'policies', ') first.'))).toEqual([]);
    expect(linkGapFaults(gap('Read ', 'Pharos', '’s story.'))).toEqual([]);
    expect(linkGapFaults(gap('the mornings —', 'the full list', ', by age.'))).toEqual([]);
  });

  it('finds a gap faked from inside the anchor', () => {
    // Renders as a space, so nothing looks wrong — and the underline runs a
    // space past the link on one side or short of the sentence on the other.
    expect(linkGapFaults(gap('you should read', ' what we believe', ' before applying.'))).toEqual([
      'smuggled-before',
    ]);
    expect(linkGapFaults(gap('See the ', 'classes page ', 'and apply.'))).toEqual([
      'smuggled-after',
    ]);
  });

  it('still finds a trailing inner space when one sits outside as well', () => {
    // Two spaces collapse to one and the first wins, so the inner one is the
    // one that renders — and it underlines (#171).
    expect(linkGapFaults(gap('See the ', 'classes page ', ' and apply.'))).toEqual([
      'smuggled-after',
    ]);
  });

  it('leaves a space beside a mark to the rule that already reports it', () => {
    // `policies </a>.` renders "policies ." and `( <a>` renders "( policies" —
    // both are a space beside punctuation, which is a spacing finding on the
    // text node, not a link-spacing one. `punctuation.ts` declines these for
    // the same reason, and the two are not allowed to disagree.
    expect(linkGapFaults(gap('Read the ', 'policies ', '.'))).toEqual([]);
    expect(linkGapFaults(gap('Read them (', ' policies', ') first.'))).toEqual([]);
  });

  it('leaves a leading inner space alone when one sits outside it', () => {
    // The same collapse the other way round: the outer space is first, so it is
    // the one that renders and the anchor underlines only its own text.
    expect(linkGapFaults(gap('See the ', ' classes page', ' and apply.'))).toEqual([]);
  });

  it('reports both sides of a link run into its whole sentence', () => {
    expect(linkGapFaults(gap('See the', 'classes page', 'and apply.'))).toEqual([
      'run-into-before',
      'run-into-after',
    ]);
  });
});

/**
 * The two readings of the rule, held against each other.
 *
 * `punctuation.ts` reads a file and this module reads a page, and each says the
 * doc comment of the other cannot disagree with it. Nothing enforced that until
 * this table: the same sentence, written once as markup and once as the three
 * strings it renders to, and the two asked the same question.
 *
 * The pairs that matter are the ones where the rules could plausibly part
 * company — a link flush against a mark, and a space beside one.
 */
describe('the source rule and the rendered rule', () => {
  const CASES: { markup: string; gap: LinkGap }[] = [
    { markup: '<p>See the<a href="/x">classes page</a> today.</p>', gap: gap('See the', 'classes page', ' today.') },
    { markup: '<p>See the <a href="/x">classes page</a>and apply.</p>', gap: gap('See the ', 'classes page', 'and apply.') },
    { markup: '<p>See the <a href="/x">classes page </a>and apply.</p>', gap: gap('See the ', 'classes page ', 'and apply.') },
    { markup: '<p>See the <a href="/x">classes page </a> and apply.</p>', gap: gap('See the ', 'classes page ', ' and apply.') },
    { markup: '<p>See the <a href="/x"> classes page</a> and apply.</p>', gap: gap('See the ', ' classes page', ' and apply.') },
    { markup: '<p>Read the <a href="/x">policies</a>.</p>', gap: gap('Read the ', 'policies', '.') },
    { markup: '<p>Read the <a href="/x">policies </a>.</p>', gap: gap('Read the ', 'policies ', '.') },
    { markup: '<p>Read them (<a href="/x"> policies</a>) first.</p>', gap: gap('Read them (', ' policies', ') first.') },
    { markup: '<p>\n  See the\n  <a href="/x">classes page</a>\n  and apply.\n</p>', gap: gap('\n  See the\n  ', 'classes page', '\n  and apply.\n') },
  ];

  for (const { markup, gap: rendered } of CASES) {
    it(`agree about ${JSON.stringify(markup)}`, () => {
      const inSource = punctuationFindings(markup, 'astro').some(
        (finding) => finding.issue === 'link-spacing',
      );
      expect(linkGapFaults(rendered).length > 0).toBe(inSource);
    });
  }
});

