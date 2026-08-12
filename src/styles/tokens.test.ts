import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The colour tokens, held to the artwork they were taken from.
 *
 * `global.css` says the gold is "the brand gold off the mark", and #141 AC 4
 * asks for exactly that — sampled from the logo rather than approximated. An
 * eyedropper reading recorded in a comment is a reading nobody re-takes when
 * either file is retouched, so the two are compared here instead.
 *
 * Only the raw gold. The three tuned golds beside it — `gold-orn`, `gold-ink`,
 * `gold-lit` — are deliberately *not* in the mark: each is that hue moved until
 * it passed contrast on a particular ground, and pinning them to the artwork
 * would assert the opposite of why they exist.
 */
const GLOBAL_CSS = readFileSync('src/styles/global.css', 'utf8');
const MARK = readFileSync('public/mark.svg', 'utf8');

/** A token's value, as written in `@theme`. */
function token(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(GLOBAL_CSS)?.[1]?.toUpperCase();
}

describe('the brand gold', () => {
  it('is a colour the lighthouse mark actually uses', () => {
    const gold = token('color-gold');
    // Asserted rather than assumed: a token the regex failed to find would
    // otherwise make the next line pass against `undefined`.
    expect(gold).toBe('#FBB03B');
    expect(MARK.toUpperCase()).toContain(gold);
  });
});
