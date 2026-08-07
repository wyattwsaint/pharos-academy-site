/**
 * Applied and paid, on two axes (#32).
 *
 * An application is `submitted` while its payment is `awaiting cheque`, then
 * `overdue`, then `received` — and **none of those changes the application's
 * own state**. This is how the school already works: a family is in or out of a
 * class by conversation, and a cheque is in the post or it is not, and the two
 * facts answer different questions. Folding them into one `status` would mean
 * inventing a state like "submitted, unpaid" and then discovering it needs
 * "in discussion, unpaid" and "enrolled, unpaid" the same afternoon.
 *
 * The separation is enforced by shape rather than by care. `nextApplicationState`
 * takes an `ApplicationState` and answers one; `nextPayment` takes a `Payment`
 * and answers one. Neither can see the other axis, so no future edit to one can
 * quietly move the other — which is what makes #32 AC 2 true by construction.
 *
 * **`overdue` is computed and never written.** It is not in
 * `RECORDED_PAYMENT_STATUSES` and no writer here can produce it: a cheque that
 * never arrives crosses the grace period on its own, and the alternative — a
 * cron job or a nightly sweep writing the column — is a moving part that can
 * fail silently and leave the school looking at a lie. Reading the clock cannot
 * fail to run. See ADR-0008.
 *
 * **Three states are unreachable today, and deliberately.** Nothing persists a
 * `draft` — the family's form is one page that either submits or does not — so
 * `abandoned` is a state no row can currently be in, and `refused` is carried
 * by the email the family gets rather than by a row, because a refused
 * submission is precisely one the store could not write. They are modelled
 * anyway because #32 AC 4 is about the *difference* between them: the two ends
 * are named, only one of them writes to the family (`tellsTheFamily`), and the
 * day drafts are persisted the moves are already here rather than being
 * invented under pressure.
 *
 * **The payment slot lives here as one constant.** `PAYMENT_SLOT_MODE` is the
 * whole of what the Vanco stage flips, and flipping it changes exactly one
 * thing: the next submission reads `paid online` rather than `awaiting cheque`.
 * That was verified by driving the prototype, and it is what makes the slot a
 * seam rather than a hole (CONTEXT.md, "payment slot").
 */

/**
 * Where an application itself can be.
 *
 * `stale` from the prototype is deliberately **two** states here. A draft
 * nobody finished and a submission the site could not accept are not the same
 * event: the first is a family who changed their mind, the second is a family
 * who thinks they have applied and has not. Collapsing them is how the second
 * ages out with nobody told (#32 AC 4).
 */
export const APPLICATION_STATES = [
  'draft',
  'submitted',
  'in_discussion',
  'enrolled',
  'withdrawn',
  'abandoned',
  'refused',
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

/** What somebody — or something — does to an application. */
export const APPLICATION_EVENTS = [
  'submit',
  'refuse',
  'abandon',
  'discuss',
  'enrol',
  'withdraw',
] as const;
export type ApplicationEvent = (typeof APPLICATION_EVENTS)[number];

/**
 * Every move there is, as data.
 *
 * A table rather than a `switch`, because the admin needs to *ask* which moves
 * exist from where an application is standing, and a screen that offers a
 * button the store would refuse is a screen that lies.
 */
const MOVES: Record<ApplicationEvent, { from: readonly ApplicationState[]; to: ApplicationState }> = {
  submit: { from: ['draft'], to: 'submitted' },
  refuse: { from: ['draft'], to: 'refused' },
  abandon: { from: ['draft'], to: 'abandoned' },
  discuss: { from: ['submitted', 'enrolled'], to: 'in_discussion' },
  enrol: { from: ['submitted', 'in_discussion'], to: 'enrolled' },
  withdraw: { from: ['submitted', 'in_discussion', 'enrolled'], to: 'withdrawn' },
};

/**
 * Where this event takes an application, or null when it takes it nowhere.
 *
 * Null rather than a throw: the caller is a form post, and a second click on
 * "Enrol" is an ordinary thing for a person to do rather than an error to show
 * them a stack trace about.
 */
export function nextApplicationState(
  state: ApplicationState,
  event: ApplicationEvent,
): ApplicationState | null {
  const move = MOVES[event];
  return move.from.includes(state) ? move.to : null;
}

/** The moves actually available from here, in the order the admin offers them. */
export function eventsFrom(state: ApplicationState): ApplicationEvent[] {
  return APPLICATION_EVENTS.filter((event) => MOVES[event].from.includes(state));
}

/**
 * Whether reaching this state means writing to the family.
 *
 * Exactly one state does, and the asymmetry is the decision (#32 AC 4): a
 * family who abandoned a draft chose to, and an email about it would be the
 * site nagging somebody who already said no. A family whose submission was
 * refused believes they have applied — telling them is the whole remedy.
 */
export function tellsTheFamily(state: ApplicationState): boolean {
  return state === 'refused';
}

/**
 * The states a seat is counted in — the number Jill uses to decide whether a
 * class runs.
 *
 * A withdrawn family is not in the room; a family still in discussion is, until
 * they say otherwise, because a class cancelled on a count that dropped
 * everyone mid-conversation is a class cancelled on the wrong number.
 */
export function countsInTally(state: ApplicationState): boolean {
  return state === 'submitted' || state === 'in_discussion' || state === 'enrolled';
}

export const PAYMENT_MODES = ['cheque', 'online'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/**
 * How the school takes money today.
 *
 * The one line the Vanco stage changes. Everything downstream reads it rather
 * than assuming cheques, so the flip is a constant and not a refactor.
 */
export const PAYMENT_SLOT_MODE: PaymentMode = 'cheque';

/**
 * What a row may hold.
 *
 * `overdue` is conspicuously absent, and its absence is the design: see the
 * note at the top of this file and `paymentStatusNow` below.
 */
export const RECORDED_PAYMENT_STATUSES = [
  'not_due',
  'awaiting',
  'received',
  'paid_online',
] as const;
export type RecordedPaymentStatus = (typeof RECORDED_PAYMENT_STATUSES)[number];

/** What the school reads, which is the recorded status plus what the clock adds. */
export type PaymentStatus = RecordedPaymentStatus | 'overdue';

/** The payment axis of one application. */
export type Payment = {
  mode: PaymentMode;
  status: RecordedPaymentStatus;
  /** When it last moved. What the grace period is measured from. */
  since: Date;
};

/**
 * How long a cheque has to arrive before the school is told it is late.
 *
 * Three weeks: long enough that an ordinary posted cheque is never called
 * overdue, short enough that a family who forgot is chased inside the month
 * they applied in. A constant rather than a money setting, because it is not a
 * number about money — nothing is charged when it passes, no late fee is
 * applied, and a settings field would invite it to be tuned to zero on a day
 * somebody was impatient.
 */
export const CHEQUE_GRACE_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The payment axis as a submission opens it. */
export function paymentOnSubmission(now: Date, mode: PaymentMode = PAYMENT_SLOT_MODE): Payment {
  return {
    mode,
    status: mode === 'online' ? 'paid_online' : 'awaiting',
    since: now,
  };
}

/**
 * What the school can do to the money side.
 *
 * `paid_online` is not reachable from here on purpose: it is what the payment
 * slot writes when a family pays, never what somebody ticks afterwards.
 */
export const PAYMENT_EVENTS = ['receive', 'expect', 'waive'] as const;
export type PaymentEvent = (typeof PAYMENT_EVENTS)[number];

const PAYMENT_MOVES: Record<PaymentEvent, RecordedPaymentStatus> = {
  receive: 'received',
  expect: 'awaiting',
  waive: 'not_due',
};

/**
 * Move the money side, and only the money side.
 *
 * `since` is restamped on every move, which is what makes a re-expected cheque
 * get its own grace period rather than being overdue the instant it is asked
 * for again.
 *
 * Null when it is already there — a second click, not an error. **`expect` is
 * the exception**, and it is the one that matters: an overdue cheque is
 * *recorded* as awaited, so refusing "expecting a cheque" because the column
 * already says so would leave the school with no way to give a family another
 * three weeks. Expecting a cheque again restarts the wait, which is exactly
 * what the school means by clicking it.
 */
export function nextPayment(payment: Payment, event: PaymentEvent, now: Date): Payment | null {
  const status = PAYMENT_MOVES[event];
  if (status === payment.status && event !== 'expect') return null;
  return { mode: payment.mode, status, since: now };
}

/**
 * What the payment reads *now* (#32 AC 3).
 *
 * An awaited cheque past its grace period is overdue, and nothing had to
 * happen for it to become so — no cron, no sweep, no button. Every other
 * status reads back exactly as recorded, so a cheque that arrived is never
 * retrospectively called late.
 */
export function paymentStatusNow(payment: Payment, now: Date): PaymentStatus {
  if (payment.status !== 'awaiting') return payment.status;
  return now.getTime() >= chequeDueBy(payment).getTime() ? 'overdue' : 'awaiting';
}

/** The day an awaited cheque stops being merely in the post. */
export function chequeDueBy(payment: Payment): Date {
  return new Date(payment.since.getTime() + CHEQUE_GRACE_DAYS * DAY_MS);
}

/** How each state reads on the admin screen and in the school's email. */
export const APPLICATION_STATE_LABELS: Record<ApplicationState, string> = {
  draft: 'Started, not sent',
  submitted: 'Submitted',
  in_discussion: 'In conversation',
  enrolled: 'Enrolled',
  withdrawn: 'Withdrawn',
  abandoned: 'Abandoned',
  refused: 'Not accepted by the site',
};

/** What the button says. A verb, in the school's own terms. */
export const APPLICATION_EVENT_LABELS: Record<ApplicationEvent, string> = {
  submit: 'Mark as submitted',
  refuse: 'Mark as not accepted',
  abandon: 'Mark as abandoned',
  discuss: 'Start a conversation',
  enrol: 'Enrol this family',
  withdraw: 'Withdraw this application',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_due: 'Nothing to pay',
  awaiting: 'Awaiting cheque',
  received: 'Cheque received',
  overdue: 'Cheque overdue',
  paid_online: 'Paid online',
};

export const PAYMENT_EVENT_LABELS: Record<PaymentEvent, string> = {
  receive: 'Cheque has arrived',
  expect: 'Wait (again) for a cheque',
  waive: 'Nothing to pay',
};
