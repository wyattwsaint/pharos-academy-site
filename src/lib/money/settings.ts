/**
 * Every number about money the school controls, in one place (#29, #18 §10).
 *
 * The rate tiers, the registration fee, the per-class deposit, the late fee,
 * the study hall fee, the four quarterly instalment dates, the refund terms,
 * whether the deposit is credited against tuition, and who is emailed when an
 * application arrives.
 *
 * This module is the *values and the arithmetic*; `store.ts` is the row. The
 * split matters because the public site reads these figures on every render and
 * the admin writes them once a year, and because the arithmetic — what a family
 * is told it owes — has to be testable without a database.
 *
 * **Permissions are flat.** The recommendation was to gate fee changes to
 * George on the grounds that they are board decisions; the owner overrode it
 * (#16). The consequence is that attribution is the only remaining control on
 * the money, which is why the row carries a stamp and why named accounts are
 * load-bearing rather than ceremonial.
 */

/** How many quarterly instalments the school bills in. The handbook's four. */
export const INSTALMENT_COUNT = 4;

/** The two hourly rates a course can be priced at (CONTEXT.md, "rate tier"). */
export type RateCard = {
  /** Dollars an hour for an ordinary class. */
  standard: number;
  /** Dollars an hour for a class carrying high-school credit. */
  highSchoolCredit: number;
};

export type MoneySettings = {
  rates: RateCard;
  /** Once per student per year, non-refundable. */
  registrationFee: number;
  /** Per student, per class. Holds the seat. */
  classDeposit: number;
  /** Added per class when a quarterly payment misses its date. */
  lateFee: number;
  /**
   * Per student, per study hall.
   *
   * One number, and the school owes an answer: the handbook says $10 on page 3
   * and $60 on page 8. That contradiction is raised rather than resolved here —
   * this surface simply cannot hold both, which is the point.
   */
  studyHallFee: number;
  /** The four quarterly due dates, `YYYY-MM-DD`, earliest first. */
  instalmentDates: string[];
  /** What the school refunds and when, in the school's own words. */
  refundTerms: string;
  /**
   * Whether the $100 deposit comes off the tuition owed, or is on top of it.
   *
   * On by default, confirmed by George (#14). Not cosmetic: on a three-class
   * application it is the difference between telling a family they owe their
   * instructors $1,300 and $900. It is a settings value so that reversing it is
   * a change in the admin rather than a rebuild.
   */
  depositCreditedAgainstTuition: boolean;
  /**
   * Who is emailed when an inquiry or an application arrives. At least one,
   * often two.
   *
   * One list for both (#25 AC 3). The inquiry is not an application, but it is
   * read by the same people, and the alternative — a second list of the same
   * two addresses on a second screen — is the one that is wrong on the day the
   * Pharos Gmail changes hands.
   */
  notificationAddresses: string[];
};

/**
 * What the school publishes today, from `docs/mirror/pdf-text/policy-handbook.txt`.
 *
 * Seeded rather than left blank for the same reason the school details are: an
 * empty fee rendering as a gap is how a placeholder ships to production. Jill
 * or George overwrites any of it from the admin.
 */
export const SEEDED_MONEY_SETTINGS: MoneySettings = {
  rates: { standard: 10, highSchoolCredit: 15 },
  registrationFee: 25,
  classDeposit: 100,
  lateFee: 50,
  // Page 3 of the handbook. Page 8 says $60. See `STUDY_HALL_FEE_CONTRADICTION`.
  studyHallFee: 10,
  // The handbook's own four, for 2026–27: two weeks before classes start, then
  // weeks 6, 13 and 19.
  instalmentDates: ['2026-08-24', '2026-10-12', '2026-12-07', '2027-02-08'],
  refundTerms:
    'The registration fee and the class deposits are non-refundable. A student who ' +
    'withdraws more than a week before classes start is refunded class fees, books and ' +
    'supplies fees, and editing and evaluation fees in full. A student who withdraws after ' +
    'classes have started is refunded class fees pro rata. Study hall fees are ' +
    'non-refundable.',
  depositCreditedAgainstTuition: true,
  notificationAddresses: ['jkilker@enolacog.com'],
};

/**
 * The one thing the school still owes an answer on (#29 AC 7).
 *
 * Stated here, printed beside the field in the admin, and raised with the
 * school on the tracker as #51. The settings hold exactly one number, so this cannot
 * be quietly averaged or silently picked — somebody at Pharos has to decide
 * which page of their own handbook is right.
 */
export const STUDY_HALL_FEE_CONTRADICTION =
  'The handbook states this fee twice and disagrees with itself: $10 per study hall on ' +
  'page 3, $60 per student per study hall on page 8. Whichever number is here is the ' +
  'one the site publishes. The school needs to decide which is right.';

/** The field names, which are also the form field names and the error keys. */
export type MoneyErrors = Partial<Record<MoneyField, string>>;

export type MoneyField =
  | 'standardRate'
  | 'highSchoolCreditRate'
  | 'registrationFee'
  | 'classDeposit'
  | 'lateFee'
  | 'studyHallFee'
  | 'instalmentDates'
  | 'refundTerms'
  | 'depositCreditedAgainstTuition'
  | 'notificationAddresses';

/** The human names of the fields, used in the form, its errors and the diff. */
export const LABELS: Record<MoneyField, string> = {
  standardRate: 'Standard rate, per hour',
  highSchoolCreditRate: 'High-school credit rate, per hour',
  registrationFee: 'Registration fee',
  classDeposit: 'Deposit, per class',
  lateFee: 'Late fee, per class',
  studyHallFee: 'Study hall fee',
  instalmentDates: 'Quarterly payment dates',
  refundTerms: 'Refund terms',
  depositCreditedAgainstTuition: 'Deposit is credited against tuition',
  // Inquiries as well as applications since #25: they are read by the same
  // people, and a second list of the same two addresses is the one that goes
  // stale. This is the "held in settings rather than hard-coded" the inquiry
  // ticket requires.
  notificationAddresses: 'Inquiry and application notifications go to',
};

export type ParsedMoneySettings = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: MoneySettings;
  /** Empty when the submission is good. */
  errors: MoneyErrors;
};

/**
 * Read a submitted form, with every complaint collected at once.
 *
 * The dates arrive as four `instalmentDate` fields and the addresses as one
 * textarea, one per line — a repeated control and a free list are the two
 * shapes that survive having no JavaScript, and this admin has none.
 *
 * `previous` supplies whatever the form did not send, which is only ever the
 * checkbox: an unticked checkbox posts nothing at all, and "absent" has to mean
 * *off* rather than *unchanged* or the flag could never be turned off.
 */
export function parseMoneySettings(form: FormData): ParsedMoneySettings {
  const values: MoneySettings = {
    rates: {
      standard: money(form, 'standardRate'),
      highSchoolCredit: money(form, 'highSchoolCreditRate'),
    },
    registrationFee: money(form, 'registrationFee'),
    classDeposit: money(form, 'classDeposit'),
    lateFee: money(form, 'lateFee'),
    studyHallFee: money(form, 'studyHallFee'),
    instalmentDates: form.getAll('instalmentDates').map((value) => String(value).trim()),
    refundTerms: text(form, 'refundTerms'),
    depositCreditedAgainstTuition: form.get('depositCreditedAgainstTuition') !== null,
    notificationAddresses: splitLines(text(form, 'notificationAddresses')),
  };

  return { values, errors: validateMoneySettings(values) };
}

/**
 * Everything wrong with a set of values, in one pass.
 *
 * Separate from parsing so the store can refuse a bad write on its own — a
 * negative registration fee inserted by anything other than the form is still a
 * negative registration fee.
 */
export function validateMoneySettings(values: MoneySettings): MoneyErrors {
  const errors: MoneyErrors = {};

  const amounts: [MoneyField, number][] = [
    ['standardRate', values.rates.standard],
    ['highSchoolCreditRate', values.rates.highSchoolCredit],
    ['registrationFee', values.registrationFee],
    ['classDeposit', values.classDeposit],
    ['lateFee', values.lateFee],
    ['studyHallFee', values.studyHallFee],
  ];
  for (const [field, amount] of amounts) {
    if (!Number.isInteger(amount) || amount < 0) {
      errors[field] = `${LABELS[field]} has to be a whole number of dollars, and not negative.`;
    }
  }
  // The rates are the one pair where zero is not merely odd but wrong: a class
  // priced at $0 an hour is a free class, and the school does not run one.
  if (!errors.standardRate && values.rates.standard === 0) {
    errors.standardRate = 'The standard rate cannot be zero.';
  }
  if (!errors.highSchoolCreditRate && values.rates.highSchoolCredit === 0) {
    errors.highSchoolCreditRate = 'The high-school credit rate cannot be zero.';
  }

  const dates = values.instalmentDates;
  if (dates.length !== INSTALMENT_COUNT || dates.some((date) => !isCalendarDate(date))) {
    errors.instalmentDates = `Give all ${INSTALMENT_COUNT} quarterly payment dates as real dates.`;
  } else if (dates.some((date, index) => index > 0 && date <= dates[index - 1]!)) {
    // Ascending, strictly. Out of order is how a typed year ("2026" for
    // "2027" on the fourth) gets published as a payment date in the past.
    errors.instalmentDates = 'The four payment dates have to run in order, earliest first.';
  }

  if (!values.refundTerms) {
    errors.refundTerms = 'The refund terms cannot be empty — families are asked to agree to them.';
  }

  if (values.notificationAddresses.length === 0) {
    errors.notificationAddresses =
      'At least one address, or an application arrives and nobody is told.';
  } else {
    const bad = values.notificationAddresses.filter((address) => !isEmailAddress(address));
    if (bad.length > 0) {
      errors.notificationAddresses = `Not an email address: ${bad.join(', ')}.`;
    }
  }

  return errors;
}

/** "$420". Whole dollars, because every figure the school publishes is one. */
export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/**
 * "420". The same figure a query string can carry (#265).
 *
 * `formatMoney` without the dollar sign, which a giving-page link has no use
 * for.
 *
 * Beside the formatter it is a variant of, rather than inside `giving-link.ts`
 * which is its one caller: it is a way of writing a figure, and every other way
 * of writing one is here. The browser wrote it too until #304 greyed the
 * payment buttons on the form stage — there is no href on screen to keep in
 * step with the totals now, so the server writes the amount once, against
 * figures that have stopped moving.
 */
export function moneyOnALink(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * What the deposits take off the tuition, said once (#261).
 *
 * The Apply page prints this twice — the server renders it, and the browser
 * rewrites it as the family ticks (ADR-0019) — so it lives beside the formatter
 * both of them already import rather than as two literals to drift apart.
 * Empty when there is no credit: a family who owes nothing is not told that
 * nothing came off it.
 */
export function depositCreditNote(creditedAgainstTuition: number): string {
  if (creditedAgainstTuition <= 0) return '';
  return ` — the deposits come off this, ${formatMoney(creditedAgainstTuition)} of it`;
}

/** What one field's value reads as on the confirmation screen. */
export function describeValue(values: MoneySettings, field: MoneyField): string {
  switch (field) {
    case 'standardRate':
      return `${formatMoney(values.rates.standard)}/hour`;
    case 'highSchoolCreditRate':
      return `${formatMoney(values.rates.highSchoolCredit)}/hour`;
    case 'registrationFee':
      return formatMoney(values.registrationFee);
    case 'classDeposit':
      return formatMoney(values.classDeposit);
    case 'lateFee':
      return formatMoney(values.lateFee);
    case 'studyHallFee':
      return formatMoney(values.studyHallFee);
    case 'instalmentDates':
      return values.instalmentDates.join(', ');
    case 'refundTerms':
      return values.refundTerms;
    case 'depositCreditedAgainstTuition':
      return values.depositCreditedAgainstTuition
        ? 'credited against tuition'
        : 'on top of tuition';
    case 'notificationAddresses':
      return values.notificationAddresses.join(', ');
  }
}

/** One field the school is about to change, as it will be described to them. */
export type MoneyChange = { field: MoneyField; label: string; from: string; to: string };

/**
 * What is actually changing, field by field.
 *
 * This is what makes the confirmation an *explicit* one rather than a
 * ceremonial "are you sure": the screen names the numbers, both of them, before
 * it says the words "every family". A confirmation that does not say what
 * changed teaches the person to click through it.
 *
 * An empty list means nothing changed, and the admin says so instead of
 * stamping the row with a save that altered nothing.
 */
export function moneyChanges(before: MoneySettings, after: MoneySettings): MoneyChange[] {
  const changes: MoneyChange[] = [];
  for (const field of Object.keys(LABELS) as MoneyField[]) {
    const from = describeValue(before, field);
    const to = describeValue(after, field);
    if (from !== to) changes.push({ field, label: LABELS[field], from, to });
  }
  return changes;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A dollar amount as typed, which is `NaN` when it is not one.
 *
 * `NaN` rather than a fallback of zero: a fee that silently became free is the
 * failure this whole module exists to prevent, and `validateMoneySettings`
 * rejects `NaN` by the same rule it rejects a negative.
 */
function money(form: FormData, name: string): number {
  const raw = text(form, name).replace(/^\$/, '').replace(/,/g, '');
  return raw === '' ? Number.NaN : Number(raw);
}

/** A textarea of one-per-line values, blank lines dropped. */
function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
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
