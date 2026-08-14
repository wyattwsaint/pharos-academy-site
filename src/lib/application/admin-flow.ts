/**
 * What the school can do to an application from the admin (#32).
 *
 * Two forms on the screen, and they post to two different verbs, because the
 * whole ticket is that applied and paid are separate: a screen with one
 * "status" dropdown holding both would undo in the interface exactly what the
 * store keeps apart. So there is a move for the application and a move for the
 * money, and neither posts the other's field.
 *
 * Everything here is parse-then-apply, the shape `admin/users.ts` set: a form
 * that does not say what it wants is an outcome rather than a throw, and the
 * page stays a page.
 */

import type { Db } from '../db/client.js';
import {
  APPLICATION_EVENTS,
  PAYMENT_EVENTS,
  type ApplicationEvent,
  type PaymentEvent,
} from './lifecycle.js';
import { paymentOutcome, stateOutcome, type ApplicationOutcomeCode } from './outcome.js';
import { moveApplication, moveApplicationPayment } from './store.js';

/** One thing the school asked for, on one of the two axes. */
export type ApplicationAction =
  | { axis: 'application'; id: string; event: ApplicationEvent }
  | { axis: 'payment'; id: string; event: PaymentEvent };

/**
 * Read the posted form, or null when it is not one of the two.
 *
 * The event is checked against the closed list rather than trusted, because
 * this is a form post from a browser and the store's own refusal is the last
 * line of defence rather than the first.
 */
export function parseApplicationAction(form: FormData): ApplicationAction | null {
  const id = String(form.get('id') ?? '').trim();
  const event = String(form.get('event') ?? '').trim();
  if (!id || !event) return null;

  if (APPLICATION_EVENTS.includes(event as ApplicationEvent)) {
    return { axis: 'application', id, event: event as ApplicationEvent };
  }
  if (PAYMENT_EVENTS.includes(event as PaymentEvent)) {
    return { axis: 'payment', id, event: event as PaymentEvent };
  }
  return null;
}

/**
 * Do it, and name what happened.
 *
 * A code rather than a sentence, because the answer travels back through a
 * redirect (#201) and `outcome.ts` is where the wording lives. A refused move
 * is not an error and is not reported as one: it means the application had
 * already moved — somebody else's click, or the same person's second one — and
 * the code says so rather than blaming anybody.
 */
export async function applyApplicationAction(
  db: Db,
  action: ApplicationAction,
  now = new Date(),
): Promise<ApplicationOutcomeCode> {
  if (action.axis === 'application') {
    const state = await moveApplication(db, action.id, action.event);
    return state ? stateOutcome(state) : 'state-unmoved';
  }

  const payment = await moveApplicationPayment(db, action.id, action.event, now);
  return payment ? paymentOutcome(payment.mode, payment.status) : 'payment-unmoved';
}
