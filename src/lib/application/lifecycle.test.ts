import { describe, expect, it } from 'vitest';

import {
  APPLICATION_EVENT_LABELS,
  APPLICATION_STATES,
  CHEQUE_GRACE_DAYS,
  PAYMENT_EVENT_LABELS,
  PAYMENT_STATUS_LABELS,
  countsInTally,
  eventsFrom,
  nextApplicationState,
  nextPayment,
  paymentOnSubmission,
  paymentStatusNow,
  tellsTheFamily,
  type Payment,
} from './lifecycle.js';

/**
 * The two axes (#32 AC 2, 3, 4).
 *
 * Everything here is pure, and that is the point of the module: the property
 * these tests are actually about — that moving one axis cannot move the other —
 * is a property of the *types* first and of the functions second. Neither
 * function below can see the axis it is not about, so the store test's
 * assertion that a payment change left the application state alone is checking
 * the wiring rather than hoping about the rule.
 */

const AT = new Date('2026-09-01T12:00:00Z');
const days = (from: Date, count: number): Date =>
  new Date(from.getTime() + count * 24 * 60 * 60 * 1000);

const awaiting = (since = AT): Payment => ({ mode: 'cheque', status: 'awaiting', since });

describe('the application axis', () => {
  it('takes a draft to submitted, and a submitted application through the conversation', () => {
    expect(nextApplicationState('draft', 'submit')).toBe('submitted');
    expect(nextApplicationState('submitted', 'discuss')).toBe('in_discussion');
    expect(nextApplicationState('in_discussion', 'enrol')).toBe('enrolled');
    expect(nextApplicationState('enrolled', 'withdraw')).toBe('withdrawn');
  });

  it('refuses a move that does not exist rather than inventing a state', () => {
    // A withdrawn application does not quietly become enrolled because somebody
    // posted the form twice.
    expect(nextApplicationState('withdrawn', 'enrol')).toBeNull();
    expect(nextApplicationState('submitted', 'submit')).toBeNull();
  });

  it('offers only the moves that are actually available from where it is', () => {
    expect(eventsFrom('submitted')).toEqual(['discuss', 'enrol', 'withdraw']);
    // Nothing follows the three ends.
    expect(eventsFrom('withdrawn')).toEqual([]);
    expect(eventsFrom('abandoned')).toEqual([]);
    expect(eventsFrom('refused')).toEqual([]);
  });

  it('ends an abandoned draft and a refused submission in different states (AC 4)', () => {
    expect(nextApplicationState('draft', 'abandon')).toBe('abandoned');
    expect(nextApplicationState('draft', 'refuse')).toBe('refused');
    expect(nextApplicationState('draft', 'abandon')).not.toBe(
      nextApplicationState('draft', 'refuse'),
    );
  });

  it('emails the family about a refused submission and never about an abandoned draft (AC 4)', () => {
    expect(tellsTheFamily('refused')).toBe(true);
    expect(tellsTheFamily('abandoned')).toBe(false);
    // And nothing else sends that notice — a submitted application gets a
    // confirmation, which is a different message on a different path.
    expect(APPLICATION_STATES.filter(tellsTheFamily)).toEqual(['refused']);
  });

  it('counts the live applications in the tally and none of the dead ones', () => {
    expect(APPLICATION_STATES.filter(countsInTally)).toEqual([
      'submitted',
      'in_discussion',
      'enrolled',
    ]);
  });
});

describe('the payment axis', () => {
  it('starts a cheque application awaiting, and an online one paid', () => {
    expect(paymentOnSubmission(AT, 'cheque')).toEqual({
      mode: 'cheque',
      status: 'awaiting',
      since: AT,
    });
    // The whole of what the Vanco stage changes: the next submission reads
    // "paid online" rather than "awaiting cheque".
    expect(paymentOnSubmission(AT, 'online')).toEqual({
      mode: 'online',
      status: 'paid_online',
      since: AT,
    });
  });

  it('records a cheque arriving, and moves nothing else', () => {
    const paid = nextPayment(awaiting(), 'receive', days(AT, 4));
    expect(paid).toEqual({ mode: 'cheque', status: 'received', since: days(AT, 4) });
  });

  it('refuses a move to where it already is', () => {
    expect(nextPayment({ mode: 'cheque', status: 'received', since: AT }, 'receive', AT)).toBeNull();
  });

  it('gives an overdue cheque another three weeks when the school asks again', () => {
    // The one move that is not refused for repeating itself: an overdue cheque
    // is *recorded* as awaited, so a school with no way to expect it again
    // would have no way to give the family more time.
    const late = awaiting();
    expect(paymentStatusNow(late, days(AT, CHEQUE_GRACE_DAYS + 1))).toBe('overdue');

    const again = nextPayment(late, 'expect', days(AT, CHEQUE_GRACE_DAYS + 1))!;
    expect(again.status).toBe('awaiting');
    expect(paymentStatusNow(again, days(AT, CHEQUE_GRACE_DAYS + 2))).toBe('awaiting');
  });

  it('becomes overdue on its own, with nobody touching it (AC 3)', () => {
    const posted = awaiting();

    expect(paymentStatusNow(posted, days(AT, CHEQUE_GRACE_DAYS - 1))).toBe('awaiting');
    expect(paymentStatusNow(posted, days(AT, CHEQUE_GRACE_DAYS + 1))).toBe('overdue');
    // The same record, unchanged, reading differently — the clock did it, not a
    // save, which is why nothing here writes.
    expect(posted).toEqual(awaiting());
  });

  it('leaves a cheque that arrived alone however long ago it was posted', () => {
    const received: Payment = { mode: 'cheque', status: 'received', since: AT };
    expect(paymentStatusNow(received, days(AT, 400))).toBe('received');
    expect(paymentStatusNow({ mode: 'online', status: 'paid_online', since: AT }, days(AT, 400))).toBe(
      'paid_online',
    );
  });

  it('starts the grace period again when a cheque is expected again', () => {
    // A bounced cheque is awaited from the day the school says so, not from the
    // day the family applied — otherwise it is overdue the moment it is asked for.
    const again = nextPayment({ mode: 'cheque', status: 'received', since: AT }, 'expect', days(AT, 30));
    expect(again).toEqual({ mode: 'cheque', status: 'awaiting', since: days(AT, 30) });
    expect(paymentStatusNow(again!, days(AT, 31))).toBe('awaiting');
  });
});

describe('the words on the buttons', () => {
  it('reads American, over a mode the database still spells its own way (#113)', () => {
    // The split the house style turns on, in one assertion: `mode: 'cheque'` is
    // a column value and never moves, and every label above it is what Jill and
    // the family read.
    const labels = [
      ...Object.values(PAYMENT_STATUS_LABELS),
      ...Object.values(PAYMENT_EVENT_LABELS),
      ...Object.values(APPLICATION_EVENT_LABELS),
    ];

    expect(labels.filter((label) => /cheque|enrol\b/i.test(label))).toEqual([]);
    expect(PAYMENT_STATUS_LABELS.awaiting).toBe('Awaiting check');
    expect(PAYMENT_EVENT_LABELS.receive).toBe('Check has arrived');
    expect(APPLICATION_EVENT_LABELS.enrol).toBe('Enroll this family');
  });
});
