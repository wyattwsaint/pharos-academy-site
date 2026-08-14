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
 * **The clock only reads a cheque (#220).** The grace period is about an
 * envelope in the post; an online row has no envelope, so it never crosses into
 * `overdue` however long it waits. A screen that called it overdue would send
 * the office chasing a family for something that was never coming.
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
 * **A stated mode is not a payment.** The mode on a row is what the family said
 * they would do, and both modes open `awaiting`: the giving page tells the site
 * nothing (ADR-0013), so a row that opened `paid online` because somebody chose
 * online would be asserting money nobody has seen. `paid_online` is therefore
 * written by the office, through `match`, and by nothing else — the payment
 * slot that was once going to write it automatically does not exist and is not
 * coming (CONTEXT.md, "payment slot").
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
 * What a submission records when it does not say how the family is paying.
 *
 * A fallback rather than a policy: the Apply page asks, and this is what a row
 * written without an answer — an older submission, a caller that has not been
 * given the question yet — holds. Cheque, because that is the mode whose moves
 * and grace period were always there, so an unstated row behaves exactly as
 * every row did before the question was asked.
 */
export const UNSTATED_PAYMENT_MODE: PaymentMode = 'cheque';

/**
 * The mode a family's stated method records as (#219, ADR-0017).
 *
 * The form says `check` because prose is American and the column says `cheque`
 * because renaming a schema for a spelling costs a migration and buys nothing
 * (CONTEXT.md, "enrolment unit"). This is the one line where the two meet, so
 * neither vocabulary leaks into the other's half of the codebase.
 */
export function paymentModeOf(method: 'online' | 'check'): PaymentMode {
  return method === 'online' ? 'online' : 'cheque';
}

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

/**
 * The payment axis as a submission opens it.
 *
 * **Awaiting, both ways.** Whichever mode the family stated, nothing has yet
 * said the money arrived: a cheque is in the post or it is not, and an online
 * payment happened at a giving page that reports back to nobody. The mode says
 * what the office should be watching for, and only that.
 */
export function paymentOnSubmission(now: Date, mode: PaymentMode = UNSTATED_PAYMENT_MODE): Payment {
  return {
    mode,
    status: 'awaiting',
    since: now,
  };
}

/**
 * What the school can do to the money side.
 *
 * `match` is how `paid_online` is reached, and the office is the only thing
 * that can reach it (#220). It was reserved for a payment slot that would write
 * it the moment a family paid; no such slot exists and none is coming, so the
 * alternative to somebody ticking it is a status no row can ever hold.
 */
export const PAYMENT_EVENTS = ['receive', 'match', 'expect', 'waive'] as const;
export type PaymentEvent = (typeof PAYMENT_EVENTS)[number];

/**
 * Every money move, as data — where it lands, and which modes it belongs to.
 *
 * The modes are the half that keeps the screen honest: "the check has arrived"
 * and "wait (again) for a check" are meaningless on a row where no check was
 * ever coming, and offering them there would be the office asking a family who
 * paid online to post an envelope.
 */
const PAYMENT_MOVES: Record<
  PaymentEvent,
  { to: RecordedPaymentStatus; modes: readonly PaymentMode[] }
> = {
  receive: { to: 'received', modes: ['cheque'] },
  match: { to: 'paid_online', modes: PAYMENT_MODES },
  expect: { to: 'awaiting', modes: PAYMENT_MODES },
  waive: { to: 'not_due', modes: PAYMENT_MODES },
};

/**
 * Whether this move does anything to this row.
 *
 * Two reasons it does not: the mode has no such move, or the row already reads
 * what the move would write. **Waiting again is the exception, and only for a
 * cheque**: an overdue cheque is *recorded* as awaited, so a school refused
 * "wait again" because the column already says so would have no way to give a
 * family another three weeks. An online row has no grace period to restart, so
 * on one already awaiting the same click would change nothing — it earns its
 * place there only as the way back from a payment matched in error, which is
 * the correction the office needs and would otherwise not have.
 */
function movesAnything(payment: Payment, event: PaymentEvent): boolean {
  const move = PAYMENT_MOVES[event];
  if (!move.modes.includes(payment.mode)) return false;
  if (move.to !== payment.status) return true;
  return event === 'expect' && payment.mode === 'cheque';
}

/**
 * Move the money side, and only the money side.
 *
 * `since` is restamped on every move, which is what makes a re-expected cheque
 * get its own grace period rather than being overdue the instant it is asked
 * for again.
 *
 * Null when the move does nothing — a second click, not an error — and null
 * when it does not belong to this row's mode. `movesAnything` above is the
 * whole of that rule, and the screen asks it the same question before it draws
 * a button.
 */
export function nextPayment(payment: Payment, event: PaymentEvent, now: Date): Payment | null {
  if (!movesAnything(payment, event)) return null;
  return { mode: payment.mode, status: PAYMENT_MOVES[event].to, since: now };
}

/**
 * The money moves actually available on this row, in the order the admin offers
 * them.
 *
 * The screen asks rather than listing all four, because a button the store
 * would refuse is a button that lies — and since #220 there are two reasons it
 * would refuse, the row's mode as well as where it already is. Both readers ask
 * `movesAnything`, so the screen and the store cannot drift apart.
 */
export function paymentEventsFrom(payment: Payment): PaymentEvent[] {
  return PAYMENT_EVENTS.filter((event) => movesAnything(payment, event));
}

/**
 * What the payment reads *now* (#32 AC 3).
 *
 * An awaited cheque past its grace period is overdue, and nothing had to
 * happen for it to become so — no cron, no sweep, no button. Every other
 * status reads back exactly as recorded, so a cheque that arrived is never
 * retrospectively called late.
 *
 * **The mode is read first (#220).** Only a cheque can be late, because the
 * grace period measures the post; an online row waits as long as it waits and
 * reads `awaiting` throughout.
 */
export function paymentStatusNow(payment: Payment, now: Date): PaymentStatus {
  if (payment.mode !== 'cheque' || payment.status !== 'awaiting') return payment.status;
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
  enrol: 'Enroll this family',
  withdraw: 'Withdraw this application',
};

/** How the money reads on a row the family said they would post a check for. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_due: 'Nothing to pay',
  awaiting: 'Awaiting check',
  received: 'Check received',
  overdue: 'Check overdue',
  paid_online: 'Paid online',
};

/**
 * The same statuses on a row the family said they would pay online.
 *
 * `overdue` is absent because an online row cannot be in it, and a label for a
 * state nothing can reach is a sentence waiting to be shown by mistake.
 */
export const ONLINE_PAYMENT_STATUS_LABELS: Record<RecordedPaymentStatus, string> = {
  not_due: 'Nothing to pay',
  awaiting: 'Awaiting payment online',
  received: 'Payment received',
  paid_online: 'Paid online',
};

/**
 * What this row's money says, in the terms of what it is waiting for.
 *
 * One function rather than one map, because "Awaiting check" against a family
 * who paid at the giving page is the office being told to watch the post for an
 * envelope nobody sent (#220 AC 6).
 */
export function paymentStatusLabel(mode: PaymentMode, status: PaymentStatus): string {
  if (mode === 'cheque' || status === 'overdue') return PAYMENT_STATUS_LABELS[status];
  return ONLINE_PAYMENT_STATUS_LABELS[status];
}

/** What the button says on a check row. A verb, in the school's own terms. */
export const PAYMENT_EVENT_LABELS: Record<PaymentEvent, string> = {
  receive: 'Check has arrived',
  match: 'Payment matched by hand',
  expect: 'Wait (again) for a check',
  waive: 'Nothing to pay',
};

/**
 * The one button that has to say something else on an online row.
 *
 * On a check row "wait (again) for a check" restarts the grace period. On an
 * online row it is the way back from a payment matched in error — the office
 * writes `paid online` by hand now (#220), so the office needs to be able to
 * unwrite it, and telling it to wait for a check would be asking a family who
 * paid at the giving page to post an envelope.
 */
const ONLINE_PAYMENT_EVENT_LABELS: Partial<Record<PaymentEvent, string>> = {
  expect: 'Still waiting for this payment',
};

/** What this row's button says, in the terms of what it is waiting for. */
export function paymentEventLabel(mode: PaymentMode, event: PaymentEvent): string {
  return (mode === 'online' && ONLINE_PAYMENT_EVENT_LABELS[event]) || PAYMENT_EVENT_LABELS[event];
}

/**
 * The sentence a waited-for payment earns beside its status, as a kind.
 *
 * The *decision* is here and the *wording* is on the screen: which of the three
 * an application has earned is a fact about the mode and the clock, and a
 * template working that out is a template holding a rule (#220 AC 6). Null when
 * the money is settled and there is nothing to add.
 */
export type PaymentAwaitedNote = 'cheque_due' | 'cheque_late' | 'online_unconfirmed' | null;

export function paymentAwaitedNote(payment: Payment, now: Date): PaymentAwaitedNote {
  const status = paymentStatusNow(payment, now);
  if (status === 'overdue') return 'cheque_late';
  if (status !== 'awaiting') return null;
  return payment.mode === 'cheque' ? 'cheque_due' : 'online_unconfirmed';
}
