import { readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The tab icon, held to the three files that make it (#291).
 *
 * The failure this guards is silent in a way the rest of the site's is not: a
 * missing or stale favicon breaks nothing, renders no error, and is only ever
 * seen in a browser chrome or a Google result row — neither of which any other
 * check in this repo looks at. `build-favicon.mjs` is run by hand and its
 * output is committed, so nothing but this re-checks that the committed files
 * still match the mark and the ground they were generated from.
 */
const MARK = readFileSync('public/mark.svg', 'utf8');
const FAVICON = readFileSync('public/favicon.svg', 'utf8');
const GLOBAL_CSS = readFileSync('src/styles/global.css', 'utf8');
const LAYOUT = readFileSync('src/layouts/BaseLayout.astro', 'utf8');

describe('the favicon', () => {
  it('is the mark, not a second drawing of it', () => {
    // The first path of each of the mark's three colour groups. A retouch of
    // the trace that never re-ran the script leaves these behind.
    for (const path of MARK.match(/ d="M[^"]{60}/g) ?? []) {
      expect(FAVICON).toContain(path);
    }
  });

  it('sits on the navy the header uses, so the tile is the same lockup', () => {
    const navy = /--color-navy:\s*(#[0-9a-fA-F]{6})/.exec(GLOBAL_CSS)?.[1];
    expect(navy).toBe('#17365c');
    expect(FAVICON).toContain(`fill="${navy}"`);
  });

  it('is square, because a tab slot is', () => {
    expect(FAVICON).toContain('viewBox="0 0 512 512"');
  });

  it.each([
    ['favicon.ico', 'rel="icon" href="/favicon.ico"'],
    ['favicon.svg', 'rel="icon" href="/favicon.svg"'],
    ['apple-touch-icon.png', 'rel="apple-touch-icon" href="/apple-touch-icon.png"'],
    // Not linked from the page — this is the one the School node's `logo`
    // points at, and a build that dropped it would leave that URL 404ing.
    ['icon-512.png', undefined],
    ['icon-192.png', undefined],
  ])('ships %s', (file, link) => {
    expect(statSync(`public/${file}`).size).toBeGreaterThan(0);
    if (link) expect(LAYOUT).toContain(link);
  });
});
