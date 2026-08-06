import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { agreedTerms, moneySettings, type AgreedTermsRow } from '../db/schema.js';
import { validateMoneySettings, type MoneySettings } from './settings.js';

/**
 * The money row, read and written (#29).
 *
 * Two functions write, and they are deliberately asymmetric. `saveMoneySettings`
 * updates the one settings row and stamps it. `recordAgreedTerms` **inserts** a
 * copy of those numbers against a family's name and nothing ever updates it
 * again — so "a change never rewrites what an already-enrolled family agreed
 * to" is a property of the code rather than a promise about it (ADR-0006).
 */

/** The singleton row's id. There is one school and one set of numbers. */
const ROW_ID = 1;

/** The current settings, plus the stamp the admin prints. */
export type StoredMoneySettings = MoneySettings & {
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

export async function getMoneySettings(db: Db): Promise<StoredMoneySettings> {
  const rows = await db.select().from(moneySettings).where(eq(moneySettings.id, ROW_ID)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error('The money settings row is missing — run `npm run db:migrate`.');
  }
  return {
    ...toSettings(row),
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}

/**
 * Save the numbers and stamp them.
 *
 * Validated again here rather than trusting the form, because the stamp is the
 * only control on this row: with permissions flat, "who changed the deposit to
 * zero" is the whole of the school's recourse, and a row that could not have
 * held a zero in the first place is better recourse still.
 */
export async function saveMoneySettings(
  db: Db,
  values: MoneySettings,
  editorName: string,
  now = new Date(),
): Promise<StoredMoneySettings> {
  const errors = validateMoneySettings(values);
  if (Object.keys(errors).length > 0) {
    throw new Error(`Refusing to save money settings: ${Object.values(errors).join(' ')}`);
  }

  const [row] = await db
    .update(moneySettings)
    .set({ ...toColumns(values), lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(moneySettings.id, ROW_ID))
    .returning();

  if (!row) throw new Error('The money settings row is missing — run `npm run db:migrate`.');
  return { ...toSettings(row), lastEditedBy: row.lastEditedBy, lastEditedAt: row.lastEditedAt };
}

/**
 * Freeze today's numbers against a family's name.
 *
 * Called when a family applies. What it stores is a copy, not a pointer, and
 * that is the entire point: the price a family applied at is the price they
 * pay, however many times the board revises the fee schedule afterwards.
 */
export async function recordAgreedTerms(
  db: Db,
  familyName: string,
  settings: MoneySettings,
  now = new Date(),
): Promise<AgreedTerms> {
  const [row] = await db
    .insert(agreedTerms)
    .values({ familyName, agreedAt: now, ...toColumns(settings) })
    .returning();

  if (!row) throw new Error(`Could not record the terms ${familyName} agreed to.`);
  return toAgreedTerms(row);
}

/** What one family agreed to, and when. */
export type AgreedTerms = MoneySettings & {
  id: string;
  familyName: string;
  agreedAt: Date;
};

export async function getAgreedTerms(db: Db, id: string): Promise<AgreedTerms | undefined> {
  const rows = await db.select().from(agreedTerms).where(eq(agreedTerms.id, id)).limit(1);
  const row = rows[0];
  return row ? toAgreedTerms(row) : undefined;
}

/** The domain shape as columns. One mapping, used by both writers. */
function toColumns(values: MoneySettings) {
  return {
    standardRate: values.rates.standard,
    highSchoolCreditRate: values.rates.highSchoolCredit,
    registrationFee: values.registrationFee,
    classDeposit: values.classDeposit,
    lateFee: values.lateFee,
    studyHallFee: values.studyHallFee,
    instalmentDates: values.instalmentDates,
    refundTerms: values.refundTerms,
    depositCreditedAgainstTuition: values.depositCreditedAgainstTuition,
    notificationAddresses: values.notificationAddresses,
  };
}

/** Columns as the domain shape. The inverse of `toColumns`, for either table. */
function toSettings(row: ReturnType<typeof toColumns>): MoneySettings {
  return {
    rates: { standard: row.standardRate, highSchoolCredit: row.highSchoolCreditRate },
    registrationFee: row.registrationFee,
    classDeposit: row.classDeposit,
    lateFee: row.lateFee,
    studyHallFee: row.studyHallFee,
    instalmentDates: row.instalmentDates,
    refundTerms: row.refundTerms,
    depositCreditedAgainstTuition: row.depositCreditedAgainstTuition,
    notificationAddresses: row.notificationAddresses,
  };
}

function toAgreedTerms(row: AgreedTermsRow): AgreedTerms {
  return {
    ...toSettings(row),
    id: row.id,
    familyName: row.familyName,
    agreedAt: row.agreedAt,
  };
}
