# ADR-0024 — The site captures family contact info; children's sensitive data still does not

**Status:** accepted
**Date:** 2026-08-27
**Context:** [#310](https://github.com/wyattwsaint/pharos-academy-site/issues/310),
[#311](https://github.com/wyattwsaint/pharos-academy-site/issues/311)
**Supersedes:** part of [ADR-0007](0007-childrens-sensitive-data-does-not-enter-the-site.md), and
the "No phone field exists" acceptance criterion of
[#25](https://github.com/wyattwsaint/pharos-academy-site/issues/25)

## Context

Two separate decisions left the school able to reach a family **only by email**.

[#25](https://github.com/wyattwsaint/pharos-academy-site/issues/25) refused a phone field on the
inquiry form, and said why: a phone number raises the perceived commitment of a form more than
any other field, and a parent who wants a call will ask for one in the message. That was
enforced rather than documented — `inquiry.test.ts` read the form markup back from disk and
failed if a `name="phone"` appeared, and `inquiry.spec.ts` checked both rendered copies of the
form in a browser.

[ADR-0007](0007-childrens-sensitive-data-does-not-enter-the-site.md) barred the home address from
the application, along with each child's date of birth, allergies, medical conditions,
evaluation history and custody arrangements. Its argument is about what this project is willing
to become responsible for: a site holding the most sensitive record a small school has, on
infrastructure two volunteers operate, acquires an encryption requirement, a retention policy, a
role gate on the admin and a disclosure obligation — none of which are in the budget and half of
which are governance rather than code. That ADR closes with an instruction: **reopen this rather
than deleting the assertion.** This is that reopening.

What changed is operational, not technical. The school wants to call a family back, and wants to
put paperwork in the post before enrolment. Today it has an email address and nothing else, for
inquiries and for applications alike. Both prior decisions were made about *friction* and about
*risk*; the school has weighed those against a need it did not have when it made them.

The alternatives considered and rejected:

- **An optional phone field.** The low-friction version, and it keeps most of what #25 bought.
  Rejected because a field a third of families skip does not solve "we cannot reach them" — it
  produces a list where staff cannot tell a family who declined a call from a family who missed
  the box, which is the worst of both.
- **A phone number in the message box.** No new field, no new column, no reversal to record. It
  is where #25 said the request would arrive. Rejected: a number buried in prose is not a number
  the admin can render as a link, an email can carry as a labelled line, or anybody can dial
  without reading a paragraph first.
- **The full Google Form set, since ADR-0007 is being reopened anyway.** Rejected outright, and
  the distinction is the whole point of this ADR. A household address is a fact about a
  *household* — the same class of fact as the email address the site has always held. A child's
  date of birth, allergies, medical conditions, evaluation history and custody arrangements are
  facts about a *child*, and every argument in ADR-0007 about encryption, retention, permissions
  and disclosure is about those. Reopening a door is not removing the wall.

## Decision

**The site captures a household's contact details. It still captures nothing sensitive about a
child.**

Concretely:

- The inquiry form gains a **mandatory** phone number (#311). The application gains a mandatory
  primary phone and a mandatory household address (the second ticket under #310).
- The format is strict: `###-###-####`, dashes auto-inserted as the parent types, the identical
  rule applied client-side and server-side, and the value **stored as typed**. The rule lives
  once, in `src/lib/forms.ts`, because two copies of a pattern is how one form comes to accept
  what the other refuses.
- The new columns are **nullable**, and there is no backfill. An inquiry and an application are
  records of what a family sent, and neither is editable; rows taken before these tickets have
  no number and never will, and the admin renders `—` for them.
- **ADR-0007 is superseded only as far as a household address on an application.** Per-child
  date of birth, allergies, medical conditions, evaluation history and custody arrangements
  remain barred, remain absent from the form, the parser, the schema and the database, and
  remain enforced by the tests on `ApplicationChild` and on the `application_children` table.
  Those tests are not relaxed by this decision.
- The #25 assertion is **inverted rather than deleted**, on the same surface it was written on:
  the test that read the form markup and refused a phone field now reads the same markup and
  requires one. A reader of that file meets the reversal where the original rule stood.

## Consequences

**Good.**

- The school can call a family back and put paperwork in the post, which is the thing it asked
  for and could not do at all.
- Staff acting from their inbox can dial without opening the admin: the number is a labelled
  line in the notification, and a `tel:` link on the admin screen.
- A family sees the number said back in their confirmation, which is the only correction route a
  capture-once record has.
- The dividing line is now written down. "Household contact detail, yes; per-child sensitive
  data, no" is a rule a future contributor can apply to a request nobody has made yet, where
  ADR-0007 alone would have read as a blanket no and been argued around.

**Bad, and accepted.**

- **A mandatory phone number is the maximum-friction version of the field #25 excluded.** #25's
  reasoning about perceived commitment was not wrong, and the cost lands on the form the whole
  site funnels into. Some families will leave the inquiry form rather than give a number. That
  is the trade the school has chosen, with its eyes open.
- **The monthly backup ZIP will carry household addresses** once the application ticket lands.
  That ZIP travels by email, and ADR-0007 explicitly counted "not a child's medical and custody
  record" as what made that proportionate. It still is not one — but the envelope is heavier
  than it was, and the argument for emailing it should be revisited before anything else is
  added to it.
- The strict format rejects extensions and international numbers. A family with either writes it
  in the message; the alternative is a field no rule can hold and no auto-format can help with.
- Old rows render a dash forever. Staff reading the inquiries list see two populations, and no
  amount of scrolling fixes the earlier one.
