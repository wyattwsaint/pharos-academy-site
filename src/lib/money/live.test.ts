import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { amountOwedForPrices, type LiveMoneySettings } from './live.js';

/**
 * The one implementation of what a family owes (#253, ADR-0019).
 *
 * Tested here on bare numbers rather than through the catalogue, because that
 * is what the browser will hand it: prices read off checkboxes, and three
 * settings. `settings.test.ts` covers the same sums the other way round, with
 * the prices resolved from the rate card through `amountOwed`.
 */

const settings = (overrides: Partial<LiveMoneySettings> = {}): LiveMoneySettings => ({
  registrationFee: 25,
  classDeposit: 100,
  depositCreditedAgainstTuition: true,
  ...overrides,
});

describe('what a family owes', () => {
  it('credits the deposits against the tuition', () => {
    // #18 §11's own example: three year-long classes at $420.
    const owed = amountOwedForPrices([420, 420, 420], settings());

    expect(owed.tuition).toBe(1260);
    expect(owed.deposits).toBe(300);
    expect(owed.creditedAgainstTuition).toBe(300);
    expect(owed.tuitionDue).toBe(960);
    // Registration, deposits and the tuition that is left, counted once.
    expect(owed.total).toBe(1285);
  });

  it('never credits more than the tuition', () => {
    // A $90 block against a $100 deposit. The family does not end up owing
    // minus ten dollars in tuition, and the total is still what they pay.
    const owed = amountOwedForPrices([90], settings());

    expect(owed.creditedAgainstTuition).toBe(90);
    expect(owed.tuitionDue).toBe(0);
    // The fee and the deposit, and no tuition left over: $125, not $115.
    expect(owed.total).toBe(125);
  });

  it('charges the registration fee once, however many classes', () => {
    expect(amountOwedForPrices([420], settings()).registration).toBe(25);
    expect(amountOwedForPrices([420, 420, 420], settings()).registration).toBe(25);
  });

  it('charges nothing at all for an empty selection', () => {
    expect(amountOwedForPrices([], settings())).toEqual({
      registration: 0,
      deposits: 0,
      tuition: 0,
      creditedAgainstTuition: 0,
      tuitionDue: 0,
      total: 0,
    });
  });

  it('puts the deposits on top when the credit is off', () => {
    const onTop = amountOwedForPrices(
      [420, 420, 420],
      settings({ depositCreditedAgainstTuition: false }),
    );

    expect(onTop.creditedAgainstTuition).toBe(0);
    expect(onTop.tuitionDue).toBe(1260);
    // The whole tuition, the deposits as well, and the fee: $300 more than credited.
    expect(onTop.total).toBe(1585);
  });
});

/**
 * The leaf is only worth having if it stays one (ADR-0019).
 *
 * A value import added here is how the rate card, the catalogue, the timetable
 * and the Statement of Faith get onto the wire for the sake of adding up six
 * numbers. Types are erased before a bundler sees them, so they do not count.
 */
describe('the arithmetic is a leaf', () => {
  it('imports nothing but types', () => {
    const source = readFileSync(fileURLToPath(new URL('./live.ts', import.meta.url)), 'utf8');

    // Every form that loads a module at run time, not just the one this file
    // happens to use today: a bare side-effect import, a double-quoted
    // specifier and a dynamic `import()` each ship exactly as much as a named
    // import, and a guard blind to them would go quiet on the change it exists
    // to catch. There is no graph to walk past this file — the lists below come
    // out empty, or it is not a leaf.
    const statements = [...source.matchAll(/^import\b.*$/gm)].map(([line]) => line.trim());
    const valueImports = statements.filter((line) => !line.startsWith('import type'));
    const atRunTime = [...source.matchAll(/\bimport\s*\(|\brequire\s*\(/g)].map(([call]) => call);

    expect([...valueImports, ...atRunTime]).toEqual([]);
  });
});
