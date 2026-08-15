import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * "The site states no class count" (#247), checked rather than reviewed.
 *
 * #138 removed the typed word "nineteen" and left a *derived* count in its
 * place, which was always true and still said how big the school is. #247
 * removed the count itself, and the way that stops being true is not a redesign
 * — it is somebody putting `${courses.length}` back into a heading because the
 * sentence felt bare, exactly as it read before.
 *
 * So this reads the three catalogue surfaces' own `ClassesHeader` props — the
 * h1 and the lede, the two strings that speak for the whole catalogue — and
 * fails on a count in either form: a digit, a number spelled out, or an
 * interpolation, which is the only way a derived one gets in.
 *
 * Scoped to those two props deliberately, and it is the whole of the rule. The
 * counts of a *subset* are facts a reader needs and stay: "8 classes are open to
 * this age" under a band heading, the per-track counts on the timetable and the
 * home page, "6 classes" on a calendar date, the deposits line on an invoice.
 * None of them says how many classes the school runs, which is the only claim
 * #247 is about. `llms.test.ts` holds the same guard for `llms.txt`, where the
 * reason is different: that file cannot read the catalogue at all.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The three views, each of which heads its page with the same component. */
const SURFACES = ['index.astro', 'by-day.astro', 'descriptions.astro'].map((name) =>
  join(ROOT, 'src/pages/classes', name),
);

/**
 * A count, in any of the three ways one could reach a heading.
 *
 * A digit and an interpolation are banned outright: these two strings are
 * static copy, and `${` is the only way a derived count gets in. A number
 * spelled out is banned only where it counts classes — "Three mornings, drawn
 * to scale" is the by-day lede counting the week, and it is not this rule's
 * business.
 */
const SPELLED =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|' +
  'fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
const COUNT = new RegExp(`\\d|\\$\\{|\\b(?:${SPELLED})\\s+(?:\\w+\\s+)?(?:class|course)e?s\\b`, 'i');

/**
 * The `heading` and `lede` handed to `ClassesHeader`, as they are written.
 *
 * Both prop forms, because the point of the test is that one of them — the
 * `{`…`}` expression — is how a count comes back.
 */
function headerProps(source: string): string[] {
  const header = /<ClassesHeader\b([\s\S]*?)\/>/.exec(source);
  if (!header) return [];
  return [...header[1].matchAll(/\b(?:heading|lede)=(\{[\s\S]*?\}|"[^"]*")/g)].map((m) => m[1]);
}

describe('the catalogue surfaces', () => {
  it('have a heading and a lede to check', () => {
    // A scan that matched nothing would pass silently, which is the one way
    // this test can lie about what it proves.
    for (const path of SURFACES) {
      expect(headerProps(readFileSync(path, 'utf8')), path.slice(ROOT.length)).toHaveLength(2);
    }
  });

  it('state no class count, derived or typed', () => {
    const offenders = SURFACES.flatMap((path) =>
      headerProps(readFileSync(path, 'utf8'))
        .filter((prop) => COUNT.test(prop))
        .map((prop) => `${path.slice(ROOT.length)}: ${prop}`),
    );

    expect(offenders).toEqual([]);
  });
});
