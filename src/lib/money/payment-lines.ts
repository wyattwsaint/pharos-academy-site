/**
 * What a family pays, and where each part of it is paid (#301, #300).
 *
 * One description of the payment, read by all three surfaces that describe it:
 * the application page while a family is still filling it in, the same page
 * once it has been sent, and the confirmation email they keep. Before this
 * module the page worked it out in its own markup and the email worked it out
 * again in its own prose, which is two answers to one question — and #300
 * splits the payment in two, which would have made it four.
 *
 * **The arithmetic is not here.** A line composes figures `live.ts` has already
 * totalled and a link `giving-link.ts` has already checked; nothing below adds
 * anything up or decides where a link may point.
 *
 * Today there is exactly **one line — all of it**, because that is what the
 * site charges: one payment, upfront, for the registration, the deposits and
 * the tuition together (ADR-0017). #300 turns it into registration and classes
 * paid into their own Vanco campaigns, and the ordering and the per-fee
 * fallback below are where that lands.
 */

import { givingLink, type GivingLink } from './giving-link.js';
import type { AmountOwed } from './live.js';

/** The label on the one line there is, and the words the page already uses. */
export const ALL_OF_IT = 'All of it';

/** One thing a family pays, and everything a surface needs to describe it. */
export type PaymentLine = {
  /** What this part of the payment is called, in the family's words. */
  label: string;
  /** What this line comes to. */
  subtotal: number;
  /**
   * Where it is paid online, or null when no link is configured for it.
   *
   * A `GivingLink` rather than an address, because the page's claim about what
   * a family is about to see is written from `carriesAmount` and the browser's
   * live figures follow `pattern` — both of which a bare href loses.
   */
  link: GivingLink | null;
  /**
   * Whether this line falls back to the check instruction — which is exactly
   * when it has no link. Reported rather than left to be inferred from `link`,
   * because it is the branch every surface renders on and a null nobody
   * remembers to test for renders a button pointing nowhere.
   */
  byCheck: boolean;
};

/** What is needed to describe one payment. */
export type PaymentLinesOptions = {
  /**
   * What the family owes, already totalled — the figures this composes.
   *
   * The whole of `AmountOwed` rather than one number, so that the split in
   * #300 can take registration and classes apart without changing what a
   * caller hands in.
   */
  owed: AmountOwed;
  /** The configured online payment link. Empty means there is none. */
  payOnlineUrl: string;
  /** The configured link template, which is empty far more often than not. */
  template?: string;
  /** The application's reference, or null before the row is written. */
  reference: string | null;
};

/**
 * The payment, in the order a family pays it.
 *
 * **A line at zero is still a line.** The page shows a family who has ticked
 * nothing what they would owe — $0.00, beside the same button — and hiding the
 * section the moment the total is zero would be a copy change this prefactor
 * has no business making. #300 introduces the hide-at-zero rule with the second
 * line it exists for, where a class-fee button opening a page to pay nothing is
 * a real thing to prevent.
 */
export function paymentLines(options: PaymentLinesOptions): PaymentLine[] {
  const { owed, payOnlineUrl, template = '', reference } = options;

  // No configured link is the one thing this module decides: `givingLink` is
  // handed an empty address happily and returns an empty href, which is a
  // button pointing at the page it is on.
  const link =
    payOnlineUrl === ''
      ? null
      : givingLink({ payOnlineUrl, template, reference, amount: owed.total });

  return [{ label: ALL_OF_IT, subtotal: owed.total, link, byCheck: link === null }];
}
