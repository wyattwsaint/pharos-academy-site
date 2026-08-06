import { describe, expect, it } from 'vitest';

import { moneyFormOutcome } from './admin-flow.js';
import { SEEDED_MONEY_SETTINGS, type MoneySettings } from './settings.js';

/**
 * The two-step confirmation, decided away from the page (#29 AC 2).
 *
 * The whole of "an explicit confirmation naming its effect on every family" is
 * a decision about one submitted form, so it is tested as one — the Astro page
 * only renders whichever of the four outcomes comes back.
 */

/** The form as the browser posts it: every field, dates repeated, one textarea. */
function formFor(values: MoneySettings, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('standardRate', String(values.rates.standard));
  form.set('highSchoolCreditRate', String(values.rates.highSchoolCredit));
  form.set('registrationFee', String(values.registrationFee));
  form.set('classDeposit', String(values.classDeposit));
  form.set('lateFee', String(values.lateFee));
  form.set('studyHallFee', String(values.studyHallFee));
  for (const date of values.instalmentDates) form.append('instalmentDates', date);
  form.set('refundTerms', values.refundTerms);
  if (values.depositCreditedAgainstTuition) form.set('depositCreditedAgainstTuition', 'on');
  form.set('notificationAddresses', values.notificationAddresses.join('\n'));
  for (const [name, value] of Object.entries(extra)) form.set(name, value);
  return form;
}

const current = SEEDED_MONEY_SETTINGS;

describe('moneyFormOutcome', () => {
  it('asks for confirmation before saving a change, and names what changed', () => {
    const outcome = moneyFormOutcome(
      formFor({ ...current, classDeposit: 150 }),
      current,
    );

    expect(outcome.kind).toBe('confirm');
    if (outcome.kind !== 'confirm') return;
    expect(outcome.changes).toEqual([
      { field: 'classDeposit', label: 'Deposit, per class', from: '$100', to: '$150' },
    ]);
    expect(outcome.values.classDeposit).toBe(150);
  });

  it('does not save on the first post, however good the values are', () => {
    const outcome = moneyFormOutcome(formFor({ ...current, lateFee: 60 }), current);

    expect(outcome.kind).not.toBe('save');
  });

  it('saves only once the confirmation comes back', () => {
    const outcome = moneyFormOutcome(
      formFor({ ...current, lateFee: 60 }, { confirm: 'yes' }),
      current,
    );

    expect(outcome.kind).toBe('save');
    if (outcome.kind !== 'save') return;
    expect(outcome.values.lateFee).toBe(60);
    expect(outcome.changes.map((change) => change.field)).toEqual(['lateFee']);
  });

  it('says nothing changed rather than stamping the row with an identical save', () => {
    expect(moneyFormOutcome(formFor(current), current).kind).toBe('unchanged');
    expect(moneyFormOutcome(formFor(current, { confirm: 'yes' }), current).kind).toBe('unchanged');
  });

  it('rejects a bad value before it ever reaches the confirmation', () => {
    const outcome = moneyFormOutcome(
      formFor({ ...current, registrationFee: Number.NaN }),
      current,
    );

    expect(outcome.kind).toBe('invalid');
    if (outcome.kind !== 'invalid') return;
    expect(outcome.errors.registrationFee).toBeTruthy();
    // What was typed comes back, so the form redisplays it rather than reverting.
    expect(outcome.values.classDeposit).toBe(current.classDeposit);
  });

  it('rejects a bad value even when the confirmation is forged past it', () => {
    const outcome = moneyFormOutcome(
      formFor({ ...current, rates: { standard: 0, highSchoolCredit: 15 } }, { confirm: 'yes' }),
      current,
    );

    expect(outcome.kind).toBe('invalid');
  });

  it('turns the deposit-credited flag off, because an absent checkbox means off', () => {
    const outcome = moneyFormOutcome(
      formFor({ ...current, depositCreditedAgainstTuition: false }),
      current,
    );

    expect(outcome.kind).toBe('confirm');
    if (outcome.kind !== 'confirm') return;
    expect(outcome.values.depositCreditedAgainstTuition).toBe(false);
    expect(outcome.changes).toEqual([
      {
        field: 'depositCreditedAgainstTuition',
        label: 'Deposit is credited against tuition',
        from: 'credited against tuition',
        to: 'on top of tuition',
      },
    ]);
  });

  it('carries a second notification address through, so the list can hold more than one', () => {
    const outcome = moneyFormOutcome(
      formFor({
        ...current,
        notificationAddresses: ['jkilker@enolacog.com', 'george@enolacog.com'],
      }),
      current,
    );

    expect(outcome.kind).toBe('confirm');
    if (outcome.kind !== 'confirm') return;
    expect(outcome.values.notificationAddresses).toEqual([
      'jkilker@enolacog.com',
      'george@enolacog.com',
    ]);
  });
});
