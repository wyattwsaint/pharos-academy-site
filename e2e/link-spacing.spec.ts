import { expect, test, type Page } from '@playwright/test';

import { linkGapFaults, type LinkGap } from '../src/lib/link-gaps.js';
import { publicPaths } from '../src/lib/routes.js';

/**
 * Every link on every public page, spaced the way a family reads it (#184).
 *
 * This is the seam the ticket asks for, and it has to be here rather than in
 * vitest because the fault it catches does not exist in any file. The source
 * said "meets at", a line break, `<a>Enola First Church of God</a>`; the build
 * deleted the line break; the page said "meets atEnola First Church of God".
 * `src/lib/punctuation.ts` reads the source and — correctly — saw nothing
 * wrong. Only a request shows it.
 *
 * `compressHTML: true` in place of Astro's `'jsx'` is what fixed it, and this
 * suite is what says so. The dev server compresses the same way the build does,
 * so these tests reproduce #184 against `npm run dev` — set the flag back and
 * `/about` fails here, before a deployment exists to be wrong.
 *
 * The judgement is `link-gaps.ts`'s, shared with the source rule, so the two
 * cannot come to different answers about a link flush against a full stop. What
 * belongs to this file is only the lifting of the three strings off the DOM.
 *
 * Two limits, deliberate: a link whose neighbour is an element rather than text
 * — `<strong>read</strong><a …>` — has no adjacent text node and is not judged,
 * and neither is one whose page needs a session. The first is the same blind
 * spot the source rule has; the second is `admin*.spec.ts`'s ground, and the
 * admin is not copy a family reads.
 */
type PageLinkGap = LinkGap & { href: string };

/** Every link on the current page, with the text either side of it. */
async function linkGaps(page: Page): Promise<PageLinkGap[]> {
  return page.evaluate(() => {
    // A sibling that is not a text node is not text this link ran into: an
    // element beside it is its own box, and the end of the parent is the edge
    // of a line box, where whitespace is dropped anyway.
    const adjacent = (node: ChildNode | null): string =>
      node !== null && node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : '';

    return [...document.querySelectorAll('a')].map((anchor) => ({
      href: anchor.getAttribute('href') ?? '',
      before: adjacent(anchor.previousSibling),
      text: anchor.textContent ?? '',
      after: adjacent(anchor.nextSibling),
    }));
  });
}

/** One fault, said in a way that names the page and the sentence. */
function report(path: string, gap: PageLinkGap): string {
  const faults = linkGapFaults(gap).join(', ');
  return `${path} → ${gap.href}: ${faults} — ${JSON.stringify(
    `${gap.before.slice(-24)}[${gap.text}]${gap.after.slice(0, 24)}`,
  )}`;
}

test.describe('links are spaced as words in their sentences', () => {
  for (const path of publicPaths()) {
    test(`${path} runs no link into the prose around it`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not answer 200`).toBe(200);

      const gaps = await linkGaps(page);
      // A page with no links at all would pass this vacuously, and every public
      // page has a header and a footer full of them.
      expect(gaps.length, `${path} rendered no links`).toBeGreaterThan(0);

      const faulty = gaps.filter((gap) => linkGapFaults(gap).length > 0);
      expect(faulty.map((gap) => report(path, gap))).toEqual([]);
    });
  }
});
