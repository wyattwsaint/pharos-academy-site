import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { isEmailAddress, textField as text } from '../forms.js';
import { schoolDetails, type SchoolDetails } from '../db/schema.js';

/**
 * The school's own details: address, phone, email, school-year start, mission,
 * vision and the Give URL (#18 §10).
 *
 * The mirror is the argument for this table existing at all — the address and
 * phone appear in 22 hand-typed places on the live site, mission and vision in
 * four, and they have already drifted. One row, rendered everywhere.
 */

/** The field names, which are also the form field names and the error keys. */
export type SchoolDetailsFields = {
  address: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`. */
  schoolYearStart: string;
  mission: string;
  vision: string;
  giveUrl: string;
};

export type SchoolDetailsErrors = Partial<Record<keyof SchoolDetailsFields, string>>;

export type ParsedSchoolDetails = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: SchoolDetailsFields;
  /** Empty when the submission is good. */
  errors: SchoolDetailsErrors;
};

/** The singleton row's id. There is one school. */
const ROW_ID = 1;

/** The current details. */
export async function getSchoolDetails(db: Db): Promise<SchoolDetails> {
  const rows = await db.select().from(schoolDetails).where(eq(schoolDetails.id, ROW_ID)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error('The school details row is missing — run `npm run db:migrate`.');
  }
  return row;
}

/**
 * Save the details and stamp them.
 *
 * The stamp is overwritten, not appended (#18 §4): "who last edited this" is
 * the question the school actually asks, and answering it costs two columns
 * rather than an audit screen nobody opens.
 */
export async function saveSchoolDetails(
  db: Db,
  values: SchoolDetailsFields,
  editorName: string,
  now = new Date(),
): Promise<SchoolDetails> {
  const [row] = await db
    .update(schoolDetails)
    .set({ ...values, lastEditedBy: editorName, lastEditedAt: now })
    .where(eq(schoolDetails.id, ROW_ID))
    .returning();

  if (!row) throw new Error('The school details row is missing — run `npm run db:migrate`.');
  return row;
}

/** Read a submitted form, trimmed, with every complaint collected at once. */
export function parseSchoolDetails(form: FormData): ParsedSchoolDetails {
  const values: SchoolDetailsFields = {
    address: text(form, 'address').replace(/\r\n/g, '\n'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    schoolYearStart: text(form, 'schoolYearStart'),
    mission: text(form, 'mission'),
    vision: text(form, 'vision'),
    giveUrl: text(form, 'giveUrl'),
  };

  const errors: SchoolDetailsErrors = {};
  for (const [field, label] of Object.entries(LABELS) as [keyof SchoolDetailsFields, string][]) {
    if (!values[field]) errors[field] = `${label} cannot be empty.`;
  }

  if (values.email && !isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }
  if (values.schoolYearStart && !isCalendarDate(values.schoolYearStart)) {
    errors.schoolYearStart = 'Give the first day of the school year as a real date.';
  }
  if (values.giveUrl && !isWebAddress(values.giveUrl)) {
    errors.giveUrl = 'The Give link needs a full web address starting http:// or https://.';
  }

  return { values, errors };
}

/** The human names of the fields, used in both the form and its errors. */
export const LABELS: Record<keyof SchoolDetailsFields, string> = {
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
  schoolYearStart: 'School year starts',
  mission: 'Mission',
  vision: 'Vision',
  giveUrl: 'Give link',
};

/**
 * The year to print in the footer.
 *
 * Computed, never stored (#18 §10) — the live site has read "© 2025" all year,
 * and a stored year is the only way that happens.
 */
export function copyrightYear(now = new Date()): number {
  // In the school's own timezone, not the server's. A page rendered in a
  // Vercel region at 20:00 on 31 December is still December in Enola, and a
  // footer that turns over five hours early is a different kind of wrong year.
  return Number(
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: SCHOOL_TIME_ZONE }).format(now),
  );
}

/** Enola, Pennsylvania. */
export const SCHOOL_TIME_ZONE = 'America/New_York';

/**
 * The school's phone as a `tel:` target.
 *
 * Held here rather than in each template because the phone is displayed the way
 * Jill types it — "(717) 555-0142" — and dialled stripped, and two surfaces
 * writing that regex out separately is how one of them ends up keeping the
 * parentheses. `+` survives so an international prefix still dials.
 */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** "Last edited by Jill Kilker on 5 August 2026", or that nothing has been. */
export function formatStamp(editorName: string | null, editedAt: Date | null): string {
  if (!editorName || !editedAt) return 'Not edited yet';
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(editedAt);
  return `Last edited by ${editorName} on ${day}`;
}



/** `YYYY-MM-DD`, and a day that exists — 31 February is a typo, not a date. */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
