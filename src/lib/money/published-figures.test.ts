import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * "None is typed into page copy" (#29 AC 1), checked rather than reviewed.
 *
 * Every money figure on the public site is computed from the money settings.
 * The way that stops being true is not a redesign — it is somebody writing
 * "$25" into a paragraph because it was quicker than reading the settings, and
 * a reviewer not noticing. So this walks the public templates and the copy
 * modules behind them and fails on a dollar figure written as a literal.
 *
 * Scoped to the public surface deliberately. The admin *displays* the numbers
 * it is editing, `money/` is where they live, and the catalogue quotes the
 * prices of third-party books — none of those is the school's fee schedule
 * restated. Comments and JSDoc are stripped before matching, because an example
 * in a docstring is documentation, not something a parent reads.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Public templates, plus the two modules that hold the homepage's copy. */
const SCANNED = [
  { dir: join(ROOT, 'src/pages'), suffix: '.astro', skip: ['admin'] },
  { dir: join(ROOT, 'src/components'), suffix: '.astro', skip: [] },
  { dir: join(ROOT, 'src/lib/home'), suffix: '.ts', skip: [] },
];

/** A dollar sign against a digit: `$25`, `$1,300`, `$10.50`. */
const TYPED_FIGURE = /\$\d/;

function walk(dir: string, suffix: string, skip: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.includes(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, suffix, skip);
    if (!entry.name.endsWith(suffix) || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

/** The source with both kinds of comment removed. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the public surface', () => {
  const files = SCANNED.flatMap(({ dir, suffix, skip }) => walk(dir, suffix, skip));

  it('has something to check', () => {
    // A scan over nothing passes silently, which is the one way this test can
    // lie about what it proves.
    expect(files.length).toBeGreaterThan(10);
  });

  it('types no money figure into page copy', () => {
    const offenders = files
      .filter((path) => TYPED_FIGURE.test(withoutComments(readFileSync(path, 'utf8'))))
      .map((path) => path.slice(ROOT.length));

    expect(offenders).toEqual([]);
  });
});
