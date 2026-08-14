import { describe, expect, it } from 'vitest';

import {
  APPLICATION_STATES,
  PAYMENT_MODES,
  RECORDED_PAYMENT_STATUSES,
} from './lifecycle.js';
import {
  applicationOutcome,
  outcomeIsAbout,
  paymentOutcome,
  stateOutcome,
} from './outcome.js';

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

  /**
   * Derived from the closed lists rather than typed out, so a state or a status
   * added tomorrow is covered by this test on the day it is added rather than
   * leaving it green about a code it has never seen.
   */
  it('recognises every code the screen can redirect with', () => {
    const codes = [
      ...APPLICATION_STATES.map(stateOutcome),
      ...PAYMENT_MODES.flatMap((mode) =>
        RECORDED_PAYMENT_STATUSES.map((status) => paymentOutcome(mode, status)),
      ),
      'state-unmoved',
      'payment-unmoved',
      'unreadable',
    ];
    for (const code of codes) expect(applicationOutcome(code)).not.toBeNull();
  });
});

describe('whether an outcome is true of the row it is shown beside', () => {
  const row = {
    state: 'submitted',
    payment: { mode: 'cheque', status: 'awaiting' },
  } as const;

  it('agrees with a row that reads what the code says', () => {
    expect(outcomeIsAbout('state-submitted', row)).toBe(true);
    expect(outcomeIsAbout('payment-cheque-awaiting', row)).toBe(true);
  });

  /*
   * The forgery this exists to stop: a hand-typed URL announcing a move beside
   * a family who has not made it. Every part of the code is well formed and the
   * row still says otherwise, so the screen says nothing.
   */
  it('refuses a code the row does not bear out', () => {
    expect(outcomeIsAbout('state-enrolled', row)).toBe(false);
    expect(outcomeIsAbout('payment-cheque-paid_online', row)).toBe(false);
    expect(outcomeIsAbout('payment-online-awaiting', row)).toBe(false);
  });

  it('has nothing to check when the outcome reports no move', () => {
    expect(outcomeIsAbout('state-unmoved', row)).toBe(true);
    expect(outcomeIsAbout('payment-unmoved', row)).toBe(true);
    expect(outcomeIsAbout('unreadable', row)).toBe(true);
  });

  it('refuses anything it does not recognise', () => {
    expect(outcomeIsAbout('', row)).toBe(false);
    expect(outcomeIsAbout('state-married', row)).toBe(false);
    expect(outcomeIsAbout('probably', row)).toBe(false);
  });
});
