import { BELIEFS_PATH } from '../about/beliefs.js';
import { describeFailure, sendAll, type Mail, type Sender } from '../backup/monthly.js';
import { isEmailAddress, phoneError, textField as text } from '../forms.js';
import { SCHOOL_NAME } from '../site.js';

/**
 * The inquiry — the primary call to action on the whole site (#25).
 *
 * A parent gives a name, an email and their children's ages, and a real
 * conversation starts. Everything about this module follows from one sentence
 * in the ticket: **the inquiry must both email and persist.** "Check the admin
 * panel" is not a notification, and a spam-filtered lead is a lost family — so
 * the two deliveries are independent, both are attempted whatever the other
 * does, and each records what happened to it.
 *
 * The module is deliberately database-free and mailer-free: `submitInquiry`
 * takes the store and the sender as parameters, so the tests beside it drive
 * every combination of the two failing without a database that will not write
 * or an API key that will not send.
 */

/** The address of the page that holds the form and takes its POST. */
export const INQUIRY_PATH = '/inquire';

/**
 * Where the confirmation's quiet application line points, today.
 *
 * The application flow is its own ticket (#18 §11); until it exists the honest
 * destination for "I already know we want to apply" is the page that says how
 * applying works, its fees and its dates. A link to a flow that is not built
 * would be the one wrong note in an email whose whole job is to be trustworthy.
 */
const APPLY_PATH = '/admissions';

/** The class list and the Statement of Faith — the two links #25 names. */
const CLASSES_PATH = '/classes';

/**
 * What the parent typed.
 *
 * **The phone number is mandatory, and that reverses #25** (#311, ADR-0024).
 * Its absence used to be the decision — a phone field raises the perceived
 * commitment of the form more than any other, so the ticket refused one and the
 * test beside this file enforced the refusal. The school then found it could
 * reach a family only by email, and decided the operational need outweighs the
 * friction. A mandatory field is the maximum-friction version of what was
 * excluded; the reversal is argued rather than assumed, in the ADR.
 */
export type InquiryFields = {
  name: string;
  email: string;
  /**
   * `###-###-####`, stored exactly as typed.
   *
   * The rule is `forms.ts`'s rather than this module's, because the application
   * asks for the same number under a different name (#310) and two copies of a
   * pattern is how one form comes to accept what the other refuses.
   */
  phone: string;
  /**
   * Free text, never a dropdown — families have several children, and the
   * school serves a fourteen-year span.
   *
   * This is the one field that earns its friction: without it every first reply
   * from Jill is a question rather than an answer.
   */
  ages: string;
  /** Optional. The only optional field on the form. */
  message: string;
};

export type InquiryErrors = Partial<Record<keyof InquiryFields, string>>;

export type ParsedInquiry = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: InquiryFields;
  /** Empty when the submission is good. */
  errors: InquiryErrors;
};

/**
 * What the parent reads when it worked.
 *
 * **No response-time promise, anywhere** (#25). A named clock would need
 * George's sign-off and would block launch on an unanswered question; who
 * answers an inquiry and how fast is a real operational question for the school
 * and it no longer gates anything. `inquiry.test.ts` scans every string this
 * module can put in front of a family for one.
 */
export const RECEIVED_MESSAGE = 'We’ll get back to you!';

/** Read a submitted form, trimmed, with every complaint collected at once. */
export function parseInquiry(form: FormData): ParsedInquiry {
  const values: InquiryFields = {
    name: text(form, 'name'),
    email: text(form, 'email'),
    phone: text(form, 'phone'),
    ages: text(form, 'ages'),
    message: text(form, 'message'),
  };

  const errors: InquiryErrors = {};
  if (!values.name) errors.name = 'We need a name to know who we are talking to.';
  if (!values.email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }
  /*
   * The same rule the browser ran, run again. The auto-format is an
   * enhancement; a submission with scripting off, or from anything that is not
   * a browser, meets the identical pattern here (#311 AC 2).
   */
  const phone = phoneError(values.phone);
  if (phone) errors.phone = phone;
  if (!values.ages) {
    errors.ages = 'Tell us your children’s ages — it is what lets us answer rather than ask.';
  }

  return { values, errors };
}

/**
 * The message the school receives.
 *
 * Plain text, and it carries the parent's own address in the body rather than
 * only in a header: a school office forwards these, and a forwarded message
 * loses its reply-to.
 *
 * `stored` is why this takes an option rather than only the fields. When the
 * database write failed, **this email is the only copy of the inquiry that
 * exists**, and it has to say so in words somebody acts on — that is the half
 * of "neither failure silently loses the other" that points this way.
 */
export function inquiryNotification(
  values: InquiryFields,
  options: { to: string; from: string; stored: boolean },
): Mail {
  const lines = [
    `${values.name} has asked about ${SCHOOL_NAME}.`,
    '',
    `Email:            ${values.email}`,
    // The number is in the body for the reason the address is: the school
    // office forwards these, and somebody acting from their inbox should be
    // able to dial without opening the admin (#310, story 4).
    `Phone:            ${values.phone}`,
    `Children’s ages:  ${values.ages}`,
  ];

  if (values.message) lines.push('', 'What they asked:', values.message);

  lines.push(
    '',
    options.stored
      ? 'This inquiry is also saved on the website — it is on the Inquiries screen in the admin.'
      : 'WARNING: this inquiry could NOT be saved on the website. This email is the only ' +
          'copy of it. Reply to it, or copy it somewhere, before this message is lost.',
    '',
    'Sent from the inquiry form on the Pharos Academy website.',
  );

  return {
    to: options.to,
    from: options.from,
    subject: `Inquiry — ${values.name}`,
    text: lines.join('\n'),
  };
}

/**
 * The message the family receives.
 *
 * Two lines about what Pharos is, the class list, the Statement of Faith, and a
 * small last line carrying a quiet link to the application — for the family who
 * already knows they want to apply and should not have to wait for a reply to
 * start (#25).
 *
 * `site` is the absolute origin, because an email has no base URL: a
 * root-relative link in a mail client is a link that goes nowhere.
 */
export function inquiryConfirmation(
  values: InquiryFields,
  options: { from: string; site: string },
): Mail {
  const at = (path: string) => new URL(path, options.site).toString();

  const text = [
    `Thank you for asking about ${SCHOOL_NAME}, ${values.name}.`,
    '',
    `${SCHOOL_NAME} is a Christian classical school in Enola, Pennsylvania, running mornings ` +
      'on Monday, Wednesday and Thursday for children aged 4 to 18. Families teach at home the ' +
      'rest of the week; we take the subjects that are better taught together.',
    '',
    'Two things worth reading before we speak:',
    '',
    `  The classes we run, with ages and prices — ${at(CLASSES_PATH)}`,
    `  What we believe — ${at(BELIEFS_PATH)}`,
    '',
    // What we hold, said back — a family who mistyped a digit can spot it and
    // write in, which is the only correction route a capture-once record has.
    `We have your children’s ages, we will write back to this address, and we have ` +
      `${values.phone} if a call is easier.`,
    '',
    '—',
    `If you already know you would like to apply, how it works is here: ${at(APPLY_PATH)}`,
  ].join('\n');

  return {
    to: values.email,
    from: options.from,
    subject: `${SCHOOL_NAME} — thank you for asking`,
    text,
  };
}

/** Writes the inquiry down and answers with its id. Injected, so this module has no database. */
export type InquiryStore = (values: InquiryFields) => Promise<string>;

export type InquiryOutcome = {
  /**
   * Whether the inquiry is held *somewhere* the school can reach — a saved row,
   * a delivered email, or both.
   *
   * This and not "did everything succeed" is what decides the words on screen.
   * Nothing on this path may print a thank-you it cannot back up, and equally
   * nothing may tell a parent their question was lost when it is sitting in the
   * admin.
   */
  held: boolean;
  /** What to say on the page, in the school's voice rather than the mailer's. */
  message: string;
  /** The row's id, when the write succeeded. */
  id?: string;
  /** Why the write failed, when it did. Never shown to the parent. */
  storeError?: string;
  notified: boolean;
  notificationError?: string;
  confirmed: boolean;
  confirmationError?: string;
};

/**
 * Persist it, tell the school, tell the family — and be honest about which of
 * those actually happened.
 *
 * The three are independent on purpose (#25 AC 2). A Neon outage must not
 * swallow the email; a refused send must not roll back the row; and a
 * confirmation that bounces must never make the school's own copy disappear.
 * Each is attempted, each is reported, and the caller writes the result back
 * onto the row so a failure is visible in the admin rather than only in a log.
 *
 * An absent `sender` — a deployment with no mail credentials — is treated as a
 * refused send rather than as success, for the reason the volunteer form treats
 * it that way: both mean the school was not told.
 */
export async function submitInquiry(
  values: InquiryFields,
  options: {
    store: InquiryStore;
    sender: Sender | undefined;
    /** Where the school reads its inquiries. From settings, never from code. */
    to: readonly string[];
    from: string;
    /** The absolute origin the confirmation's links are built against. */
    site: string;
    /** The address a parent is given when nothing worked. */
    schoolEmail: string;
  },
): Promise<InquiryOutcome> {
  let id: string | undefined;
  let storeError: string | undefined;
  try {
    id = await options.store(values);
  } catch (error) {
    storeError = describeFailure(error);
  }

  /*
   * The rule — any rather than all, an absent sender as a refusal — is
   * `sendAll`'s, shared with the application (#32) so the two forms cannot
   * disagree about what "the school was told" means.
   */
  const notification = await sendAll(
    options.sender,
    options.to.map((address) =>
      inquiryNotification(values, { to: address, from: options.from, stored: id !== undefined }),
    ),
  );

  const confirmation = await sendAll(options.sender, [
    inquiryConfirmation(values, { from: options.from, site: options.site }),
  ]);

  const held = id !== undefined || notification.sent;

  return {
    held,
    message: held
      ? RECEIVED_MESSAGE
      : `We could not take that just now — nothing was lost, but it did not reach us. ` +
        `Please email ${options.schoolEmail} and we will pick it up from there.`,
    id,
    storeError,
    notified: notification.sent,
    notificationError: notification.error,
    confirmed: confirmation.sent,
    confirmationError: confirmation.error,
  };
}
