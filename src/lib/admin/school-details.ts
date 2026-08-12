import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { isEmailAddress, textField as text } from '../forms.js';
import { schoolDetails, type SchoolDetails } from '../db/schema.js';

/**
 * The school's own details: address, phone, email, school-year start, mission,
 * vision, the Give URL (#18 §10) and the home page's announcement banner (#15).
 *
 * The banner is here rather than beside the announcements because it is a
 * singleton and because *this* screen's save already revalidates every
 * published page — which is what lets the office change the words without a
 * deploy. What it means is `home/announcement-banner.ts`; this module only
 * reads and writes it.
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
  /**
   * Where the registration fee is paid online (#111). Absolute http(s), or
   * empty — empty means the Apply page offers no online option at all.
   */
  registrationUrl: string;
  /** The announcement banner's switch — see `home/announcement-banner.ts`. */
  bannerEnabled: boolean;
  bannerMessage: string;
  /** `YYYY-MM-DD`, or empty. Empty is stored as null, not as an epoch. */
  bannerDate: string;
  /** Absolute http(s), or empty for an unlinked message. */
  bannerLink: string;
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
    .set({
      ...values,
      // The one field whose form shape is not its column shape: a date column
      // has no empty string, and `''` is a write error rather than "no date".
      bannerDate: values.bannerDate || null,
      lastEditedBy: editorName,
      lastEditedAt: now,
    })
    .where(eq(schoolDetails.id, ROW_ID))
    .returning();

  if (!row) throw new Error('The school details row is missing — run `npm run db:migrate`.');
  return row;
}

/**
 * The saved row, back in the shape the form submits.
 *
 * One conversion rather than one per caller: the admin screen redisplays the
 * row, and two test suites save a row back with a single field changed. All
 * three used to spell the mapping out, and each was a place a new field could
 * be forgotten — which is how a save silently blanks the one nobody added.
 */
export function schoolDetailsFields(details: SchoolDetails): SchoolDetailsFields {
  return {
    address: details.address,
    phone: details.phone,
    email: details.email,
    schoolYearStart: details.schoolYearStart,
    mission: details.mission,
    vision: details.vision,
    giveUrl: details.giveUrl,
    registrationUrl: details.registrationUrl,
    bannerEnabled: details.bannerEnabled,
    bannerMessage: details.bannerMessage,
    // Back to the empty string a `<input type="date">` posts when it is blank.
    bannerDate: details.bannerDate ?? '',
    bannerLink: details.bannerLink,
  };
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
    registrationUrl: text(form, 'registrationUrl'),
    // A checkbox posts its value only when it is ticked, so "absent" is "off".
    bannerEnabled: form.get('bannerEnabled') !== null,
    bannerMessage: text(form, 'bannerMessage'),
    bannerDate: text(form, 'bannerDate'),
    bannerLink: text(form, 'bannerLink'),
  };

  const errors: SchoolDetailsErrors = {};
  for (const field of ALWAYS_REQUIRED) {
    if (!values[field]) errors[field] = `${LABELS[field]} cannot be empty.`;
  }

  /*
   * The banner's fields are required only when it is switched on.
   *
   * Off, they are last year's words waiting to be reused, and complaining
   * about a blank message on a banner nobody is showing would make the switch
   * unusable — the office would have to empty the fields to turn it off, which
   * is exactly what having a switch is meant to avoid.
   */
  if (values.bannerEnabled) {
    if (!values.bannerMessage) errors.bannerMessage = `${LABELS.bannerMessage} cannot be empty.`;
    if (!values.bannerDate) {
      errors.bannerDate = 'Give the date the banner is about, or switch the banner off.';
    }
  }
  if (values.bannerDate && !isCalendarDate(values.bannerDate)) {
    errors.bannerDate = 'Give the date the banner is about as a real date.';
  }
  if (values.bannerLink && !isWebAddress(values.bannerLink)) {
    errors.bannerLink = 'The banner link needs a full web address starting http:// or https://.';
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
  if (values.registrationUrl && !isWebAddress(values.registrationUrl)) {
    errors.registrationUrl =
      'The registration payment link needs a full web address starting http:// or https://.';
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
  registrationUrl: 'Registration payment link',
  bannerEnabled: 'Show the banner on the home page',
  bannerMessage: 'Banner message',
  bannerDate: 'Banner date',
  bannerLink: 'Banner link',
};

/**
 * The fields that may never be blank, whatever else the form says.
 *
 * A list rather than "every key of LABELS", which is what it used to be: the
 * banner's four fields are legitimately empty while the banner is off, and a
 * blanket rule over the labels would forbid the state the switch exists to
 * express. The registration payment link is optional for the same kind of
 * reason: empty is "no online option yet", not a mistake.
 */
const ALWAYS_REQUIRED = [
  'address',
  'phone',
  'email',
  'schoolYearStart',
  'mission',
  'vision',
  'giveUrl',
] as const satisfies readonly (keyof SchoolDetailsFields)[];

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
