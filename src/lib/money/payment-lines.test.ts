import { describe, expect, it } from 'vitest';

import { amountOwedForPrices, type AmountOwed } from './live.js';
import { feesNamed, paymentLines, subtotalOf, type FeePaymentLinks } from './payment-lines.js';

const ORGANISATION = 'https://secure.myvanco.com/L-ZZ7H';
const CLASS_FEES = `${ORGANISATION}/campaign/C-16GQ0`;
const REGISTRATION_FEES = `${ORGANISATION}/campaign/C-16GQ2`;
const REFERENCE = 'PA-4KMN-7QTW';

const BOTH: FeePaymentLinks = { registrationFees: REGISTRATION_FEES, classFees: CLASS_FEES };
const NEITHER: FeePaymentLinks = { registrationFees: '', classFees: '' };

const RATES = { registrationFee: 50, classDeposit: 100, depositCreditedAgainstTuition: true };

/** One child, two classes — a family with both fees to pay. */
const OWED = amountOwedForPrices([840, 420], RATES);

/** A family who has ticked nothing yet, which the form stage still prices. */
const NOTHING = amountOwedForPrices([], RATES);

/**
 * Registration owed and nothing for the classes.
 *
 * Written out rather than priced, because the rate card cannot reach it: a
 * class always carries a deposit. It is the state a fee-free arrangement or a
 * fully waived class leaves behind, and it is the case the hide-at-zero rule
 * exists for — a class-fee button opening a page to pay nothing.
 */
const REGISTRATION_ONLY: AmountOwed = {
  registration: 50,
  deposits: 0,
  tuition: 0,
  creditedAgainstTuition: 0,
  tuitionDue: 0,
  classes: 0,
  total: 50,
};

const lines = (over: Partial<Parameters<typeof paymentLines>[0]> = {}) =>
  paymentLines({ owed: OWED, links: BOTH, reference: REFERENCE, ...over });

describe('the payment lines', () => {
  it('is the registration and the classes, in that order', () => {
    const both = lines();

    expect(both.map((line) => line.key)).toEqual(['registration', 'classes']);
    expect(both[0]).toMatchObject({ label: 'Registration', subtotal: 50, byCheck: false });
    expect(both[1]).toMatchObject({ label: 'Classes', subtotal: OWED.classes, byCheck: false });
    expect(both[0]!.link?.href).toBe(REGISTRATION_FEES);
    expect(both[1]!.link?.href).toBe(CLASS_FEES);
  });

  /*
   * The classes line is the deposits and the tuition together, and the two
   * lines are the whole of what the family owes. A split that does not add back
   * up is a family paying twice or the office chasing a shortfall.
   */
  it('pays the deposits and the tuition into one campaign, and the two come to the total', () => {
    const both = lines();

    expect(both[1]!.subtotal).toBe(OWED.deposits + OWED.tuitionDue);
    expect(both[0]!.subtotal + both[1]!.subtotal).toBe(OWED.total);
  });

  /*
   * The subtotals are figures `live.ts` produced, not sums taken again here.
   * Two implementations of what a family owes is the failure ADR-0019 exists
   * to prevent, and a line adding its own figures up would be the second one.
   */
  it('carries the figures the money module already totalled', () => {
    expect(lines()[1]!.subtotal).toBe(200 + (1260 - 200));
  });

  it('leaves out a line with nothing on it', () => {
    const only = lines({ owed: REGISTRATION_ONLY });

    expect(only.map((line) => line.key)).toEqual(['registration']);
    expect(only[0]!.subtotal).toBe(50);
  });

  it('leaves out both when nothing has been chosen', () => {
    expect(lines({ owed: NOTHING })).toEqual([]);
  });

  /*
   * The shape of what is coming, on the stage where the figures are still
   * moving. A button that appears and disappears as a family ticks is the page
   * rearranging itself underneath them.
   */
  it('keeps the empty lines when it is asked to', () => {
    const shape = lines({ owed: NOTHING, keepEmpty: true });

    expect(shape.map((line) => line.key)).toEqual(['registration', 'classes']);
    expect(shape.map((line) => line.subtotal)).toEqual([0, 0]);
    expect(shape.every((line) => line.byCheck)).toBe(false);
  });

  /*
   * The fallback, per line. A half-finished admin save degrades the one fee
   * whose box is empty and never the section: the fee beside it keeps its
   * button, and the empty one is posted as a check.
   */
  it('falls back to the check instruction for the one fee with no link', () => {
    const half = lines({ links: { registrationFees: '', classFees: CLASS_FEES } });

    expect(half[0]).toMatchObject({ key: 'registration', byCheck: true, link: null });
    expect(half[1]).toMatchObject({ key: 'classes', byCheck: false });
    expect(half[1]!.link?.href).toBe(CLASS_FEES);
  });

  it('falls back for both when neither link is configured', () => {
    const none = lines({ links: NEITHER });

    expect(none.map((line) => line.key)).toEqual(['registration', 'classes']);
    expect(none.every((line) => line.byCheck && line.link === null)).toBe(true);
  });

  /*
   * The screen and both emails each have a sentence naming whichever fees are
   * coming by check, and the figure that sentence asks for. Written once here,
   * because three surfaces wording the same list their own way is the drift
   * this module exists to prevent.
   */
  it('names the fees and totals them as a sentence reads them', () => {
    const both = lines();

    expect(feesNamed(both)).toBe('the registration and the classes');
    expect(feesNamed([both[0]!])).toBe('the registration');
    expect(feesNamed([])).toBe('');
    expect(subtotalOf(both)).toBe(OWED.total);
    expect(subtotalOf([])).toBe(0);
  });

  /*
   * A template is one campaign with figures on it, so it can only ever be one
   * line's. The other finds it is not their campaign and keeps its plain
   * address — which is what every substitution failure falls back to.
   */
  it('puts the amount on the one line the template belongs to', () => {
    const templated = lines({ template: `${CLASS_FEES}?amt={amount}` });

    expect(templated[0]!.link).toMatchObject({ href: REGISTRATION_FEES, carriesAmount: false });
    expect(templated[1]!.link).toMatchObject({
      href: `${CLASS_FEES}?amt=1260`,
      carriesAmount: true,
    });
  });
});
