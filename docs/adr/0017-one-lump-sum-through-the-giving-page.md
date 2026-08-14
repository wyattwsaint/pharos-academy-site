# ADR-0017 — A family pays one lump sum through the giving page, or writes one check

**Status:** accepted
**Date:** 2026-08-14
**Context:** [#219](https://github.com/wyattwsaint/pharos-academy-site/issues/219),
[#220](https://github.com/wyattwsaint/pharos-academy-site/issues/220),
[#221](https://github.com/wyattwsaint/pharos-academy-site/issues/221),
[#222](https://github.com/wyattwsaint/pharos-academy-site/issues/222)
**Supersedes:** part of [ADR-0013](0013-the-school-holds-the-tuition.md)

## Context

[ADR-0013](0013-the-school-holds-the-tuition.md) moved the tuition onto the
church's giving page beside the registration fee, and left the per-class deposit
where it was: "the per-class deposit is still a cheque to the school". That split
was never a decision about the deposit — it was the one amount nobody had asked
about, kept as it was while the tuition moved.

It costs more than it saves. A family owing three amounts is told to pay two of
them at a giving page and post the third, which is two acts, two amounts to read
off correctly, and two things the office watches for per application. The
office's side is worse than the family's: half an envelope is not a payment it
can file, and an application half-paid two ways is not a state anything on the
Applications screen was built to show.

## Decision

**All three amounts — registration fee, per-class deposits and tuition — are one
lump sum, paid by one method the family states.** The giving page is the primary
method; a check to the school is the secondary one. An envelope now contains the
**whole total or nothing**, never the deposits alone.

The family's answer is the `payment_mode` column's `online` or `cheque`, and one
answer words one instruction: the giving page and the amount to enter, or the
remittance address and the whole total, never both.

## What ADR-0013 still rules

Only the split is superseded. Everything else ADR-0013 decided stands:

- **The school holds all of it.** Tuition is Pharos Academy's money and not the
  instructors', which is why `AmountOwed.tuitionDue` is spelled that way and not
  `dueToInstructors`.
- **One address, not two.** `school_details.pay_online_url` covers every amount
  because it is one giving-page campaign, and the office pastes it once.
- **`dueNow` stays dropped.** It named registration plus deposits — the old
  envelope — and there is no such figure now; there is the total.
- **The application still learns nothing from a payment** — the next section
  says what that means now.

## What did not change

**The site learns nothing from a payment.** The giving page reports nothing back,
so a stated `online` is the family's own answer and never evidence money arrived.
Both modes open `awaiting`
([#220](https://github.com/wyattwsaint/pharos-academy-site/issues/220));
`paid_online` is written by the office, through
one admin action, matching a payment by hand. That hand-match is why the
[reference](0016-a-reference-is-derived-from-the-row-id.md) exists: the note a
family types into the giving page is the only thing joining the payment to the
application, and a uuid is not something anybody retypes correctly.

**Applied and paid are separate axes.** An application is `submitted` while its
payment is `awaiting`, then `overdue`, then `received` or `paid_online`, and
none of those moves the application's own state.

**The arithmetic is untouched.** The total was already registration plus deposits
plus tuition with `depositCreditedAgainstTuition` netted off, capped at the
tuition. Naming one payment instead of two changed how it is asked for, not what
it comes to.

**Overdue is still read from the clock and never stored**
([ADR-0008](0008-an-overdue-cheque-is-read-from-the-clock.md)). It is now
**scoped to cheque rows**: the grace period measures the post, and an online row
has no envelope to be late.

## Consequences

- **The surfaces move ticket by ticket, and the record says so.** Both emails
  already word the single instruction from one writer (`invoice` in
  `src/lib/application/notices.ts`,
  [#221](https://github.com/wyattwsaint/pharos-academy-site/issues/221)). The
  Apply page still shows the old
  split until [#219](https://github.com/wyattwsaint/pharos-academy-site/issues/219)
  lands; this ADR records the decision, not a finished sweep.
- **A family who says check and then pays online is still ordinary.** The office
  can record a match on either mode; only the envelope-shaped actions — the check
  has arrived, wait again for one — are offered on cheque rows.
- **The handbook still disagrees.** `docs/mirror/pdf-text/policy-handbook.txt`
  predates ADR-0013 and now predates this one too. The mirror is a record of what
  the old site said, not a claim this site makes, and is left as it is.
