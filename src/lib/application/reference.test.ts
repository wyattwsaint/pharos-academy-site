import { describe, expect, it } from 'vitest';

import { REFERENCE_ALPHABET, REFERENCE_PATTERN, applicationReference } from './reference.js';

/**
 * The short code a family reads off a screen and types into a giving page
 * (#218).
 *
 * The properties are what matter here rather than any particular string: the
 * same row always answers the same code, two rows never answer the same one,
 * and every character survives being read down a phone line.
 */

/** Uuid-shaped ids, from a seeded generator, so a run is the same every time. */
function ids(count: number): string[] {
  let seed = 0x2f6e2b1n;
  const hex = (digits: number): string => {
    let out = '';
    for (let i = 0; i < digits; i += 1) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      out += ((seed >> 33n) & 0xfn).toString(16);
    }
    return out;
  };
  return Array.from(
    { length: count },
    () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`,
  );
}

describe('an application’s reference', () => {
  it('answers the same code for the same row, every time', () => {
    const id = '0f8b3a41-6c2d-4f7e-9a10-b5c6d7e8f901';
    expect(applicationReference(id)).toBe(applicationReference(id));
  });

  it('does not care how the id was written down', () => {
    const id = '0f8b3a41-6c2d-4f7e-9a10-b5c6d7e8f901';
    expect(applicationReference(id.toUpperCase())).toBe(applicationReference(id));
    expect(applicationReference(`  ${id}\n`)).toBe(applicationReference(id));
  });

  it('gives every row in a catalogue of applications its own code', () => {
    const codes = new Set(ids(20_000).map(applicationReference));
    expect(codes.size).toBe(20_000);
  });

  it('is short, prefixed and grouped, so it can be read aloud', () => {
    for (const id of ids(200)) expect(applicationReference(id)).toMatch(REFERENCE_PATTERN);
  });

  /**
   * The catalogue above is 20,000 unrelated ids, which any hash worth the name
   * separates. Ids that differ by one digit are where a weak one folds two rows
   * onto one code — and two rows on one code is the office reading a payment
   * note and finding two families.
   */
  it('separates rows whose ids differ by a single character', () => {
    const stem = '0f8b3a41-6c2d-4f7e-9a10-b5c6d7e8f9';
    const digits = '0123456789abcdef';
    const near = [...digits].flatMap((left) =>
      [...digits].map((right) => `${stem}${left}${right}`),
    );
    expect(new Set(near.map(applicationReference)).size).toBe(near.length);
  });

  it('spells codes with characters nobody mistakes for each other', () => {
    // 0/O, 1/I/L, 2/Z, 5/S, 6/G and 8/B are the pairs a family confuses when
    // they are copying a code by hand — so only one of each is in the alphabet.
    for (const confusable of ['0', '1', 'B', 'G', 'I', 'L', 'O', 'S', 'U', 'Z']) {
      expect(REFERENCE_ALPHABET).not.toContain(confusable);
    }
    const allowed = new Set(REFERENCE_ALPHABET);
    for (const id of ids(200)) {
      for (const character of applicationReference(id).replace(/^PA-|-/g, '')) {
        expect(allowed.has(character)).toBe(true);
      }
    }
  });

  it('uses the whole alphabet rather than a corner of it', () => {
    const used = new Set(ids(2_000).flatMap((id) => [...applicationReference(id).slice(3)]));
    used.delete('-');
    expect(used.size).toBe(REFERENCE_ALPHABET.length);
  });
});
