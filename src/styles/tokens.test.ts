import { readdirSync, readFileSync } from 'node:fs';

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
 * The two navies a cream label is allowed to sit on.
 *
 * The 2026-08 audit caught the admin's button hover at 3.0:1 (#190): `deep-blue`
 * is a pigment rather than a ground, and the cream label all but disappeared on
 * it — worst at the moment before the click. The hover is now the deepest navy.
 *
 * Two assertions, because either alone is half an answer. The first is about
 * the palette and would still pass if every button went back to `deep-blue`;
 * the second is the one that notices, and it is a grep rather than a rendered
 * check because axe cannot reach a hover state at all.
 */
describe('a cream label on a navy ground', () => {
  it('is readable on both grounds the admin paints one on', () => {
    const cream = token('color-cream');
    expect(contrast(token('color-navy'), cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-navy-deep'), cream)).toBeGreaterThanOrEqual(4.5);
  });

  it('is never painted on the ground that fails', () => {
    // Stated, so that the next line is a measurement rather than a superstition.
    expect(contrast(token('color-deep-blue'), token('color-cream'))).toBeLessThan(4.5);

    const sources = adminSources();
    // Asserted rather than assumed: a walk that found nothing would otherwise
    // make the next line the most reassuring test in the repo.
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.filter((path) => readFileSync(path, 'utf8').includes('bg-deep-blue'))).toEqual(
      [],
    );
  });
});

/**
 * The red that says something is outstanding.
 *
 * #254 gave the apply page's still-needed list the same red as the field
 * errors beside it, which is only honest if the red is readable — and the list
 * sits on cream while the error sentences also appear on the parchment bands,
 * so both grounds have to hold it.
 *
 * A token rather than the hex literal it used to be. Two rules a page apart
 * were the same colour by coincidence, and a ratio asserted against a literal
 * measures the copy nobody edited.
 */
describe('the outstanding red', () => {
  it('is readable on both light grounds it is painted on', () => {
    const error = token('color-error');
    expect(error).toBe('#8C2B19');
    expect(contrast(error, token('color-cream'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(error, token('color-parchment'))).toBeGreaterThanOrEqual(4.5);
  });

  it('is named once by the page that paints it, as the token', () => {
    const apply = readFileSync('src/pages/admissions/apply.astro', 'utf8');
    expect(apply).toContain('var(--color-error)');
    expect(apply).not.toContain('#8c2b19');
  });
});

/** Every admin screen and every shared admin component. */
function adminSources(): string[] {
  const roots = ['src/pages/admin', 'src/components'];
  const found: string[] = [];
  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && entry.name.endsWith('.astro')) {
        found.push(`${entry.parentPath}/${entry.name}`);
      }
    }
  }
  return found.filter((path) => path.includes('admin') || path.includes('Admin'));
}

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
