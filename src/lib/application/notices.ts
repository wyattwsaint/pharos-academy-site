/**
 * What leaves the site when an application arrives (#32, #18 §13 sends 3 and 4).
 *
 * Three messages, and which of them goes is decided by one fact — whether the
 * application was written down:
 *
 * - **The school is always told.** Every address in the money settings, never a
 *   hard-coded one, because the list is the school's to change and a second
 *   list in code is the one that goes stale.
 * - **A stored application confirms to the family**, listing what they chose
 *   and what to post.
 * - **A refused submission tells the family it was refused** — the half of the
 *   `stale` split that used to age out with nobody told (#32 AC 4). An
 *   *abandoned* draft sends nothing, and there is nothing here that could send
 *   it anything: a family who closed the tab chose to, and mail about it would
 *   be the site nagging somebody who already said no.
 *
 * The module is mailer-free and database-free. `deliverApplication` takes a
 * `Sender` and the already-computed submission, so the tests beside it assert
 * the messages the school and the family actually receive rather than that some
 * function was called.
 */

import { sendAll, type Mail, type Sender } from '../backup/monthly.js';
import { formatMoney, type MoneySettings } from '../money/settings.js';
import { unitPrice } from '../money/owed.js';
import { SCHOOL_NAME } from '../site.js';
import {
  APPLICATION_PATH,
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  faithAnswer,
  priceUnit,
  type ApplicationCost,
  type ApplicationFields,
  type PaymentMethod,
} from './application.js';
import { title as offeringTitle } from './offerings.js';
import { tallyLines, type TallyEntry } from './tally.js';

/** One submission, as everything downstream of the form sees it. */
export type ApplicationSubmission = {
  values: ApplicationFields;
  cost: ApplicationCost;
  /** The terms this family applied at — frozen ones if they were recorded. */
  settings: MoneySettings;
  /** The class tally *including* this application, deduplicated (#32 AC 1). */
  tally: readonly TallyEntry[];
  /** Whether anybody objected. Never a rejection — it starts a conversation. */
  flagged: boolean;
  /**
   * The row's reference — `applicationReference(id)`, never the raw uuid and
   * never a format built here (#218). Null when the write failed and this is a
   * refusal: there is no row, so there is nothing to call it by.
   */
  reference: string | null;
  /**
   * How the family said they would pay (#219, #221).
   *
   * On the submission rather than on `values` because it is not yet a field on
   * the form: #219 adds the control that asks, and until it lands the caller
   * derives it from the only fact the site has. Either way it arrives here as
   * one answer, and the emails read no other.
   */
  paymentMethod: PaymentMethod;
};

/**
 * The invoice both emails print, written once (#221).
 *
 * One writer, because a school told to expect $865 and a family told to send
 * $100 is the same submission saying two things — and the old shape, three
 * paragraphs of prose in one email and a four-line table in the other, made
 * that drift invisible until somebody held the two side by side.
 *
 * It is deliberately a *table*: an aligned label column and a right-aligned
 * amount column, so a plain-text mail client renders the thing a family is
 * actually looking for. The gross tuition is shown with the deposit credit
 * subtracting from it, rather than a netted `tuitionDue` arriving unexplained —
 * a family reading "$740" with nothing to divide it by cannot check the
 * arithmetic, and neither can the office.
 */
function invoice(
  cost: ApplicationCost,
  method: PaymentMethod,
  /**
   * The reference, on the copy that has not already printed one. The school's
   * email names the application at the top, where the office reads it; the
   * family's carries it here, under the total it belongs to.
   */
  options: { reference?: string | null; audience?: 'family' | 'school' } = {},
): string[] {
  const { total } = cost;
  const classes = cost.perChild.reduce((count, one) => count + one.offerings.length, 0);

  const items: [string, number][] = [
    ['Registration', total.registration],
    [`Deposits (${classes} ${classes === 1 ? 'class' : 'classes'})`, total.deposits],
    ['Tuition', total.tuition],
  ];
  if (total.creditedAgainstTuition > 0) {
    items.push(['Deposit credit against tuition', -total.creditedAgainstTuition]);
  }
  items.push(['TOTAL', total.total]);

  // Measured, not assumed: a fixed column is a column a large enough family
  // pushes a row out of, and a table with one row hanging off the end of it is
  // not the thing this email exists to be.
  const rows = rowsOf(items);
  const lines = [
    ...rows.slice(0, -1),
    // A blank line and nothing else separates the total from the items: a rule
    // of hyphens would be rewritten into an em dash by the house style's own
    // scan (#148), and the capitals carry the emphasis a plain-text email has.
    '',
    rows[rows.length - 1]!,
    '',
    `  ${status(total.total, method, options.audience ?? 'family')}`,
  ];
  if (options.reference) lines.push(`  Reference: ${options.reference}`);
  return lines;
}

/** The narrowest label column the block is set in, however short its labels. */
const LABEL_WIDTH = 32;

/** The itemized lines, every amount right-aligned under the last. */
function rowsOf(items: readonly [string, number][]): string[] {
  const labels = Math.max(LABEL_WIDTH, ...items.map(([label]) => label.length + 2));
  const amounts = Math.max(...items.map(([, amount]) => signed(amount).length));
  return items.map(([label, amount]) => `  ${label.padEnd(labels)}${signed(amount).padStart(amounts)}`);
}

/** `formatMoney`, with the minus outside the dollar sign as an invoice sets it. */
function signed(amount: number): string {
  return amount < 0 ? `-${formatMoney(-amount)}` : formatMoney(amount);
}

/**
 * What is due and how it is being paid — the one line under the total.
 *
 * It says what the family *told us*, never that money arrived: Vanco sends the
 * site no confirmation (ADR-0013), and a line claiming a payment nobody checked
 * is worse than no line.
 *
 * The same figures and the same method, in the pronoun each reader belongs in:
 * the school is not the "you" who told anybody anything.
 */
function status(total: number, method: PaymentMethod, audience: 'family' | 'school'): string {
  if (total === 0) return 'Nothing is due yet — no classes have been chosen.';
  const paying = method === 'online' ? 'online' : 'by check';
  return audience === 'school'
    ? `Due in full — they told us they are paying ${paying}.`
    : `Due in full — you told us you are paying ${paying}.`;
}

/**
 * Which instruction the emails write, once the deployment has had its say.
 *
 * A family may have chosen "online" on a site whose giving page was later
 * cleared — and an instruction pointing at an address that is not there is a
 * blank line where the one thing the email exists to say should be. So the
 * school's configuration can veto the answer, and never the other way round: it
 * cannot turn a stated check into an online payment.
 */
function methodOf(submission: ApplicationSubmission, payOnlineAt: string): PaymentMethod {
  return submission.paymentMethod === 'online' && payOnlineAt !== '' ? 'online' : 'check';
}

/**
 * The message the school receives (#32 AC 6).
 *
 * Everything #18 §11 says the school gets on submission: the application, the
 * selections with their units and prices, the Statement of Faith record, the
 * amount owed, the conversation flag, and the tally.
 *
 * The **conversation flag goes first**, above the family's name, because it is
 * the one line that changes what somebody does about this email — and an email
 * whose important line is at the bottom is an email that gets skimmed.
 *
 * `stored` is why this takes an option as well as the submission: when the
 * write failed, this email is the only copy of the application that exists, and
 * it has to say so in words somebody acts on.
 */
export function applicationNotification(
  submission: ApplicationSubmission,
  options: { to: string; from: string; payOnlineAt: string },
): Mail {
  const { values, cost, settings, flagged, reference } = submission;
  const lines: string[] = [];

  if (flagged) {
    lines.push(
      'CONVERSATION FLAG: somebody on this application answered "no" to one of the Statement ' +
        'of Faith questions, or wrote something they want to talk about. It is not a refusal — ' +
        'the family is asking to speak to you.',
      '',
    );
  }

  lines.push(`${values.familyName} has applied to ${SCHOOL_NAME}.`, '', `Email:  ${values.email}`);
  if (reference) lines.push(`Reference:  ${reference}`);

  lines.push('', 'WHO IS APPLYING, AND FOR WHAT', ...chosen(cost, settings));

  // The envelope line is the one the office acts on, so it names the amount an
  // envelope will actually contain (#149) — and since #221 that is the whole
  // total or nothing, never the deposits alone. Which of the two is what the
  // family *said*, not whether a giving-page address happens to be configured:
  // an office watching for an envelope the family never meant to send spends a
  // fortnight chasing it.
  const method = methodOf(submission, options.payOnlineAt);
  lines.push(
    '',
    'WHAT THEY OWE',
    ...invoice(cost, method, { audience: 'school' }),
    `  ${envelope(cost, method)}`,
    '',
    'THE STATEMENT OF FAITH',
    ...faithRecord(values),
  );

  if (values.objections.trim()) {
    lines.push('', 'What they said they want to talk about:', values.objections.trim());
  }

  lines.push('', 'THE CLASS TALLY, WITH THIS APPLICATION IN IT');
  const tally = tallyLines(submission.tally);
  lines.push(...(tally.length > 0 ? tally.map((line) => `  ${line}`) : ['  Nothing chosen yet.']));

  lines.push(
    '',
    reference
      ? 'This application is also saved on the website — it is on the Applications screen in the admin.'
      : 'WARNING: this application could NOT be saved on the website. This email is the only ' +
          'copy of it. The family has been told it did not go through and asked to send it ' +
          'again; reply to them, or copy this somewhere, before this message is lost.',
    '',
    `Sent from the application form on the ${SCHOOL_NAME} website.`,
  );

  return {
    to: options.to,
    from: options.from,
    subject: `${flagged ? 'Application (conversation flag) — ' : 'Application — '}${values.familyName}`,
    text: lines.join('\n'),
  };
}

/**
 * What an envelope will actually contain, in the office's words (#149, #221).
 *
 * The whole amount or nothing. It is not a field on `AmountOwed`, because what
 * a check covers is a fact about *this submission* — what the family said they
 * would do — and not about what they owe.
 *
 * "Nothing" rather than "$0", because an office reading `$0.00` beside
 * "envelope to expect" reads a line that says an envelope is coming.
 */
function envelope(cost: ApplicationCost, method: PaymentMethod): string {
  if (cost.total.total === 0) return 'Envelope to expect: nothing — they owe nothing yet.';
  return method === 'online'
    ? 'Envelope to expect: nothing — the family said they are paying online.'
    : `Envelope to expect: ${formatMoney(cost.total.total)} — the whole amount.`;
}

/**
 * Who is applying and for what, as every one of the three messages lists it.
 *
 * One writer, because the three are the same list read by different people and
 * a family that found their confirmation disagreed with what the school was
 * sent would have no way to tell which was right. `settings` is what turns it
 * into a priced list: with none — the family's own copies — it is the choices
 * alone, since a parent reads the totals a few lines further down and does not
 * need each class costed twice.
 *
 * A child with no name and no classes is skipped: a blank row on an
 * eight-row form is not a person to list.
 */
function chosen(cost: ApplicationCost, settings?: MoneySettings): string[] {
  const lines: string[] = [];
  for (const one of cost.perChild) {
    if (!one.child.name && one.offerings.length === 0) continue;
    lines.push(`  ${one.child.name || 'A child'}${one.child.age ? `, age ${one.child.age}` : ''}`);

    if (one.offerings.length === 0) {
      lines.push('    No classes chosen.');
      continue;
    }

    for (const offering of one.offerings) {
      const price = settings
        ? ` — ${formatMoney(unitPrice({ course: offering.course, unit: priceUnit(offering.unit) }, settings))}`
        : '';
      lines.push(`    ${offeringTitle(offering)}${price}`);
    }
  }
  return lines;
}

/**
 * The Statement of Faith record, as the school reads it.
 *
 * Only the cells that were answered. A household with no legal guardian left
 * that column alone, and printing "Legal guardian: not answered" three times
 * would put the loudest thing on the page where the quietest fact is.
 */
function faithRecord(values: ApplicationFields): string[] {
  const lines: string[] = [];
  for (const respondent of FAITH_RESPONDENTS) {
    const answers = FAITH_QUESTIONS.map((question) => ({
      question,
      answer: faithAnswer(values.faith, respondent, question.id),
    })).filter((one) => one.answer !== '');

    if (answers.length === 0) continue;
    lines.push(
      `  ${respondent}: ${answers
        .map((one) => `${one.question.id} — ${one.answer}`)
        .join(', ')}`,
    );
  }
  return lines.length > 0 ? lines : ['  Nobody answered any of the three questions.'];
}

/**
 * The message the family receives when it worked (#18 §13, send 4).
 *
 * The same three things the confirmation screen says — what they chose, what to
 * pay and how, and that a place is held when the payment arrives — because
 * the screen is closed within the minute and this is the copy they keep.
 *
 * **Warm, invoice, warm** (#221). The opening line and the closing are the
 * school's voice, and the middle is a table: the money used to be three
 * paragraphs of prose adding up to a number the email never wrote down, and a
 * family scanning for "how much, and how do I pay it" had to assemble it
 * themselves.
 *
 * That "how" is one instruction and never two — the giving page and the amount
 * to enter, or the address and the whole total, decided by {@link methodOf}
 * from what the family said. A page offering a link beside an email demanding a
 * check for the same money is the school contradicting itself in writing, and
 * the email is the half that outlives the screen.
 *
 * **No response-time promise**, consistent with the inquiry's confirmation and
 * with #9: who answers an application and how fast is the school's own
 * operational question and this email must not invent an answer to it.
 */
export function applicationConfirmation(
  submission: ApplicationSubmission,
  options: { from: string; postTo: string; payOnlineAt: string },
): Mail {
  const { values, cost, reference } = submission;
  const total = cost.total.total;
  const method = methodOf(submission, options.payOnlineAt);

  const lines = [
    `Thank you — we have your application, ${values.familyName}.`,
    '',
    'What you chose:',
    ...chosen(cost),
    '',
    'What you owe:',
    '',
    // The reference rides inside the invoice rather than in a footer, because
    // the instruction below asks the family to type it into the giving page —
    // and an instruction naming a code they have not read yet sends them
    // hunting for it (#218).
    ...invoice(cost, method, { reference }),
  ];

  if (total === 0) {
    // Nothing is owed, so there is no instruction to give: "pay $0 online" and
    // "post a check for $0.00" are both an instruction to do nothing, written
    // as though it were something.
    lines.push(
      '',
      'There is nothing to pay until you have chosen classes. Tell us what you would like and ' +
        'we will send you the figures.',
    );
  } else if (method === 'online') {
    lines.push(
      '',
      `Please pay the whole ${formatMoney(total)} in one payment through the church’s giving page:`,
      '',
      `  ${options.payOnlineAt}`,
      '',
      'A payment through the giving page does not reach us attached to this application, so we ' +
        'match the two up ourselves' +
        (reference
          ? ` — please put your reference, ${reference}, in the note when you pay, and there is ` +
            'nothing further for you to send us about it.'
          : ' — there is nothing further for you to send us about it.'),
      '',
      'A place is held for each class as soon as your payment reaches us.',
    );
  } else {
    lines.push(
      '',
      `Please post a check for ${formatMoney(total)}, made out to ${SCHOOL_NAME}, to:`,
      '',
      options.postTo,
      '',
      'A place is held for each class as soon as your check reaches us.',
    );
  }

  if (submission.flagged) {
    lines.push(
      '',
      'You told us there is something you would like to talk about. That does not hold your ' +
        'application up — we will be in touch about it.',
    );
  }

  return {
    to: values.email,
    from: options.from,
    subject: `${SCHOOL_NAME} — we have your application`,
    text: lines.join('\n'),
  };
}

/**
 * The message the family receives when the site could not take it (#32 AC 4).
 *
 * This is the whole remedy for a refused submission. The family believes they
 * have applied — they filled in a long form and pressed a button — and without
 * this they find out in September. So it says plainly that it did not go
 * through, gives the address to send it to instead, and carries what they chose
 * so retyping it is a copy rather than a memory test.
 */
export function refusedSubmissionNotice(
  submission: ApplicationSubmission,
  options: { from: string; schoolEmail: string; site: string },
): Mail {
  const { values, cost } = submission;
  const at = new URL(APPLICATION_PATH, options.site).toString();

  const lines = [
    `${values.familyName} — your application to ${SCHOOL_NAME} did not reach us.`,
    '',
    'Something went wrong on our website while it was being saved. Nothing you did caused it, ' +
      'and nothing has been lost from your side — but we do not have your application, so ' +
      'please do one of these two things:',
    '',
    `  Send it again:  ${at}`,
    `  Or reply to this email, or write to ${options.schoolEmail}, and we will enter it ourselves.`,
    '',
    'This is what you had chosen, so you do not have to remember it:',
    ...chosen(cost),
  ];

  lines.push('', 'We are sorry — this is our fault and not yours.');

  return {
    to: values.email,
    from: options.from,
    subject: `${SCHOOL_NAME} — your application did not go through`,
    text: lines.join('\n'),
  };
}

/** What became of the two sends, in the shape the row records. */
export type ApplicationDelivery = {
  /** Whether the school was told. */
  notified: boolean;
  notificationError?: string;
  /** Whether the family was written to — a confirmation, or a refusal notice. */
  confirmed: boolean;
  confirmationError?: string;
  /** Which of the two the family got, so the caller can say so honestly. */
  familyWasTold: 'confirmation' | 'refusal';
};

/**
 * Tell the school, then tell the family.
 *
 * The two are independent, as they are on the inquiry (#25 AC 2): a refused
 * confirmation must not hide the notification, and neither may throw. The
 * application row is already written — or already lost — before this runs, and
 * nothing here can change that.
 *
 * The school is told **whether or not** the write succeeded, and that is the
 * point of the `stored` line inside the notification: a lost application that
 * nobody was emailed about is the failure this whole path exists to prevent.
 */
export async function deliverApplication(
  submission: ApplicationSubmission,
  options: {
    sender: Sender | undefined;
    /** The settings list, never a hard-coded address (#32 AC 6). */
    to: readonly string[];
    from: string;
    /** Where a check is posted — the school's own address, from its details. */
    postTo: string;
    /**
     * Where registration and tuition are paid online, or `''` when nowhere
     * (#149, #187).
     *
     * The school's own setting, the same row the apply page reads, so the two
     * cannot drift and the school can move the link without a deploy.
     */
    payOnlineAt: string;
    /** The address a family is given when nothing worked. */
    schoolEmail: string;
    /** The absolute origin an emailed link is built against. */
    site: string;
  },
): Promise<ApplicationDelivery> {
  const notification = await sendAll(
    options.sender,
    options.to.map((address) =>
      applicationNotification(submission, {
        to: address,
        from: options.from,
        payOnlineAt: options.payOnlineAt,
      }),
    ),
  );

  const refused = submission.reference === null;
  const toFamily = refused
    ? refusedSubmissionNotice(submission, {
        from: options.from,
        schoolEmail: options.schoolEmail,
        site: options.site,
      })
    : applicationConfirmation(submission, {
        from: options.from,
        postTo: options.postTo,
        payOnlineAt: options.payOnlineAt,
      });

  const family = await sendAll(options.sender, [toFamily]);

  return {
    notified: notification.sent,
    notificationError: notification.error,
    confirmed: family.sent,
    confirmationError: family.error,
    familyWasTold: refused ? 'refusal' : 'confirmation',
  };
}
