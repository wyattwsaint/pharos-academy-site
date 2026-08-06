import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import {
  admissionCosts,
  agesLabel,
  APPLICATION_HREF,
  instalmentSentence,
  morningsLabel,
} from './admissions.js';

/**
 * What the Admissions page says about money, ages and mornings (#29 AC 6).
 *
 * All of it derived. The page is one long piece of prose and prose is exactly
 * where a fee gets retyped, so every figure and every list in it comes through
 * one of these four functions.
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

describe('the payment dates', () => {
  it('reads the four quarterly dates out of the settings, in the school’s form', () => {
    expect(instalmentSentence(settings)).toBe(
      'Tuition is paid to your instructor in four quarterly payments, due 24 August 2026, ' +
        '12 October 2026, 7 December 2026 and 8 February 2027.',
    );
  });

  it('follows a date moved in the admin', () => {
    const moved = {
      ...settings,
      instalmentDates: ['2027-01-04', '2027-02-04', '2027-03-04', '2027-04-05'],
    };

    expect(instalmentSentence(moved)).toContain('4 January 2027');
    expect(instalmentSentence(moved)).not.toContain('2026');
  });
});

describe('who it is for', () => {
  it('takes the age range from the catalogue rather than a typed sentence', () => {
    expect(agesLabel(CATALOGUE)).toBe('4 to 18');
  });

  it('names the mornings classes actually run on', () => {
    expect(morningsLabel(CATALOGUE)).toBe('Monday, Wednesday and Thursday');
  });

  it('says nothing about ages when no class publishes one', () => {
    const noAges = CATALOGUE.map((course) => ({ ...course, ageMin: null, ageMax: null }));
    expect(agesLabel(noAges)).toBeNull();
  });
});

describe('the Start your application button', () => {
  it('points somewhere that exists today', () => {
    // The application flow is a later ticket. Until it lands this is the
    // conversation the flow itself starts from, which is honest rather than a
    // button leading to a 404.
    expect(APPLICATION_HREF).toBe('/#inquiry');
  });
});
