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

import { formatAddress } from '../address.js';
import { sendAll, type Mail, type Sender } from '../backup/monthly.js';
import {
  feesNamed,
  paymentLines,
  subtotalOf,
  type FeePaymentLinks,
  type PaymentLine,
} from '../money/payment-lines.js';
import { formatMoney, type MoneySettings } from '../money/settings.js';
import { SCHOOL_NAME } from '../site.js';
import { AGREEMENT_DOCUMENTS, agreementLabel } from './agreements.js';
import {
  APPLICATION_PATH,
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  faithAnswer,
  offeringPrice,
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
 * A family may have chosen "online" on a site whose giving pages were later
 * cleared — and an instruction pointing at an address that is not there is a
 * blank line where the one thing the email exists to say should be. So the
 * school's configuration can veto the answer, and never the other way round: it
 * cannot turn a stated check into an online payment.
 *
 * **One line left with a link is enough** to keep the answer (#303). A fee
 * whose own box is empty falls back to a check on its own, inside an otherwise
 * online instruction; only a family with nowhere at all to pay is moved.
 */
function methodOf(submission: ApplicationSubmission, payments: readonly PaymentLine[]): PaymentMethod {
  const anyOnline = payments.some((line) => !line.byCheck);
  return submission.paymentMethod === 'online' && anyOnline ? 'online' : 'check';
}

/**
 * What to pay and where, as both emails read it (#301, #303).
 *
 * The same description the application page renders from, so the screen and the
 * copy that outlives it cannot word one payment two ways. No template is passed:
 * an email has never put an amount on a link and this is not the ticket that
 * gives it one, so a line's link is the campaign the office configured.
 */
function paymentsFor(
  submission: ApplicationSubmission,
  payLinks: FeePaymentLinks,
): PaymentLine[] {
  return paymentLines({
    owed: submission.cost.total,
    links: payLinks,
    reference: submission.reference,
  });
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
  options: { to: string; from: string; payLinks: FeePaymentLinks },
): Mail {
  const { values, cost, settings, flagged, reference } = submission;
  const lines: string[] = [];

  if (flagged) {
    lines.push(
      'CONVERSATION FLAG: somebody on this application answered "no" to one of the Statement ' +
        'of Faith questions, said their family does not agree to one of the documents, or ' +
        'wrote something they want to talk about. It is not a refusal — the family is asking ' +
        'to speak to you.',
      '',
    );
  }

  lines.push(`${values.familyName} has applied to ${SCHOOL_NAME}.`, '', `Email:  ${values.email}`);
  /*
   * The two ways to reach this household, in the body (#312, story 4). The
   * office forwards these emails, and somebody acting from their inbox should
   * be able to dial the family or address an envelope without opening the
   * admin. Both are omitted rather than printed empty on an application from
   * before #312 — a labelled line with nothing after it reads as a fault.
   */
  if (values.phone) lines.push(`Phone:  ${values.phone}`);
  if (reference) lines.push(`Reference:  ${reference}`);

  const posted = formatAddress(values.address);
  if (posted) lines.push('', 'Where to post to:', ...posted.split('\n').map((line) => `  ${line}`));

  lines.push('', 'WHO IS APPLYING, AND FOR WHAT', ...chosen(cost, settings));

  // The envelope line is the one the office acts on, so it names the amount an
  // envelope will actually contain (#149) — and since #221 that is the whole
  // total or nothing, never the deposits alone. Which of the two is what the
  // family *said*, not whether a giving-page address happens to be configured:
  // an office watching for an envelope the family never meant to send spends a
  // fortnight chasing it.
  const payments = paymentsFor(submission, options.payLinks);
  const method = methodOf(submission, payments);
  lines.push(
    '',
    'WHAT THEY OWE',
    ...invoice(cost, method, { audience: 'school' }),
    `  ${envelope(cost, method, payments)}`,
    '',
    'THE STATEMENT OF FAITH',
    ...faithRecord(values),
  );

  const agreements = agreementRecord(values);
  if (agreements.length > 0) lines.push('', 'THE TWO AGREEMENTS', ...agreements);

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
function envelope(
  cost: ApplicationCost,
  method: PaymentMethod,
  payments: readonly PaymentLine[],
): string {
  if (cost.total.total === 0) return 'Envelope to expect: nothing — they owe nothing yet.';
  if (method === 'check') {
    return `Envelope to expect: ${formatMoney(cost.total.total)} — the whole amount.`;
  }

  /*
   * A family paying online can still be posting part of it (#303): a fee whose
   * campaign is not configured falls back to a check on its own. The office is
   * told the figure the envelope will contain and which fees make it up, so a
   * part payment does not read as a family who paid short.
   */
  const posting = payments.filter((line) => line.byCheck);
  if (posting.length === 0) {
    return 'Envelope to expect: nothing — the family said they are paying online.';
  }
  return (
    `Envelope to expect: ${formatMoney(subtotalOf(posting))} — they said they are paying online, ` +
    `but ${feesNamed(posting)} ${posting.length === 1 ? 'has' : 'have'} no giving page set up, so ` +
    'that part comes by check.'
  );
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
      const price = settings ? ` — ${formatMoney(offeringPrice(offering, settings))}` : '';
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
 * What the family said about the two documents, as the office reads it (#255).
 *
 * `agreementLabel` writes the whole sentence — "Family agrees" — because a bare
 * "No" beside a document title in a scanned email says nothing about which way
 * it points, and this email is scanned.
 *
 * Only the documents that were *answered*, and so nothing at all for a school
 * that has published neither: an unasked question printed as "not answered"
 * reads as a family who skipped something. The admin screen lists both either
 * way, because there the pair is a record rather than a paragraph.
 */
function agreementRecord(values: ApplicationFields): string[] {
  return AGREEMENT_DOCUMENTS.flatMap((document) => {
    const agreement = values.agreements[document.slug];
    if (!agreement || agreement.answer === '') return [];
    const version = agreement.version === null ? '' : ` (version ${agreement.version})`;
    return [`  ${document.title}: ${agreementLabel(agreement.answer)}${version}`];
  });
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
  options: { from: string; postTo: string; payLinks: FeePaymentLinks },
): Mail {
  const { values, cost, reference } = submission;
  const payments = paymentsFor(submission, options.payLinks);
  const method = methodOf(submission, payments);
  const total = cost.total.total;
  /*
   * What is paid where, once the family's own answer has been applied to it
   * (#303). Saying check moves every line onto the check, because the question
   * is asked once for the whole application and never once per fee; saying
   * online leaves each line as the money module described it, so a fee with no
   * campaign configured is posted while the fee beside it is not.
   */
  const online = method === 'online' ? payments.filter((line) => !line.byCheck) : [];
  const posting = method === 'online' ? payments.filter((line) => line.byCheck) : payments;

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
  } else {
    /*
     * One payment per fee, each into the campaign the school keeps for it
     * (#303, ADR-0023) — the same lines, in the same order, with the same
     * amounts the confirmation screen showed a minute ago.
     *
     * The reference is asked for **per payment**, because it now has to be
     * typed more than once and a family reading quickly will assume once is
     * enough. It is the box as Vanco labels it, and the box the giving page
     * cannot fill in for them (#265, ADR-0016): whatever else a link carries,
     * the memo is hand-typed, and it is the only thing joining a payment to
     * this application.
     */
    if (online.length > 0) {
      lines.push(
        '',
        online.length === 1
          ? 'Please pay this through the school’s giving page:'
          : 'Please make these payments through the school’s giving pages — one for each fee, ' +
            'because they are kept apart on our side:',
      );
      for (const line of online) {
        lines.push('', `  ${line.label} — ${formatMoney(line.subtotal)}`, `  ${line.link!.href}`);
      }
      lines.push(
        '',
        'A payment through the giving page does not reach us attached to this application, so we ' +
          'match the two up ourselves' +
          (reference
            ? ` — please type your reference, ${reference}, into the Memo box of each payment, ` +
              'and there is nothing further for you to send us about it.'
            : ' — there is nothing further for you to send us about it.'),
      );
    }

    /*
     * The check, for whatever is not being paid online — the whole total for a
     * family who said check, and one fee's share for a family whose site has a
     * campaign missing. One amount and one envelope either way: splitting the
     * fees is the school's problem and not theirs.
     */
    if (posting.length > 0) {
      const amount = formatMoney(subtotalOf(posting));
      lines.push(
        '',
        online.length > 0
          ? `And please post a check for ${feesNamed(posting)} — ${amount}, made out to ` +
            `${SCHOOL_NAME}, to:`
          : `Please post a check for ${amount}, made out to ${SCHOOL_NAME}, to:`,
        '',
        options.postTo,
      );
    }

    lines.push(
      '',
      online.length > 0
        ? 'A place is held for each class as soon as your payment reaches us.'
        : 'A place is held for each class as soon as your check reaches us.',
    );
  }

  if (submission.flagged) {
    lines.push(
      '',
      'You told us there is something you would like to talk about. That does not hold your ' +
        'application up — we will be in touch about it.',
    );
  }

  /*
   * What we hold, said back (#312). An application is never edited, so a family
   * who mistyped a digit or a house number has one correction route: seeing it
   * here and writing in. Omitted where there is nothing to say back, which is
   * every application from before the fields existed.
   */
  const contact = formatAddress(values.address);
  if (values.phone || contact) {
    lines.push('', 'How we will reach you:');
    if (values.phone) lines.push('', `  ${values.phone}`);
    if (contact) lines.push('', ...contact.split('\n').map((line) => `  ${line}`));
    lines.push('', 'If any of that is wrong, write back and we will correct it.');
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
     * Where each fee is paid online, or `''` for a fee paid nowhere (#149,
     * #187, #303).
     *
     * The school's own settings, the same row the apply page reads, so the two
     * cannot drift and the school can move a campaign without a deploy.
     */
    payLinks: FeePaymentLinks;
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
        payLinks: options.payLinks,
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
        payLinks: options.payLinks,
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
