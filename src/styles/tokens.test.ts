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

/**
 * The admin's primary button, at rest and under the pointer.
 *
 * The 2026-08 audit caught the hover ground at 3.0:1 (#190): `deep-blue` is a
 * pigment, and the cream label all but disappeared on it — worst at the moment
 * before the click. It is now the deepest navy, and this is the assertion that
 * keeps it there. axe cannot reach a hover state, so nothing else would notice
 * the next time somebody reaches for a lighter blue.
 */
const ADMIN_BUTTON = readFileSync('src/components/AdminButton.astro', 'utf8');

describe("the admin's primary button", () => {
  it('keeps its label readable on both of its grounds', () => {
    // The one line in the component that paints a cream label.
    const skin = /'(bg-[^']*text-cream[^']*)'/.exec(ADMIN_BUTTON)?.[1];
    expect(skin).toBeDefined();

    const rest = /(?:^|\s)bg-([a-z-]+)/.exec(skin!)?.[1];
    const hover = /hover:bg-([a-z-]+)/.exec(skin!)?.[1];
    expect(rest).toBeDefined();
    expect(hover).toBeDefined();

    const label = token('color-cream');
    for (const ground of [rest, hover]) {
      expect(contrast(token(`color-${ground}`), label)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** WCAG's ratio between two `#rrggbb` values. Undefined is a failed lookup. */
function contrast(a: string | undefined, b: string | undefined): number {
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  const la = luminance(a!);
  const lb = luminance(b!);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => channel(Number.parseInt(hex.slice(at, at + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
