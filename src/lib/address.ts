/**
 * A household's postal address — the one shape the site accepts, and the rule
 * for it (#310, #312, ADR-0024).
 *
 * **This is a household's address and never a child's.** ADR-0007 barred the
 * home address along with each child's date of birth, allergies, medical
 * conditions, evaluation history and custody arrangements; ADR-0024 reopens it
 * exactly this far and no further. A household address is the same class of
 * fact as the email address the site has always held — it is about the people
 * the school corresponds with, not about a student — and every argument in
 * ADR-0007 about encryption, retention, permissions and disclosure is about the
 * per-child fields, which remain barred from the form, the parser, the schema
 * and the `application_children` table.
 *
 * **Structured rather than a textarea**, unlike the school's own address on the
 * School Details screen. That one is a block of text the office pastes into a
 * letter; this one is typed by a parent on a phone, has to be checkable while
 * they type, and has to come back to them in a confirmation they can correct.
 * A free-text box can hold "Gettysburg" and nothing else and the site could not
 * tell.
 *
 * A leaf: it imports nothing, because the browser downloads it. The rules the
 * Apply page runs as a family types are these rules, not a second copy of them.
 */

/**
 * Where the school posts paperwork. One per application, never per child.
 *
 * Every part is a string and empty is a real state — a row written before #312,
 * and a form nobody has filled in yet, are the same shape. `street2` is the
 * only part that is *allowed* to stay empty: apartments exist and most families
 * do not live in one.
 */
export type HouseholdAddress = {
  /** The first street line. "12 Oak Lane". */
  street: string;
  /** The second, optional. "Apt 3", "c/o Marsh". */
  street2: string;
  city: string;
  /** A two-letter code from `US_STATES`. Never a name. */
  state: string;
  /** `#####` or `#####-####`. */
  zip: string;
};

/**
 * The fifty states and the District of Columbia, as the Postal Service writes
 * them.
 *
 * Codes as values and names on screen: a parent picks "Pennsylvania" and the
 * record holds `PA`, which is what an envelope wants and what a later export
 * can be sorted by. Territories are absent — the school is a Pennsylvania day
 * school and a family in Guam is a conversation, not a dropdown entry.
 */
export const US_STATES: readonly { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
] as const;

/**
 * The state the dropdown opens on.
 *
 * Pharos is a Pennsylvania day school with a Pennsylvania catchment, so this is
 * right for almost every family and is one control fewer for them to touch. It
 * is a *preselection* and not a lock: the dropdown carries all fifty-one, and a
 * family who has moved changes it like any other field.
 */
export const DEFAULT_STATE = 'PA';

/** An address nobody has filled in — and, identically, one from before #312. */
export function blankAddress(): HouseholdAddress {
  return { street: '', street2: '', city: '', state: DEFAULT_STATE, zip: '' };
}

/** Whether this is one of the fifty-one. */
export function isUsState(value: string): boolean {
  return US_STATES.some((state) => state.code === value);
}

/**
 * `#####` or `#####-####`.
 *
 * Strict for `isPhoneNumber`'s reason: a ZIP is typed by a parent who will be
 * *posted to*, and a transposed digit should be an inline error rather than a
 * returned envelope. ZIP+4 is accepted because families copy it off their own
 * mail, and refusing it would be refusing a more precise answer.
 */
export const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

export function isZipCode(value: string): boolean {
  return ZIP_PATTERN.test(value);
}

/** What the form says when the address is short of a part it needs. */
export const ADDRESS_REQUIRED_MESSAGE =
  'We need a street address, a town, a state and a ZIP code so we can post you paperwork.';

/** What it says when every part is there but the ZIP is not a ZIP. */
export const ZIP_FORMAT_MESSAGE = 'A ZIP code looks like 17325, or 17325-1234.';

/** What it says when the state is not one the dropdown offers. */
export const STATE_UNKNOWN_MESSAGE = 'Choose a state from the list.';

/** The parts a family can be short of. `street2` is not one of them. */
export type AddressPart = 'street' | 'city' | 'state' | 'zip';

const ASKED_FOR: readonly AddressPart[] = ['street', 'city', 'state', 'zip'];

/**
 * What is wrong with this address: the sentence to print, and the parts it is
 * about.
 *
 * Both together, because the form needs both and they must agree. The Apply
 * page prints the sentence once and marks `aria-invalid` on the controls the
 * sentence is about, in four places — the server's markup, the browser's
 * repaint, the browser's focus-on-refusal, and the tests. When each of those
 * decided for itself which parts were short, they were four copies of a rule
 * that had to stay in step; the state was left out of three of them, so a
 * refused state printed "Choose a state from the list." with the mark on
 * nothing and the cursor in the street box.
 *
 * One sentence for the whole address rather than one per part, and that is the
 * page's convention rather than a shortcut: the Statement of Faith grid and the
 * eight child rows each carry one sentence over many controls, for the same
 * reason — a family filling in an address is doing one thing, and four
 * simultaneous complaints about it read as four problems.
 *
 * `street2` is never asked about. It is the only optional part, and a rule that
 * mentioned it would be a rule about apartments.
 */
export function addressFault(
  address: HouseholdAddress,
): { parts: readonly AddressPart[]; message: string } | undefined {
  const blank = ASKED_FOR.filter((part) => !address[part]);
  if (blank.length) return { parts: blank, message: ADDRESS_REQUIRED_MESSAGE };
  // After the required check, because "choose a state" is unhelpful advice to
  // somebody who has not typed a street yet.
  if (!isUsState(address.state)) return { parts: ['state'], message: STATE_UNKNOWN_MESSAGE };
  if (!isZipCode(address.zip)) return { parts: ['zip'], message: ZIP_FORMAT_MESSAGE };
  return undefined;
}

/** Read an address and say what is wrong with it, or nothing. */
export function addressError(address: HouseholdAddress): string | undefined {
  return addressFault(address)?.message;
}

/** Which parts that sentence is about — empty when there is no sentence. */
export function addressPartsShort(address: HouseholdAddress): readonly AddressPart[] {
  return addressFault(address)?.parts ?? [];
}

/**
 * The address as it goes on an envelope — two or three lines.
 *
 * One place, because three surfaces print it: the admin screen, the school's
 * notification and the family's confirmation. Empty for an address with no
 * street, which is what a row written before #312 has, so every caller renders
 * the same dash rather than a blank block that reads as a bug.
 */
export function formatAddress(address: HouseholdAddress): string {
  if (!address.street) return '';
  const lines = [address.street];
  if (address.street2) lines.push(address.street2);
  lines.push([[address.city, address.state].filter(Boolean).join(', '), address.zip].filter(Boolean).join(' '));
  return lines.filter(Boolean).join('\n');
}
