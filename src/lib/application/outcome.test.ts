import { describe, expect, it } from 'vitest';

import { applicationOutcome, type ApplicationOutcomeCode } from './outcome.js';

describe('what ?outcome= on the Applications screen means', () => {
  it('reads back where the application itself landed', () => {
    expect(applicationOutcome('state-enrolled')).toEqual({
      ok: true,
      message: 'This application is now enrolled.',
    });
    expect(applicationOutcome('state-in_discussion')).toEqual({
      ok: true,
      message: 'This application is now in conversation.',
    });
  });

  it('reads back the money side in the terms of its own mode', () => {
    expect(applicationOutcome('payment-cheque-received')).toEqual({
      ok: true,
      message: 'The money side now reads check received.',
    });
    // The same status, on a family who said they would pay at the giving page.
    expect(applicationOutcome('payment-online-awaiting')).toEqual({
      ok: true,
      message: 'The money side now reads awaiting payment online.',
    });
  });

  it('reports a move that changed nothing without blaming anybody', () => {
    const state = applicationOutcome('state-unmoved');
    expect(state?.ok).toBe(false);
    expect(state?.message).toContain('already have moved');

    const payment = applicationOutcome('payment-unmoved');
    expect(payment?.ok).toBe(false);
    expect(payment?.message).toContain('already have moved');
  });

  it('reports a form that did not say what it wanted', () => {
    const banner = applicationOutcome('unreadable');
    expect(banner?.ok).toBe(false);
    expect(banner?.message).toContain('Nothing happened');
  });

  it('says nothing at all when the screen was merely opened', () => {
    expect(applicationOutcome(null)).toBeNull();
  });

  it('says nothing about a value it does not recognise', () => {
    expect(applicationOutcome('')).toBeNull();
    expect(applicationOutcome('STATE-ENROLLED')).toBeNull();
    expect(applicationOutcome('state-married')).toBeNull();
    expect(applicationOutcome('payment-cheque')).toBeNull();
    expect(applicationOutcome('payment-postal-received')).toBeNull();
    expect(applicationOutcome('payment-cheque-overdue')).toBeNull();
  });

  it('recognises every code the screen can redirect with', () => {
    const codes: ApplicationOutcomeCode[] = [
      'state-enrolled',
      'payment-cheque-received',
      'state-unmoved',
      'payment-unmoved',
      'unreadable',
    ];
    for (const code of codes) expect(applicationOutcome(code)).not.toBeNull();
  });
});
