# ADR-0023 — Each fee is paid into its own campaign, in the school's own Vanco organisation

**Status:** accepted
**Date:** 2026-08-22
**Context:** [#300](https://github.com/wyattwsaint/pharos-academy-site/issues/300),
[#302](https://github.com/wyattwsaint/pharos-academy-site/issues/302),
[#303](https://github.com/wyattwsaint/pharos-academy-site/issues/303)
**Supersedes:** part of [ADR-0017](0017-one-lump-sum-through-the-giving-page.md)

## Context

[ADR-0017](0017-one-lump-sum-through-the-giving-page.md) made the registration
fee, the per-class deposits and the tuition **one lump sum through one giving
page**, and said so in terms: *"One address, not two. `school_details.pay_online_url`
covers every amount because it is one giving-page campaign, and the office pastes
it once."*

That was true of the account the site was pointed at. The campaign belonged to
the **host church's** Vanco organisation, `YH8R`, seeded as an explicit
placeholder while Pharos had no merchant account of its own — the seed comment
said as much. There was one campaign to pay into because there was one campaign.

Two things changed. Pharos now has its own merchant account, `L-ZZ7H`, and money
was still landing in the church's. And that account has **three campaigns** —
class fees, registration fees, study hall fees — so the school's own bookkeeping
now has somewhere for the fees to arrive apart. One lump payment into one of
three campaigns tells the office nothing about what it was for, and leaves them
reconciling a single figure against an application by hand with the
[reference](0016-a-reference-is-derived-from-the-row-id.md) in the Memo box as
the only thing joining the two.

## Decision

**The application charges each fee into its own campaign, in Pharos's own Vanco
organisation.**

| Fee | Campaign |
| --- | --- |
| Registration | `C-16GQ2` |
| Deposits and tuition together | `C-16GQ0` |
| Study hall | `C-16GQ4` — stored, rendered nowhere |

A family who has submitted an application is offered **two payments** — the
registration, then the classes — each with its own amount beside its own button,
on the confirmation screen and again in the confirmation email.

**Deposits and tuition share a campaign on purpose.** They are both what a family
owes for the classes, and the deposits come off the tuition — a relationship the
page spends a paragraph explaining. Splitting them across two campaigns would
split the thing the copy exists to hold together, and Vanco has one campaign for
class fees rather than two.

**Study hall gets no line.** The site has never charged it on this page, and the
handbook states the fee twice with two different figures
([#51](https://github.com/wyattwsaint/pharos-academy-site/issues/51)). Its
campaign is a stored, editable field so the office can capture the URL while they
have it in front of them; nothing renders it.

**The reference stays one string across both payments**, so the office matches on
one thing and not two. The Memo-box instruction now says the reference goes into
**each** payment, because it has to be typed twice and a family reading quickly
will assume once is enough.

## What ADR-0017 still rules

Only "one address, not two" is superseded. Everything else stands:

- **A family is asked once how they are paying**, not once per fee. One
  `payment_mode` per application; the office's *Awaiting payment online* and
  *Awaiting check* labels are unchanged.
- **A check is one amount, all of it, one envelope.** Splitting the fees is the
  school's bookkeeping and never the family's problem. The check option stays
  the subordinate disclosure beside the primary action.
- **The site learns nothing from a payment.** Vanco reports nothing back, so a
  stated `online` is still the family's own answer and never evidence money
  arrived.
- **The arithmetic is untouched.** The two subtotals come back to the same total
  ADR-0017 named; naming two payments instead of one changed how it is asked
  for, not what it comes to.

## Consequences

- **Three columns replace one.** `pay_online_url` is renamed to
  `class_fees_url`, and `registration_fees_url` and `study_hall_fees_url` join
  it. Each is an admin field labelled after the campaign the office is copying
  from in MyVanco, so pasting is a matching exercise and not a translating one,
  and each is validated as a web address on save.
- **The migration writes the three links itself.** A blank link renders the
  check instruction for that fee, so shipping the columns blank would silently
  withdraw online payment from the site until somebody logged into the admin —
  the wrong failure mode for a cutover. The guard overwrites an empty box or an
  address in the church's organisation and leaves anything else alone, because
  the whole argument for these being columns is that the office can choose.
- **A blank link degrades one fee, never the section.** A half-finished admin
  save leaves that fee posted as a check while the fee beside it keeps its
  button. The rule lives in `paymentLines`, with the ordering and the
  hide-at-zero rule, so the page and the email cannot come to disagree.
- **A line at zero is not offered.** A family who ticked no classes is not shown
  a button that would open a page to pay nothing. The *form* stage keeps its
  empty lines, because the figures there are still moving and a button that
  appears underneath a family as they tick is the page rearranging itself.
- **The giving-link template is left as it is.** It pins a template to a single
  campaign path, so at most one of three links could ever carry an amount. It is
  empty in production, so nothing is lost today; restructuring it into a query
  suffix is a separate piece of work.
- **The previous organisation is retired from the seed and the fixtures.**
  Existing ADRs that name `YH8R` are left as written — an ADR records what was
  decided at the time, and this one supersedes rather than rewrites them.
- **Payments already taken in the church's organisation are not reconciled by
  any of this.** Not a code change, but the office needs to know the account has
  moved.
