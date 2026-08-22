import { describe, expect, it } from 'vitest';

import { amountOwedForPrices } from './live.js';
import { ALL_OF_IT, paymentLines } from './payment-lines.js';

const GIVING_PAGE = 'https://secure.myvanco.com/YH8R/campaign/C-REGISTRATION';
const REFERENCE = 'PA-4KMN-7QTW';

const RATES = { registrationFee: 50, classDeposit: 100, depositCreditedAgainstTuition: true };

/** One child, two classes — a family with something to pay. */
const OWED = amountOwedForPrices([840, 420], RATES);

/** A family who has ticked nothing yet, which the form stage still prices. */
const NOTHING = amountOwedForPrices([], RATES);

describe('the payment lines', () => {
  it('is one line, all of it, when there is a link to pay it at', () => {
    const lines = paymentLines({ owed: OWED, payOnlineUrl: GIVING_PAGE, reference: REFERENCE });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      label: ALL_OF_IT,
      subtotal: OWED.total,
      byCheck: false,
    });
    expect(lines[0]!.link?.href).toBe(GIVING_PAGE);
  });

  /*
   * The subtotal is the total `live.ts` produced, not a sum taken again here.
   * Two implementations of what a family owes is the failure ADR-0019 exists
   * to prevent, and a line adding its own figures up would be the second one.
   */
  it('carries the figure the money module already totalled', () => {
    const lines = paymentLines({ owed: OWED, payOnlineUrl: GIVING_PAGE, reference: REFERENCE });
    expect(lines[0]!.subtotal).toBe(50 + 200 + (1260 - 200));
  });

  it('puts the amount on the link when a template asks for it', () => {
    const lines = paymentLines({
      owed: OWED,
      payOnlineUrl: GIVING_PAGE,
      template: `${GIVING_PAGE}?amt={amount}`,
      reference: REFERENCE,
    });

    expect(lines[0]!.link?.carriesAmount).toBe(true);
    expect(lines[0]!.link?.href).toBe(`${GIVING_PAGE}?amt=1310`);
  });

  /*
   * The fallback, per line (#300). A fee with no link is a fee posted as a
   * check — and never a link pointing at nothing, which is what a page reading
   * a blank address renders.
   */
  it('falls back to the check instruction when no link is configured', () => {
    const lines = paymentLines({ owed: OWED, payOnlineUrl: '', reference: REFERENCE });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ label: ALL_OF_IT, subtotal: OWED.total, byCheck: true });
    expect(lines[0]!.link).toBeNull();
  });

  /*
   * A family who has ticked nothing is still shown what they would owe, so the
   * line stays. #300 introduces the hide-at-zero rule with the second line it
   * exists for; until then, dropping it here would empty a section of the page
   * that has always had something in it.
   */
  it('still returns the line when nothing has been chosen', () => {
    const lines = paymentLines({ owed: NOTHING, payOnlineUrl: GIVING_PAGE, reference: null });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ subtotal: 0, byCheck: false });
    expect(lines[0]!.link?.href).toBe(GIVING_PAGE);
  });
});
