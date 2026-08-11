import { describe, expect, it } from 'vitest';

import { APPLICATION_PATH } from '../application/application.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { admissionCosts, APPLICATION_HREF } from './admissions.js';

/**
 * What the Admissions page says about money (#29 AC 6).
 *
 * All of it derived. The page is one long piece of prose and prose is exactly
 * where a fee gets retyped, so every figure in it comes through `admissionCosts`.
 * The quarterly payment dates left the page in #108, and the ages and mornings
 * labels left with the client's rewrite (#107); the helpers behind them are gone
 * rather than tested with no caller, so their tests are gone too.
 */

const settings = SEEDED_MONEY_SETTINGS;

describe('what applying costs', () => {
  it('quotes the registration fee and the deposit from the settings', () => {
    const costs = admissionCosts(settings);

    expect(costs.map((cost) => cost.amount)).toEqual(['$25', '$100', '$50']);
    expect(costs[0]!.what).toContain('Registration');
    expect(costs[1]!.what).toContain('Deposit');
  });

  it('says the deposit comes off the tuition while it is credited', () => {
    expect(admissionCosts(settings)[1]!.detail).toContain('comes off');
  });

  it('says the opposite the moment the school stops crediting it', () => {
    const onTop = { ...settings, depositCreditedAgainstTuition: false };

    expect(admissionCosts(onTop)[1]!.detail).toContain('on top of');
    expect(admissionCosts(onTop)[1]!.detail).not.toContain('comes off');
  });

  it('follows a fee raised in the admin', () => {
    const raised = { ...settings, registrationFee: 40, classDeposit: 125, lateFee: 75 };

    expect(admissionCosts(raised).map((cost) => cost.amount)).toEqual(['$40', '$125', '$75']);
  });
});

describe('the Start your application button', () => {
  it('points at the application flow', () => {
    // The flow landed (#31), so the one constant that was always going to move
    // has moved. Asserted against `APPLICATION_PATH` rather than the string, so
    // the button and the page cannot part company.
    expect(APPLICATION_HREF).toBe(APPLICATION_PATH);
  });

  it('opens the flow on a clean slate rather than one family’s prefill', () => {
    // A family who reached Admissions by browsing has no inquiry behind them.
    // A query string here would be a link that pre-fills every visitor with
    // whichever inquiry id somebody once pasted into the source.
    expect(APPLICATION_HREF).not.toContain('?');
  });
});
