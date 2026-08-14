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
  /** The row's id, or null when the write failed and this is a refusal. */
  reference: string | null;
};

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
  // envelope will actually contain (#149). Money paid online arrives through
  // Vanco unattached to this application and the office matches the two up by
  // hand — which it cannot do if this email calls the whole of it a check.
  // "Offered", not "paid": Vanco tells the site nothing, and a line claiming a
  // payment nobody checked is worse than no line.
  const online = options.payOnlineAt !== '';
  const posting = postedByCheck(cost, online);
  lines.push(
    '',
    'WHAT THEY OWE',
    `  Registration:           ${formatMoney(cost.total.registration)}`,
    `  Deposits:               ${formatMoney(cost.total.deposits)}`,
    `  Tuition:                ${formatMoney(cost.total.tuitionDue)}`,
    // No envelope to wait for is a fact the office acts on too, and printing
    // "$0.00" beside "check they are posting" is a line that reads as one.
    !online
      ? `  Check they are posting: ${formatMoney(posting)} — all of it`
      : posting === 0
        ? '  Check they are posting: nothing — the registration and tuition were offered online'
        : `  Check they are posting: ${formatMoney(posting)} — the deposits only, the registration ` +
          'and tuition were offered online',
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
 * What an envelope will actually contain (#149, #187).
 *
 * Written once because the school's copy and the family's copy have to name the
 * same figure: an office told to expect $865 and a family told to post $100 is
 * the same submission saying two things. It is not a field on `AmountOwed`,
 * because what a cheque covers is a fact about *this deployment* — whether the
 * office has pasted a Vanco page in — and not about what a family owes.
 */
function postedByCheck(cost: ApplicationCost, online: boolean): number {
  return online ? cost.total.deposits : cost.total.total;
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
 * pay and how, and that a place is held when the check arrives — because
 * the screen is closed within the minute and this is the copy they keep.
 *
 * That "how" is the page's own question asked once more (#149): the school has
 * an online address or it has not, and the answer has to be the same one the
 * family was just shown. A page offering a link beside an email demanding a
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
  const lines = [
    `Thank you — we have your application, ${values.familyName}.`,
    '',
    'What you chose:',
    ...chosen(cost),
  ];

  const online = options.payOnlineAt !== '';
  // A family who has chosen no classes yet owes no deposits, and "post a check
  // for $0.00" is an instruction to mail an empty envelope — so the address is
  // not printed at all rather than printed under a payment they do not owe.
  // Reachable only where the payment link is set: without one a check covers
  // everything, and there is always a registration fee to post one for.
  const posting = postedByCheck(cost, online);

  /** What to post, and where — the one instruction, written once. */
  const check = (asking: string): string[] => [
    '',
    asking,
    '',
    options.postTo,
    '',
    'A place is held for each class as soon as your check reaches us.',
  ];

  if (online) {
    lines.push(
      '',
      `The registration — ${formatMoney(cost.total.registration)} — and the tuition — ` +
        `${formatMoney(cost.total.tuitionDue)} at today’s rates — are paid online, in one ` +
        'payment, through the church’s giving page:',
      '',
      `  ${options.payOnlineAt}`,
    );

    if (posting > 0) {
      lines.push(
        ...check(
          `The deposits — ${formatMoney(posting)} — are paid by check, made out to ${SCHOOL_NAME}, to:`,
        ),
      );
    }

    lines.push(
      '',
      'A payment through the giving page does not reach us attached to this application, so we ' +
        'match the two up ourselves — there is nothing further for you to send us about it.',
    );
  } else {
    lines.push(
      ...check(
        `Please post a check for ${formatMoney(posting)} — ${formatMoney(cost.total.registration)} ` +
          `in registration, ${formatMoney(cost.total.deposits)} in deposits and ` +
          `${formatMoney(cost.total.tuitionDue)} in tuition at today’s rates — made out to ` +
          `${SCHOOL_NAME}, to:`,
      ),
    );
  }

  if (submission.flagged) {
    lines.push(
      '',
      'You told us there is something you would like to talk about. That does not hold your ' +
        'application up — we will be in touch about it.',
    );
  }

  if (reference) lines.push('', `Your reference is ${reference}.`);

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
