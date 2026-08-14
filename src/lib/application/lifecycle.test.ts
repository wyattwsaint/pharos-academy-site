import { describe, expect, it } from 'vitest';

import {
  APPLICATION_EVENT_LABELS,
  APPLICATION_STATES,
  CHEQUE_GRACE_DAYS,
  ONLINE_PAYMENT_STATUS_LABELS,
  PAYMENT_EVENT_LABELS,
  PAYMENT_STATUS_LABELS,
  countsInTally,
  eventsFrom,
  nextApplicationState,
  nextPayment,
  paymentAwaitedNote,
  paymentEventLabel,
  paymentEventsFrom,
  paymentModeOf,
  paymentOnSubmission,
  paymentStatusLabel,
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
const online = (since = AT): Payment => ({ mode: 'online', status: 'awaiting', since });

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
  it('opens awaiting whichever way the family said they would pay (#220 AC 1)', () => {
    expect(paymentOnSubmission(AT, 'cheque')).toEqual({
      mode: 'cheque',
      status: 'awaiting',
      since: AT,
    });
    // Never `paid_online`: the giving page sends the site nothing (ADR-0013),
    // so a row that opened paid would be asserting a payment nobody checked.
    expect(paymentOnSubmission(AT, 'online')).toEqual({
      mode: 'online',
      status: 'awaiting',
      since: AT,
    });
  });

  it('records the stated method in the column’s own spelling (#219)', () => {
    // The form says `check` because prose is American; the column says
    // `cheque` because renaming a schema for a spelling costs a migration.
    // This is the one line where the two vocabularies meet.
    expect(paymentModeOf('check')).toBe('cheque');
    expect(paymentModeOf('online')).toBe('online');
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

describe('an online payment', () => {
  it('never goes overdue, however long it waits (#220 AC 2)', () => {
    // The grace period is about an envelope in the post. There is no envelope,
    // so there is nothing to be late — chasing this family for a cheque would
    // be chasing them for something that was never coming.
    expect(paymentStatusNow(online(), days(AT, CHEQUE_GRACE_DAYS + 1))).toBe('awaiting');
    expect(paymentStatusNow(online(), days(AT, 400))).toBe('awaiting');
    // The same clock, the same day, on a cheque row: overdue.
    expect(paymentStatusNow(awaiting(), days(AT, CHEQUE_GRACE_DAYS + 1))).toBe('overdue');
  });

  it('is recorded paid when the office matches it by hand (#220 AC 3)', () => {
    const matched = nextPayment(online(), 'match', days(AT, 2));
    expect(matched).toEqual({ mode: 'online', status: 'paid_online', since: days(AT, 2) });
  });

  it('is never offered a cheque move, and a cheque row keeps all of its own (#220 AC 4, 5)', () => {
    // The cheque row keeps every move it has today, and gains the match.
    expect(paymentEventsFrom(awaiting())).toEqual(['receive', 'match', 'expect', 'waive']);
    // The online row is offered neither "the cheque arrived" nor a wait it is
    // already in — there is no envelope, and no grace period to restart.
    expect(paymentEventsFrom(online())).toEqual(['match', 'waive']);
    expect(nextPayment(online(), 'receive', AT)).toBeNull();
    expect(nextPayment(online(), 'expect', AT)).toBeNull();
  });

  it('can be un-matched, because a hand can match the wrong one (#220 AC 3)', () => {
    // The office is the writer now, so the office has to be able to unwrite it.
    // The same move that gives a cheque another three weeks is the way back,
    // worded for a family who is not posting anything.
    const matched: Payment = { mode: 'online', status: 'paid_online', since: AT };
    expect(paymentEventsFrom(matched)).toEqual(['expect', 'waive']);
    expect(nextPayment(matched, 'expect', days(AT, 1))).toEqual({
      mode: 'online',
      status: 'awaiting',
      since: days(AT, 1),
    });
    expect(paymentEventLabel('online', 'expect')).toBe('Still waiting for this payment');
    expect(paymentEventLabel('cheque', 'expect')).toBe('Wait (again) for a check');
  });

  it('says which sentence a waiting row has earned, and the screen only words it', () => {
    expect(paymentAwaitedNote(awaiting(), days(AT, 1))).toBe('cheque_due');
    expect(paymentAwaitedNote(awaiting(), days(AT, CHEQUE_GRACE_DAYS + 1))).toBe('cheque_late');
    expect(paymentAwaitedNote(online(), days(AT, CHEQUE_GRACE_DAYS + 1))).toBe(
      'online_unconfirmed',
    );
    // Settled money earns nothing beside it, either way.
    expect(paymentAwaitedNote({ mode: 'cheque', status: 'received', since: AT }, AT)).toBeNull();
    expect(paymentAwaitedNote({ mode: 'online', status: 'paid_online', since: AT }, AT)).toBeNull();
  });

  it('offers nothing the store would refuse, from anywhere either mode can be', () => {
    for (const mode of ['cheque', 'online'] as const) {
      for (const status of ['not_due', 'awaiting', 'received', 'paid_online'] as const) {
        const payment: Payment = { mode, status, since: AT };
        for (const event of paymentEventsFrom(payment)) {
          expect(nextPayment(payment, event, AT), `${mode}/${status}/${event}`).not.toBeNull();
        }
      }
    }
  });

  it('reads without ever mentioning a check (#220 AC 6)', () => {
    expect(paymentStatusLabel('online', 'awaiting')).toBe('Awaiting payment online');
    expect(paymentStatusLabel('online', 'paid_online')).toBe('Paid online');
    // And the check row still reads exactly as it did.
    expect(paymentStatusLabel('cheque', 'awaiting')).toBe('Awaiting check');
    expect(paymentStatusLabel('cheque', 'overdue')).toBe('Check overdue');
  });
});

describe('the words on the buttons', () => {
  it('reads American, over a mode the database still spells its own way (#113)', () => {
    // The split the house style turns on, in one assertion: `mode: 'cheque'` is
    // a column value and never moves, and every label above it is what Jill and
    // the family read.
    const labels = [
      ...Object.values(PAYMENT_STATUS_LABELS),
      ...Object.values(ONLINE_PAYMENT_STATUS_LABELS),
      ...Object.values(PAYMENT_EVENT_LABELS),
      ...Object.values(APPLICATION_EVENT_LABELS),
    ];

    expect(labels.filter((label) => /cheque|enrol\b/i.test(label))).toEqual([]);
    expect(PAYMENT_STATUS_LABELS.awaiting).toBe('Awaiting check');
    expect(PAYMENT_EVENT_LABELS.receive).toBe('Check has arrived');
    expect(APPLICATION_EVENT_LABELS.enrol).toBe('Enroll this family');
  });
});
