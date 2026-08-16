# ADR-0021 — The school's own content is removable; a record of what a family sent is not

**Status:** accepted; being built — the policy delete
([#260](https://github.com/wyattwsaint/pharos-academy-site/issues/260)), the
announcement delete
([#258](https://github.com/wyattwsaint/pharos-academy-site/issues/258)), the
person delete
([#262](https://github.com/wyattwsaint/pharos-academy-site/issues/262)),
retirement
([#263](https://github.com/wyattwsaint/pharos-academy-site/issues/263)) and the
course delete
([#267](https://github.com/wyattwsaint/pharos-academy-site/issues/267)) have all
landed
**Date:** 2026-08-15
**Context:** [#252](https://github.com/wyattwsaint/pharos-academy-site/issues/252),
recorded by [#256](https://github.com/wyattwsaint/pharos-academy-site/issues/256);
came out of a grilling session on 2026-08-15
**Supersedes:** the implication in
[ADR-0005](0005-two-addresses-per-policy.md) that a policy row is permanent —
not its two addresses, and not the retention of versions

## Context

Everything in the [editable set](../../CONTEXT.md#editable-set) has a create form
and an edit form, and nothing has a way back. The only two deletes on the site are
a [one-off](../../CONTEXT.md#one-off) and an admin account. Two admin screens say
so in as many words: *"Nothing else in the admin deletes anything"* and *"Nobody
has been removed — there is no delete here."*

That stance was never argued as a principle. It accumulated: each screen was built
for a school whose catalogue, staff list and policy set were settled, and none of
them were. Pharos is new. An instructor gets typed in twice, a course the school
decided not to run sits on the catalogue, a policy row is created before anybody
has written the document. The only remedy today is a migration argued in writing,
which means asking a developer, which means the office cannot keep its own site
true. A promise not to delete is worth keeping only where somebody is relying on
it, and nobody is relying on the duplicate instructor.

But the append-only stance is not uniformly wrong, and the reason it exists is
real. This site holds two different kinds of thing under one admin. Some of it is
**what the school says** — the catalogue, the staff page, the notices, the policy
set. The rest is **what a family sent** — an
[application](../../CONTEXT.md#complete-application), an inquiry,
[agreed terms](../../CONTEXT.md#agreed-terms). The second kind is a
record of a transaction between two parties, and one party does not get to edit
it. [ADR-0006](0006-agreed-terms-are-copied-not-referenced.md) already made that
argument for money: agreed terms are a frozen copy rather than a foreign key,
because a later fee change must not rewrite what an enrolled family agreed to.

The failure to avoid is therefore not "the school deleted something". It is
**the school deleted something and a family's record quietly changed**: a
submitted application that used to list four classes now lists three, and nothing
anywhere says one was removed. That is the same harm ADR-0006 forbids, arriving
by a different route — through a delete rather than through an edit.

The alternatives considered and rejected:

- **Soft delete with a restore path.** A `deleted_at` column, a trash view,
  something to undo from. Rejected on two counts. It buys back a mistake that the
  confirmation screen already catches, and it pays for that with a second
  invisible state on every row and a `where deleted_at is null` that every reader
  has to remember — the same failure mode
  [ADR-0012](0012-synced-one-offs-live-in-their-own-table.md) refused for the
  sync. It also does not deliver what it appears to: the school's real "I want
  this back later" case is a course that returns next year, which is
  **[retirement](../../CONTEXT.md#retired)**, a visible state the office manages
  rather than a graveyard it has to be told about.
- **Blocking a delete whenever anything references the record.** Refuse to delete
  a person who teaches, or a course a family applied for, until the references are
  cleared. Rejected because it blocks precisely the cases the school most needs.
  A departure the office must act on today would sit behind four course
  reassignments; a cancelled class would stay on the catalogue because of
  paperwork the school cannot undo. It also mistakes what an application is: the
  reference is a record of what somebody chose, not a claim that the class still
  exists, so there is nothing to clear.

## Decision

**The school's own content is freely removable, and a record of what a family
sent is never silently changed by removing it.**

Both halves are load-bearing, and the second is the one that does the work. It
does not say a family's record blocks removal. It says a removal must not alter
what the record says, which is a requirement on the *readers* rather than a veto
on the delete.

From the first half: a **person**, a **course**, an **announcement** and a
**policy** each gain an unconditional delete. There is no floor on any list — the
school may empty its catalogue, its staff list, its announcements or its
policies, because a school between years is entitled to say so. The one floor
that stays is on admin accounts, and it exists for a different reason: it stops
the school locking itself out of its own site.

From the second half, three consequences that look unrelated and are not:

- **An application is never deleted**, and neither is an inquiry or a row of
  agreed terms. They are not the school's content.
- **A course delete was gated** — the gate is open, and the delete landed with
  [#267](https://github.com/wyattwsaint/pharos-academy-site/issues/267) — on the
  Applications screen and the
  [class tally](../../CONTEXT.md#class-tally) first being able to read an
  [offering](../../CONTEXT.md#offering) key the catalogue no longer has — naming
  it, marking it as no longer offered, and still counting it. Until they can, a
  delete does not remove a class from the catalogue; it removes it from what a
  family is recorded as having asked for. The gate is on the readers, not on the
  data.
- **A policy's versions outlive the policy.** An application stores its
  [agreements](../../CONTEXT.md#agreement) as text — `handbook=parent@3` — with no
  foreign key, so the document a family agreed to must still resolve after the
  policy row is gone.

And one that is a freeze rather than a survival: **an application keeps the class
titles it was submitted with**, captured once at submit and never updated. A later
rename would otherwise rewrite what the family was shown, which is the ADR-0006
argument applied to the catalogue instead of to money.

**No undo and no soft delete.** The safety net is a confirmation screen that names
the thing before it goes and says plainly that there is nothing to undo — the same
round trip removing a one-off already uses. Putting something back means typing it
in again.

### What this supersedes in ADR-0005, and what survives

ADR-0005 says *"Nothing can take an address down. There is no delete on the
admin's policy screens and no 'remove the document' control, because both would
break a link that is on paper."* That is now two claims wearing one sentence, and
only one of them holds.

**Superseded:** the implication that a policy row is permanent. A policy can be
deleted from the admin.

**Survives, and is the reason the delete is safe:** versions are retained, and
each has its own permanent immutable address. Deleting a policy removes the
policy row and nothing else — the `policy_versions` cascade is dropped, every
version row stays, and every versioned address goes on serving the same bytes
forever. The link on paper that ADR-0005 was protecting is the *versioned* one and
the *fixed* one; the versioned addresses do not move, and the fixed address is
restored by re-adding the policy at the slug it always had, with version numbering
continuing from the surviving rows so that no `slug@n` ever names two documents.
ADR-0005's two-addresses decision, its caching split and its append-only version
table are untouched.

## Consequences

- **The append-only stance is reversed where it overreached and kept where it was
  right.** It is not a site-wide property any more, and a reader can no longer
  infer from one screen how another behaves. This ADR is the line that decides:
  ask whether the record is the school's or the family's.
- **Two admin screens now say something false** and change with the code. Removing
  those sentences is not a copy tidy-up; it is this decision landing.
- **"Retired" is not in this ADR.** Retirement is a convenience, and it decides
  nothing about what may be removed — everything retireable is also deletable, so
  no rule above turns on it. It is defined in
  [`CONTEXT.md`](../../CONTEXT.md#retired) and nowhere else.
- **Sequencing is load-bearing, in two places and in opposite directions.**
  Course delete must ship *after* the unresolved-key readers, or a delete silently
  edits a submitted application. Policy delete must ship *after* the cascade is
  dropped, or a delete destroys retained documents. Both are the governing rule
  failing, not ordering preferences.
- **A course with no instructor becomes a valid state**, because clearing the
  reference is what makes a person deletable. It is independently wanted — a class
  can be scheduled before it is staffed — and every reader renders the absence
  rather than inventing a name, the structured data included.
- **Anyone reversing this owes an answer** to why the office should have to ask a
  developer to remove a duplicate instructor, and must say what happens to the
  applications that by then reference classes the catalogue no longer has.
