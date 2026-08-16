# ADR-0022 — A deleted policy leaves its name behind, and only the export reads it

**Status:** accepted; built by
[#269](https://github.com/wyattwsaint/pharos-academy-site/issues/269)
**Date:** 2026-08-15
**Context:** [#252](https://github.com/wyattwsaint/pharos-academy-site/issues/252),
following [#260](https://github.com/wyattwsaint/pharos-academy-site/issues/260)
**Amends:** [ADR-0021](0021-the-schools-content-is-removable-a-familys-record-is-not.md) —
which rejected soft delete, and which this does not undo

## Context

[ADR-0021](0021-the-schools-content-is-removable-a-familys-record-is-not.md) made
a policy deletable and its versions permanent in the same breath: an application
records `handbook=parent@3` as text, so the document a family agreed to has to
resolve after the policy row is gone.

That leaves the [export](../../CONTEXT.md#export) holding files with no parent.
It ships every version row as its own table and builds its policies list from the
policies themselves, so a deleted policy's PDFs arrive under a slug nothing else
in the archive mentions. The export exists to answer "can the school get its
content back without asking anyone", and a board member opening the ZIP to find
documents they cannot identify — or attribute an agreement to — is a worse answer
than the question deserves.

Nothing on the site needs this. The policy is off the policies page and out of the
admin, which is what deleting it meant. It is the archive, and only the archive,
that has a reader left.

The alternatives considered and rejected:

- **Derive the name from the version rows.** They carry a slug, a number and a
  filename, and no title — the title lived on the policy row and went with it.
  Deriving a title from the slug is inventing one.
- **A title column on `policy_versions`, written at upload.** Puts the name where
  the orphan is, at the cost of recording the title the policy had when the file
  was uploaded rather than when it was deleted, and of a backfill across a table
  that is otherwise append-only and never updated.
- **Soft-delete the policy after all.** Exactly what ADR-0021 refused, and for
  reasons that still hold: a second invisible state on the live table, and a
  `where deleted_at is null` that every reader of the policies page, the admin and
  the file routes has to remember.

## Decision

**A policy's delete copies its title and slug into a table of its own, and the
export is the only reader.**

- The record is **two facts and a date** — not a copy of the row. The description,
  the position and the "parents sign this" tick describe a policy the school is
  publishing, and it is not publishing this one.
- It is written **only when there is a version to orphan**, so "a policy with no
  document deletes with nothing left behind" (#260) stays literally true.
- It is written **before** the delete, by the same statement that reads the title
  off the row it is about to remove. neon-http has no interactive transaction, so
  a failure in the gap leaves a name for a policy that is still there — and every
  read is filtered against the live table, which makes that state inert. The other
  order would leave an orphan with no name, which is the state this removes.
- It carries no meaning for the site. The policies page, the admin and the file
  routes are untouched: no reader outside `buildExport` joins against it, so
  ADR-0021's objection to soft delete — a null check every reader has to remember
  — does not arrive with it.

**The word in the archive is "retired".** It is [#269](https://github.com/wyattwsaint/pharos-academy-site/issues/269)'s
own word for the entry, and it is not the site's
[retired](../../CONTEXT.md#retired) — a course or a person the school expects
back, reversible in one press and listed in the admin meanwhile. A deleted policy
is on no screen at all, and re-adding it is typing it in again
([#268](https://github.com/wyattwsaint/pharos-academy-site/issues/268)) rather
than undoing anything. The two meanings live in
different places and never appear on the same screen; `CONTEXT.md` says so at both
ends. Anyone who finds that too fine a distinction should rename the table and its
JSON key to *deleted* — the export's acceptance criterion asks only that the entry
be marked plainly as no longer part of the policy set.

## Consequences

- **Every document in the export is attributable**, live policy or deleted one,
  and a test asserts the property rather than the case.
- **A re-created slug needs no cleanup.** The filter against the live table means
  a name for a slug something holds again is not read at all.
- **The name survives longer than the school's decision to delete.** Whoever opens
  the archive learns that a policy existed and was dropped. That is deliberate:
  the documents are there either way, and the archive should not be coy about
  whose they were.
- **This is the first tombstone on the site.** If a second content type ever needs
  one, it needs this argument again — a reader outside the admin that would
  otherwise hold an orphan — not a precedent.
