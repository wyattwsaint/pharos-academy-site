/**
 * What a family pays, and where each part of it is paid (#301, #303, #300).
 *
 * One description of the payment, read by all three surfaces that describe it:
 * the application page while a family is still filling it in, the same page
 * once it has been sent, and the confirmation email they keep. Before this
 * module the page worked it out in its own markup and the email worked it out
 * again in its own prose, which is two answers to one question — and #303
 * splits the payment in two, which would have made it four.
 *
 * **The arithmetic is not here.** A line composes figures `live.ts` has already
 * totalled and a link `giving-link.ts` has already checked; nothing below adds
 * anything up or decides where a link may point.
 *
 * Two lines, because the school has two campaigns to be paid into (ADR-0023):
 * the registration fee, and the deposits and the tuition together. Deposits and
 * tuition share a campaign on purpose — they are both what a family owes for
 * the classes, and the deposits come off the tuition, which is a relationship
 * the page spends a paragraph holding together. The study hall fee has a
 * campaign of its own and no line: the site has never charged it here.
 */

import { givingLink, type GivingLink } from './giving-link.js';
import type { AmountOwed } from './live.js';

/** Which fee a line is, for a surface that needs to name one without matching on its words. */
export type PaymentLineKey = 'registration' | 'classes';

/**
 * Where each fee is paid, as the school details hold it.
 *
 * Named after the fees rather than after the campaigns, because a campaign id
 * is what the office pastes in and not what the site reasons about. Empty means
 * that fee has no online link — see `byCheck` below.
 *
 * The study-hall link is not here: nothing renders a study-hall line, and a
 * field in this type would be a fee this module could be asked to charge.
 */
export type FeePaymentLinks = {
  registrationFees: string;
  classFees: string;
};

/** One thing a family pays, and everything a surface needs to describe it. */
export type PaymentLine = {
  /** Which fee this is. */
  key: PaymentLineKey;
  /** What this part of the payment is called, in the family's words. */
  label: string;
  /**
   * The same thing named inside a sentence — "the registration", "the classes".
   *
   * Carried rather than lower-cased from `label` at each call site, because
   * four surfaces write it into running prose and the one that lower-cased it
   * itself came to word the list differently from the two that did not. Naming
   * a fee is exactly the thing this module exists to have one answer to.
   */
  noun: string;
  /** What this line comes to. */
  subtotal: number;
  /**
   * Where it is paid online, or null when no link is configured for it.
   *
   * A `GivingLink` rather than an address, because the page's claim about what
   * a family is about to see is written from `carriesAmount`, which a bare href
   * loses.
   */
  link: GivingLink | null;
  /**
   * Whether this line falls back to the check instruction — which is exactly
   * when it has no link. Reported rather than left to be inferred from `link`,
   * because it is the branch every surface renders on and a null nobody
   * remembers to test for renders a button pointing nowhere.
   *
   * **Per fee, never for all of them.** A half-finished admin save degrades the
   * one fee whose box is empty; the fee beside it keeps its button.
   */
  byCheck: boolean;
};

/** What is needed to describe one payment. */
export type PaymentLinesOptions = {
  /**
   * What the family owes, already totalled — the figures this composes.
   *
   * The whole of `AmountOwed` rather than a number per line, so that the split
   * reads the same figures the totals list above it was printed from.
   */
  owed: AmountOwed;
  /** The configured link for each fee. */
  links: FeePaymentLinks;
  /**
   * The configured link template, which is empty far more often than not.
   *
   * At most one line can ever use it: a template is refused at save unless it
   * is one configured campaign with figures on it, so every other line finds it
   * is not their campaign and falls back to their plain address. That is the
   * behaviour, not an oversight — putting an amount on all three links means
   * restructuring the template, and production has none.
   */
  template?: string;
  /** The application's reference, or null before the row is written. */
  reference: string | null;
  /**
   * Whether a line whose subtotal is zero is still returned. Off by default.
   *
   * Off is the rule that matters: a family who ticked no classes is not offered
   * a button that opens a page to pay nothing. On is for the stage where the
   * figures are still moving — a family filling the form in watches every
   * figure change as they tick, and a button that appears and disappears
   * underneath them is the page rearranging itself while they read it. There
   * the lines are the *shape* of what they will owe, and the shape does not
   * depend on what they have ticked so far.
   */
  keepEmpty?: boolean;
};

/**
 * The fees, in the order a family pays them, and everything that differs
 * between them.
 *
 * A table rather than a pair of branches inside the loop: which figure a fee
 * takes and which box its address comes out of are two facts about the *fee*,
 * and holding them here is what makes the study hall — when the school settles
 * its figure (#51) — one row rather than three edits scattered down the
 * function.
 *
 * Registration first: it matches the order of the totals list already on the
 * page, and it is the one every applicant owes.
 */
const FEES = [
  {
    key: 'registration',
    label: 'Registration',
    noun: 'the registration',
    subtotal: (owed: AmountOwed) => owed.registration,
    url: (links: FeePaymentLinks) => links.registrationFees,
  },
  {
    key: 'classes',
    label: 'Classes',
    noun: 'the classes',
    subtotal: (owed: AmountOwed) => owed.classes,
    url: (links: FeePaymentLinks) => links.classFees,
  },
] as const satisfies readonly {
  key: PaymentLineKey;
  label: string;
  noun: string;
  subtotal: (owed: AmountOwed) => number;
  url: (links: FeePaymentLinks) => string;
}[];

/**
 * The payment, in the order a family pays it.
 *
 * Every rule the page and the email would otherwise each have to remember —
 * the ordering, the zero, the per-fee fallback — is here, so that the screen a
 * family reads and the copy that outlives it cannot come to word one payment
 * two ways.
 */
export function paymentLines(options: PaymentLinesOptions): PaymentLine[] {
  const { owed, links, template = '', reference, keepEmpty = false } = options;

  const lines: PaymentLine[] = [];
  for (const fee of FEES) {
    const subtotal = fee.subtotal(owed);
    if (subtotal === 0 && !keepEmpty) continue;

    const payOnlineUrl = fee.url(links);

    // No configured link is the one thing this module decides: `givingLink` is
    // handed an empty address happily and returns an empty href, which is a
    // button pointing at the page it is on.
    const link =
      payOnlineUrl === ''
        ? null
        : givingLink({ payOnlineUrl, template, reference, amount: subtotal });

    lines.push({
      key: fee.key,
      label: fee.label,
      noun: fee.noun,
      subtotal,
      link,
      byCheck: link === null,
    });
  }

  return lines;
}

/** What a set of lines comes to — the figure one envelope or one page carries. */
export function subtotalOf(lines: readonly PaymentLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0);
}

/**
 * The fees named as a family reads them — "the registration and the classes".
 *
 * One writer, because the screen and both emails each have a sentence naming
 * whichever fees are coming by check, and three of them wording that list
 * their own way is the drift this module exists to prevent.
 */
export function feesNamed(lines: readonly PaymentLine[]): string {
  const nouns = lines.map((line) => line.noun);
  if (nouns.length <= 1) return nouns[0] ?? '';
  return `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
}
