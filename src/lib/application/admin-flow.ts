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
 * that does not say what it wants is a banner rather than a throw, and the page
 * stays a page.
 */

import type { Banner } from '../admin/banner.js';
import type { Db } from '../db/client.js';
import {
  APPLICATION_EVENTS,
  APPLICATION_STATE_LABELS,
  PAYMENT_EVENTS,
  paymentStatusLabel,
  type ApplicationEvent,
  type PaymentEvent,
} from './lifecycle.js';
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
 * Do it, and say what happened in the school's own words.
 *
 * A refused move is not an error and is not reported as one: it means the
 * application had already moved — somebody else's click, or the same person's
 * second one — and the honest banner says so rather than blaming anybody.
 */
export async function applyApplicationAction(
  db: Db,
  action: ApplicationAction,
  now = new Date(),
): Promise<Banner> {
  if (action.axis === 'application') {
    const state = await moveApplication(db, action.id, action.event);
    return state
      ? { ok: true, message: `This application is now ${APPLICATION_STATE_LABELS[state].toLowerCase()}.` }
      : {
          ok: false,
          message:
            'Nothing changed — this application is not somewhere that move is available from. ' +
            'It may already have moved.',
        };
  }

  const payment = await moveApplicationPayment(db, action.id, action.event, now);
  return payment
    ? {
        ok: true,
        message: `The money side now reads ${paymentStatusLabel(payment.mode, payment.status).toLowerCase()}.`,
      }
    : {
        ok: false,
        message:
          'Nothing changed — the money side already reads that, or this payment cannot make ' +
          'that move. It may already have moved.',
      };
}
