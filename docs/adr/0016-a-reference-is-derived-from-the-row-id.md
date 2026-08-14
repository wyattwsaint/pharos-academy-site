# ADR-0016 — An application's reference is derived from its row id, never stored

**Status:** accepted
**Date:** 2026-08-14
**Context:** [#218](https://github.com/wyattwsaint/pharos-academy-site/issues/218)

## Context

An application's identity is a Postgres `uuid`, and until now every surface that named
one printed it: the confirmation screen said "Reference 0f8b3a41-6c2d-4f7e-9a10-…", and
both emails carried the same 36 characters.

That identity has a job outside the database. Vanco sends the site nothing
([ADR-0013](0013-the-school-holds-the-tuition.md)), so a payment arrives at the school
detached from the application it belongs to, and the office joins the two by reading the
note a family typed into the church's giving page. A uuid is not something anybody retypes
correctly, and a mistyped one is not a payment matched to the wrong family — it is a
payment matched to nobody, found weeks later.

## Decision

One pure function, `applicationReference(id)`, turns a row id into `PA-` and eight
characters grouped in fours. It is the **single writer of that format**: the confirmation
screen, both emails and the Applications screen all ask it, and no surface builds its own.

**Derived, not stored.** No column, no sequence, no second identity to keep in step with
the id — the same habit as [ADR-0003](0003-prices-are-computed-not-stored.md). The id is
folded with FNV-1a and written in a 26-character alphabet that drops every pair somebody
confuses while copying: `0`/`O`, `1`/`I`/`L`, `2`/`Z`, `5`/`S`, `6`/`G`, `8`/`B`, and `U`
with them. `REFERENCE_PATTERN` is exported from the same module so nothing has to write
the format out again to recognise one.

## Consequences

- **The code cannot drift from the row**, because there is nothing to drift: a row
  restored from a backup keeps the code the family already quoted, and a migration that
  moves the table cannot leave the reference behind.
- **Nothing looks an application up by its code.** Deriving is one-way, so finding an
  application from a payment note is still the office reading the Applications screen — a
  search box would need either a stored column or a scan, and neither is owed by a school
  this size. If the office asks for one, it is a scan first and a column only if that is
  too slow.
- **Two rows could collide.** The hash is folded into 26⁸ ≈ 2.1 × 10¹¹ codes, so at five
  thousand applications the chance of any two sharing one is about one in twenty thousand
  — accepted, because the failure is "the office sees two families and reads the amounts"
  rather than a payment credited to the wrong one. `reference.test.ts` holds the property
  that catches a weakened hash: ids differing by a single character get different codes.
- **The family is asked to write it down.** The confirmation screen and the family's email
  both ask for the reference in the giving-page note, which is the only point in the flow
  where a human can join the two records. If the school would rather not ask families for
  it, the code stays and the sentence goes.
- **The uuid is still the id.** It is what the admin's forms post and what the backup
  export writes; the reference is what a person reads. Nothing in the schema changed.
