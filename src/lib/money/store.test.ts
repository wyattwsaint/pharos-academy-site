import { beforeEach, describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { createEphemeralDatabase, type Db } from '../db/client.js';
import { amountOwed, type Selection } from './owed.js';
import { SEEDED_MONEY_SETTINGS } from './settings.js';
import {
  getAgreedTerms,
  getMoneySettings,
  recordAgreedTerms,
  saveMoneySettings,
} from './store.js';

/**
 * The money row against real Postgres (#29).
 *
 * The acceptance criterion this file exists for is the third one: an existing
 * enrolled record is not rewritten by a later settings change, verified with a
 * real record rather than asserted about the design. So the test enrols a
 * family at today's figures, doubles every figure, and reads the family's row
 * back.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

describe('the seeded row', () => {
  it('holds the school’s published figures from the first migration', async () => {
    const settings = await getMoneySettings(db);

    expect(settings.rates).toEqual({ standard: 10, highSchoolCredit: 15 });
    expect(settings.registrationFee).toBe(25);
    expect(settings.classDeposit).toBe(100);
    expect(settings.lateFee).toBe(50);
    expect(settings.instalmentDates).toEqual(SEEDED_MONEY_SETTINGS.instalmentDates);
    expect(settings.depositCreditedAgainstTuition).toBe(true);
    expect(settings.notificationAddresses).toEqual(SEEDED_MONEY_SETTINGS.notificationAddresses);
  });

  it('has not been edited by anybody yet', async () => {
    const settings = await getMoneySettings(db);
    expect(settings.lastEditedBy).toBeNull();
    expect(settings.lastEditedAt).toBeNull();
  });
});

describe('saving', () => {
  it('writes the numbers and stamps who wrote them', async () => {
    const when = new Date('2026-09-15T14:00:00Z');

    await saveMoneySettings(
      db,
      { ...SEEDED_MONEY_SETTINGS, classDeposit: 150, lateFee: 75 },
      'George Jensen',
      when,
    );

    const settings = await getMoneySettings(db);
    expect(settings.classDeposit).toBe(150);
    expect(settings.lateFee).toBe(75);
    // Attribution is the only control on the money — permissions are flat (#16).
    expect(settings.lastEditedBy).toBe('George Jensen');
    expect(settings.lastEditedAt?.toISOString()).toBe(when.toISOString());
  });

  it('holds a second notification address (#29 AC 5)', async () => {
    await saveMoneySettings(
      db,
      {
        ...SEEDED_MONEY_SETTINGS,
        notificationAddresses: ['jkilker@enolacog.com', 'george@enolacog.com'],
      },
      'Jill Kilker',
    );

    expect((await getMoneySettings(db)).notificationAddresses).toEqual([
      'jkilker@enolacog.com',
      'george@enolacog.com',
    ]);
  });

  it('refuses figures the form would have refused, whoever is calling', async () => {
    await expect(
      saveMoneySettings(db, { ...SEEDED_MONEY_SETTINGS, registrationFee: -25 }, 'Jill Kilker'),
    ).rejects.toThrow(/refusing to save/i);

    expect((await getMoneySettings(db)).registrationFee).toBe(25);
  });

  it('refuses a notification list with nobody on it', async () => {
    await expect(
      saveMoneySettings(db, { ...SEEDED_MONEY_SETTINGS, notificationAddresses: [] }, 'Jill Kilker'),
    ).rejects.toThrow(/refusing to save/i);
  });
});

describe('what an enrolled family agreed to', () => {
  /** Three year-long classes, the example #18 §11 works through. */
  function threeClasses(): Selection[] {
    const course = CATALOGUE.find((entry) => entry.slug === 'letter-of-the-week')!;
    return [
      { course, unit: 'year' },
      { course, unit: 'year' },
      { course, unit: 'year' },
    ];
  }

  it('is not rewritten by a later settings change (#29 AC 3)', async () => {
    const august = await getMoneySettings(db);
    const record = await recordAgreedTerms(db, 'The Saint family', august);
    const owedInAugust = amountOwed(threeClasses(), record);

    // October: the board doubles the deposit, raises the registration fee, puts
    // the rates up, and stops crediting the deposit against tuition.
    await saveMoneySettings(
      db,
      {
        ...SEEDED_MONEY_SETTINGS,
        rates: { standard: 20, highSchoolCredit: 30 },
        registrationFee: 50,
        classDeposit: 200,
        depositCreditedAgainstTuition: false,
      },
      'George Jensen',
    );

    const kept = await getAgreedTerms(db, record.id);
    expect(kept).toBeDefined();
    expect(kept!.rates).toEqual({ standard: 10, highSchoolCredit: 15 });
    expect(kept!.registrationFee).toBe(25);
    expect(kept!.classDeposit).toBe(100);
    expect(kept!.depositCreditedAgainstTuition).toBe(true);
    // And the figure that matters: the family still owes what it agreed to.
    expect(amountOwed(threeClasses(), kept!)).toEqual(owedInAugust);
  });

  it('is a copy taken at the time, so a family enrolling later gets the new figures', async () => {
    const first = await recordAgreedTerms(db, 'The Saint family', await getMoneySettings(db));

    await saveMoneySettings(
      db,
      { ...SEEDED_MONEY_SETTINGS, classDeposit: 200 },
      'George Jensen',
    );
    const second = await recordAgreedTerms(db, 'The Jensen family', await getMoneySettings(db));

    expect(first.classDeposit).toBe(100);
    expect(second.classDeposit).toBe(200);
  });

  it('records the family and when they agreed', async () => {
    const when = new Date('2026-08-02T09:30:00Z');
    const record = await recordAgreedTerms(
      db,
      'The Saint family',
      await getMoneySettings(db),
      when,
    );

    expect(record.familyName).toBe('The Saint family');
    expect(record.agreedAt.toISOString()).toBe(when.toISOString());
  });
});
