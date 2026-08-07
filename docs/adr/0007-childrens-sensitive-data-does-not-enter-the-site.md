# ADR-0007 — The children's sensitive data does not enter the site

**Status:** accepted
**Date:** 2026-08-07
**Context:** [#31](https://github.com/wyattwsaint/pharos-academy-site/issues/31), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18)

## Context

The school's live application is a Google Form, and it asks for everything: each child's date
of birth, the home address, allergies and medical conditions, evaluation history, and custody
arrangements. It has run that way for years and the school is used to it.

The obvious move when replacing a form is to reproduce it. #31's ninth acceptance criterion
forbids exactly that, and a comment on the ticket says it in the sharpest available terms:
**the live form must not be used as a schema.** The criterion is not "collect less to be
tidy". It is a decision about what this project is willing to become responsible for.

A site that stores a child's date of birth, address, medical conditions and custody
arrangements is a site holding the most sensitive record a small school has, on infrastructure
a two-person volunteer admin operates. Everything follows from that one row existing:
encryption at rest becomes a requirement rather than a nicety, the backup ZIP that currently
travels by email becomes a breach waiting for a mistyped address, the admin's flat permissions
([#16](https://github.com/wyattwsaint/pharos-academy-site/issues/16)) become inadequate, a
retention policy has to be written and then honoured, and the school acquires a disclosure
obligation it has no one to discharge. None of that work is in the budget, and half of it is
not work a website can do at all — it is governance.

The alternatives considered and rejected:

- **Collect it and build the stricter storage tier.** Column-level encryption, a role gate on
  the admin, an audit trail on reads, a retention job, an excluded-from-backup list. This is
  the honest version of "collect it", and its cost is not the code — it is that the school
  must then operate it correctly forever, with volunteers, or the controls are decoration.
  Rejected as beyond what this project can promise.
- **Collect it and store it no differently from an inquiry.** What reproducing the Google Form
  would actually have shipped. Rejected outright: it is the same exposure with none of the
  controls, and nobody would have decided it — it would have arrived as a side effect of
  copying a form.
- **Collect it and delete it after enrolment.** Trades a standing risk for a scheduled job
  that must never fail silently, and the data is at its most sensitive during exactly the
  window it is held. It also makes the backup ZIP's contents depend on when it ran.
- **Keep the Google Form for the sensitive half.** Two application flows, a family filling in
  their details twice, and the data still collected — just somewhere the school controls even
  less. It moves the risk off this repo without reducing it.

## Decision

**`ApplicationChild` is a name, an age and the chosen classes. That is the whole type.**

Date of birth, home address, allergies, medical conditions, evaluation history and custody
arrangements are deliberately absent from the form, the parser, the schema and the database.
They move to **paper, signed at enrolment**, which is where the school already handles the
rest of its enrolment paperwork and where a filing cabinet is a proportionate control.

This is what *deletes* the stricter storage tier rather than deferring it. There is no
encryption-at-rest requirement on this database, no role gate needed on the admin, and no
retention policy to write, because the data those would protect is not here.

The rule is enforced rather than documented. `application.test.ts` reads
`src/lib/application/application.ts` and the form component back as text and fails if either
grows one of those words, and a second test asserts the keys of `ApplicationChild` exactly. A
future contributor adding a date-of-birth field gets a red test before they get a migration.

## Consequences

**Good.**

- The most sensitive record the school holds is not on this site, so no failure of this site
  can disclose it.
- The monthly backup ZIP travels by email carrying names, emails and class choices — bad
  enough to warrant care, but not a child's medical and custody record.
- The flat-permissions decision stays defensible. Either admin seeing every application is
  proportionate to what an application contains.
- The school's paper process at enrolment is unchanged, so nothing has to be migrated or
  retrained.

**Bad, and accepted.**

- The school does the sensitive half on paper, twice a year, by hand. This site does not help
  with it and is not going to.
- An admin reading an application cannot see a child's age-eligibility evidence or allergies
  alongside it. Those live in a different place, on paper, and the two have to be matched by a
  person.
- Any future request — a medical field "just for the day camp", a date of birth "only for
  class placement" — is a reversal of this decision and must be taken as one. The tests will
  say so. **Reopen this ADR rather than deleting the assertion.**
