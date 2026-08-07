# ADR-0008 — An overdue cheque is read from the clock, not written by a job

**Status:** accepted
**Date:** 2026-08-07
**Context:** [#32](https://github.com/wyattwsaint/pharos-academy-site/issues/32), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §11

## Context

The school takes cheques. A family applies online and posts one, and days later it arrives —
or it does not. #32's third acceptance criterion is that "a cheque past its grace period
becomes overdue with no human action": nobody at Pharos should have to notice that three
weeks have gone by, because the entire reason the state exists is that nobody noticed.

The **payment axis** is separate from the application's own state (CONTEXT.md, "payment
slot"), so the question is only where the word `overdue` comes from. Three ways to produce it
were available:

- **A scheduled job that writes the column.** A Vercel cron sweeping awaited payments each
  night and setting `payment_status = 'overdue'`. It is the shape most systems use, and its
  failure mode is the disqualifying one: a job that stops running — a rotated `CRON_SECRET`, a
  deploy that dropped the route, a plan change — leaves every screen saying every cheque is
  fine. The failure is silent, indistinguishable from good news, and pointed at the one part
  of the site that is about money. The school has no developer to notice it.
- **Writing it lazily, on read.** Compute it when a screen loads and save the word back. It
  keeps the column authoritative and adds a write to a page render, so an application goes
  overdue only if somebody happens to look at it — which is exactly the human action the
  criterion forbids, wearing a database's clothes.
- **Never storing it at all.** Store what actually happened — a cheque was awaited, from this
  date — and let every reader ask the clock.

The grace period itself is not a money setting. Nothing is charged when it passes, no late fee
is applied, and no figure on the public site moves; it is a constant in
`application/lifecycle.ts` at three weeks, long enough that an ordinary posted cheque is never
called late and short enough that a family who forgot is chased inside the month they applied
in.

## Decision

**`overdue` is not a value any row can hold.**

`RECORDED_PAYMENT_STATUSES` is `not_due | awaiting | received | paid_online`, and no writer in
the codebase can produce anything else. `paymentStatusNow(payment, now)` promotes an awaited
payment to `overdue` when `now` is past `payment.since` plus the grace period, and every
surface — the admin screen, any future report — reads it through that function.

`payment_since` is restamped on every move of the payment axis, so a cheque the school asks
for again gets its own grace period rather than being overdue the moment it is expected.

## Consequences

**Good.**

- There is nothing to run, so there is nothing that can stop running. The criterion holds on a
  deployment with no cron configured at all, which is also every test run.
- The record says what happened rather than what was concluded from it. Changing the grace
  period changes what every existing application reads, retrospectively and correctly,
  without a migration or a backfill.
- Moving the payment axis writes three columns and never touches `status`, which is what makes
  the two axes independent in the store as well as in the type.

**Bad, and accepted.**

- `overdue` cannot be queried in SQL. Finding every overdue application means reading the
  awaited ones and filtering in TypeScript. At this school's scale — tens of applications a
  year — that is not a cost; at ten thousand it would be, and the answer then is a computed
  column or an index on `payment_since`, not a job.
- Nothing *notices* the transition, so nothing can act on it. An email chasing a late cheque
  would need something to run at the moment it goes late, and that is deliberately not built:
  the school reads the admin screen and chases the family itself, which is how it already
  works. If chasing is ever automated, the send needs a trigger — and that trigger must still
  not be what decides the state.
- The clock is the reader's, not the database's. Two surfaces reading a second apart could in
  principle disagree, which is harmless here and would not be if anything ever charged money
  on the transition.
