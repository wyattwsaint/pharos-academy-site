/**
 * What became of an action, carried in the URL rather than rendered (#201).
 *
 * The two rows of buttons post and then redirect, so the outcome has to survive
 * a round trip through the query string. What travels is a **code, not a
 * sentence**: a message in the URL is a message anybody can rewrite, and a
 * hand-made link that made the school's own screen say "This application is now
 * enrolled" about a family nobody enrolled is the one lie this screen cannot
 * afford. The code names a fact the store already wrote; the wording is decided
 * here, from that fact, exactly as it was when the page rendered it inline.
 *
 * Unrecognised is no banner rather than a complaint about the URL — a stale
 * bookmark is not something the office did.
 */

import type { Banner } from '../admin/banner.js';
import {
  APPLICATION_STATE_LABELS,
  APPLICATION_STATES,
  PAYMENT_MODES,
  RECORDED_PAYMENT_STATUSES,
  paymentStatusLabel,
  type ApplicationState,
  type PaymentMode,
  type RecordedPaymentStatus,
} from './lifecycle.js';

/**
 * Every code the screen may redirect with.
 *
 * The two moved shapes carry where the row landed, because the sentence the
 * office reads is about the destination and not about the button. The two
 * unmoved ones carry no destination — there isn't one — and `unreadable` is the
 * post that never named an application at all.
 */
export type ApplicationOutcomeCode =
  | `state-${ApplicationState}`
  | `payment-${PaymentMode}-${RecordedPaymentStatus}`
  | 'state-unmoved'
  | 'payment-unmoved'
  | 'unreadable';

/** Where the application itself landed. */
export function stateOutcome(state: ApplicationState): ApplicationOutcomeCode {
  return `state-${state}`;
}

/** Where the money side landed, in the mode it landed in. */
export function paymentOutcome(
  mode: PaymentMode,
  status: RecordedPaymentStatus,
): ApplicationOutcomeCode {
  return `payment-${mode}-${status}`;
}

const UNMOVED_STATE: Banner = {
  ok: false,
  message:
    'Nothing changed — this application is not somewhere that move is available from. ' +
    'It may already have moved.',
};

const UNMOVED_PAYMENT: Banner = {
  ok: false,
  message:
    'Nothing changed — the money side already reads that, or this payment cannot make ' +
    'that move. It may already have moved.',
};

const UNREADABLE: Banner = {
  ok: false,
  message: 'Nothing happened — that form did not say what it wanted.',
};

const isState = (value: string): value is ApplicationState =>
  (APPLICATION_STATES as readonly string[]).includes(value);
const isMode = (value: string): value is PaymentMode =>
  (PAYMENT_MODES as readonly string[]).includes(value);
const isRecordedStatus = (value: string): value is RecordedPaymentStatus =>
  (RECORDED_PAYMENT_STATUSES as readonly string[]).includes(value);

/**
 * What `?outcome=` says, in the school's own words.
 *
 * Every branch checks the parts against the closed lists rather than trusting
 * them, because this is a value a browser handed back: `overdue` is refused
 * here for the same reason no writer can produce it (ADR-0008), so a URL cannot
 * announce a status the store has no way to hold.
 */
export function applicationOutcome(code: string | null): Banner | null {
  if (code === null) return null;
  if (code === 'state-unmoved') return UNMOVED_STATE;
  if (code === 'payment-unmoved') return UNMOVED_PAYMENT;
  if (code === 'unreadable') return UNREADABLE;

  const parts = code.split('-');
  if (parts[0] === 'state' && parts.length === 2 && isState(parts[1])) {
    return {
      ok: true,
      message: `This application is now ${APPLICATION_STATE_LABELS[parts[1]].toLowerCase()}.`,
    };
  }
  if (parts[0] === 'payment' && parts.length === 3 && isMode(parts[1]) && isRecordedStatus(parts[2])) {
    return {
      ok: true,
      message: `The money side now reads ${paymentStatusLabel(parts[1], parts[2]).toLowerCase()}.`,
    };
  }
  return null;
}
