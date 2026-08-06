import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { amountOwed, priceRange, type Selection } from './owed.js';
import {
  INSTALMENT_COUNT,
  moneyChanges,
  parseMoneySettings,
  SEEDED_MONEY_SETTINGS,
  validateMoneySettings,
  type MoneySettings,
} from './settings.js';

/**
 * The money settings, as values and arithmetic (#29).
 *
 * Three of the acceptance criteria are decided here rather than on a screen:
 * the deposit-credited flag changes what a family is told it owes and defaults
 * to credited, the notification list holds more than one address, and the
 * confirmation before a save names what is actually changing.
 */

const settings = () => structuredClone(SEEDED_MONEY_SETTINGS);

describe('the seeded figures', () => {
  it('are the ones the school publishes today', () => {
    expect(SEEDED_MONEY_SETTINGS.rates).toEqual({ standard: 10, highSchoolCredit: 15 });
    expect(SEEDED_MONEY_SETTINGS.registrationFee).toBe(25);
    expect(SEEDED_MONEY_SETTINGS.classDeposit).toBe(100);
    expect(SEEDED_MONEY_SETTINGS.lateFee).toBe(50);
    expect(SEEDED_MONEY_SETTINGS.instalmentDates).toHaveLength(INSTALMENT_COUNT);
  });

  it('credits the deposit against tuition by default (#14)', () => {
    expect(SEEDED_MONEY_SETTINGS.depositCreditedAgainstTuition).toBe(true);
  });
});

describe('what a family is told it owes', () => {
  /** Three year-long classes at $420 each — #18 §11's own example. */
  function threeClasses(): Selection[] {
    const course = CATALOGUE.find((entry) => entry.slug === 'letter-of-the-week')!;
    return [
      { course, unit: 'year' },
      { course, unit: 'year' },
      { course, unit: 'year' },
    ];
  }

  it('credits the deposits against tuition by default', () => {
    const owed = amountOwed(threeClasses(), settings());

    expect(owed.tuition).toBe(1260);
    expect(owed.deposits).toBe(300);
    expect(owed.creditedAgainstTuition).toBe(300);
    // $1,260 tuition less $300 already posted.
    expect(owed.dueToInstructors).toBe(960);
    // The registration fee and the deposits, by cheque.
    expect(owed.dueNow).toBe(325);
    expect(owed.total).toBe(1285);
  });

  it('changes the figure when the flag is turned off', () => {
    const credited = amountOwed(threeClasses(), settings());
    const onTop = amountOwed(threeClasses(), {
      ...settings(),
      depositCreditedAgainstTuition: false,
    });

    expect(onTop.creditedAgainstTuition).toBe(0);
    expect(onTop.dueToInstructors).toBe(1260);
    // The $300 the flag is worth, which is the whole reason it is a setting.
    expect(onTop.total - credited.total).toBe(300);
  });

  it('never credits more deposit than there is tuition to credit it against', () => {
    const block = CATALOGUE.find((course) => course.enrolment === 'block')!;
    const owed = amountOwed([{ course: block, unit: 'flat' }], settings());

    expect(owed.dueToInstructors).toBe(0);
    expect(owed.creditedAgainstTuition).toBeLessThanOrEqual(owed.tuition);
  });

  it('charges the registration fee once however many classes are picked', () => {
    const one = amountOwed(threeClasses().slice(0, 1), settings());
    const three = amountOwed(threeClasses(), settings());

    expect(one.registration).toBe(25);
    expect(three.registration).toBe(25);
  });

  it('asks for nothing at all when nothing is selected', () => {
    expect(amountOwed([], settings())).toMatchObject({ registration: 0, total: 0 });
  });

  it('follows the rates rather than a constant', () => {
    const dearer = { ...settings(), rates: { standard: 20, highSchoolCredit: 30 } };
    expect(amountOwed(threeClasses(), dearer).tuition).toBe(2520);
  });
});

describe('the homepage range', () => {
  it('is the cheapest and dearest class at the current rates', () => {
    expect(priceRange(CATALOGUE, settings())).toEqual({ low: 90, high: 840 });
  });

  it('moves with the rates, because it is computed from them', () => {
    const doubled = { ...settings(), rates: { standard: 20, highSchoolCredit: 30 } };
    expect(priceRange(CATALOGUE, doubled)).toEqual({ low: 180, high: 1680 });
  });

  it('is null for an empty catalogue rather than an inverted range', () => {
    expect(priceRange([], settings())).toBeNull();
  });
});

describe('reading the form', () => {
  function form(overrides: Record<string, string | string[]> = {}): FormData {
    const data = new FormData();
    const base: Record<string, string | string[]> = {
      standardRate: '10',
      highSchoolCreditRate: '15',
      registrationFee: '25',
      classDeposit: '100',
      lateFee: '50',
      studyHallFee: '10',
      instalmentDates: ['2026-08-24', '2026-10-12', '2026-12-07', '2027-02-08'],
      refundTerms: 'Non-refundable.',
      depositCreditedAgainstTuition: 'on',
      notificationAddresses: 'jkilker@enolacog.com\ngeorge@enolacog.com',
      ...overrides,
    };
    for (const [name, value] of Object.entries(base)) {
      for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
    }
    return data;
  }

  it('holds more than one notification address (#29 AC 5)', () => {
    const { values, errors } = parseMoneySettings(form());

    expect(errors).toEqual({});
    expect(values.notificationAddresses).toEqual([
      'jkilker@enolacog.com',
      'george@enolacog.com',
    ]);
  });

  it('refuses a notification list with nobody on it', () => {
    const { errors } = parseMoneySettings(form({ notificationAddresses: '  \n \n' }));
    expect(errors.notificationAddresses).toMatch(/at least one address/i);
  });

  it('names the address that is not one', () => {
    const { errors } = parseMoneySettings(
      form({ notificationAddresses: 'jkilker@enolacog.com\nthe office' }),
    );
    expect(errors.notificationAddresses).toContain('the office');
  });

  it('reads an absent checkbox as off, so the flag can be turned off at all', () => {
    const data = form();
    data.delete('depositCreditedAgainstTuition');
    expect(parseMoneySettings(data).values.depositCreditedAgainstTuition).toBe(false);
  });

  it('accepts a dollar sign and a comma, because people type them', () => {
    expect(parseMoneySettings(form({ classDeposit: '$1,000' })).values.classDeposit).toBe(1000);
  });

  it('refuses a fee that is not a number rather than reading it as free', () => {
    const { values, errors } = parseMoneySettings(form({ registrationFee: 'twenty-five' }));
    expect(values.registrationFee).toBeNaN();
    expect(errors.registrationFee).toBeTruthy();
  });

  it('refuses a negative fee, and a rate of zero', () => {
    expect(parseMoneySettings(form({ lateFee: '-50' })).errors.lateFee).toBeTruthy();
    expect(parseMoneySettings(form({ standardRate: '0' })).errors.standardRate).toBeTruthy();
  });

  it('allows a fee of zero, which is a school deciding not to charge one', () => {
    expect(parseMoneySettings(form({ studyHallFee: '0' })).errors.studyHallFee).toBeUndefined();
  });

  it('insists on all four payment dates', () => {
    const { errors } = parseMoneySettings(
      form({ instalmentDates: ['2026-08-24', '2026-10-12', '2026-12-07'] }),
    );
    expect(errors.instalmentDates).toBeTruthy();
  });

  it('insists the payment dates run in order, which catches a mistyped year', () => {
    const { errors } = parseMoneySettings(
      form({ instalmentDates: ['2026-08-24', '2026-10-12', '2026-12-07', '2026-02-08'] }),
    );
    expect(errors.instalmentDates).toMatch(/in order/);
  });

  it('rejects a date that is not a day', () => {
    const { errors } = parseMoneySettings(
      form({ instalmentDates: ['2026-08-24', '2026-10-12', '2026-12-07', '2027-02-31'] }),
    );
    expect(errors.instalmentDates).toBeTruthy();
  });

  it('refuses empty refund terms, which families are asked to agree to', () => {
    expect(parseMoneySettings(form({ refundTerms: '   ' })).errors.refundTerms).toBeTruthy();
  });

  it('collects every complaint at once rather than one at a time', () => {
    const { errors } = parseMoneySettings(
      form({ registrationFee: '-1', lateFee: 'x', refundTerms: '' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['lateFee', 'refundTerms', 'registrationFee']);
  });

  it('agrees with the store’s own validation, which is the same function', () => {
    const { values } = parseMoneySettings(form({ classDeposit: '-5' }));
    expect(validateMoneySettings(values)).toHaveProperty('classDeposit');
  });
});

describe('what the confirmation says is changing', () => {
  it('is nothing at all when nothing moved', () => {
    expect(moneyChanges(settings(), settings())).toEqual([]);
  });

  it('names the field, the old figure and the new one', () => {
    const after: MoneySettings = { ...settings(), classDeposit: 150 };

    expect(moneyChanges(settings(), after)).toEqual([
      { field: 'classDeposit', label: 'Deposit, per class', from: '$100', to: '$150' },
    ]);
  });

  it('describes the deposit flag in the words that say what it means', () => {
    const after: MoneySettings = { ...settings(), depositCreditedAgainstTuition: false };
    const [change] = moneyChanges(settings(), after);

    expect(change?.from).toBe('credited against tuition');
    expect(change?.to).toBe('on top of tuition');
  });

  it('lists every field that moved, not just the first', () => {
    const after: MoneySettings = {
      ...settings(),
      lateFee: 75,
      notificationAddresses: ['jkilker@enolacog.com', 'george@enolacog.com'],
    };

    expect(moneyChanges(settings(), after).map((change) => change.field)).toEqual([
      'lateFee',
      'notificationAddresses',
    ]);
  });
});
