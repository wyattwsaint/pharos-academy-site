# ADR-0006 — What a family agreed to is copied, not referenced

**Status:** accepted
**Date:** 2026-08-06
**Context:** [#29](https://github.com/wyattwsaint/pharos-academy-site/issues/29), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18)

## Context

Every money figure on the site is read from one row — the **money settings** — so that a fee
raised in the admin is raised everywhere at once and no page can quietly go on quoting last
year's deposit. That is #29's first acceptance criterion and it is the whole reason the row
exists.

Its third acceptance criterion pulls the other way: "an existing enrolled record is not
rewritten by a later settings change". A family who applied in August at $100 a class owes
$100 a class, whatever the board does in February. The school is not going to send a parent a
bill that changed after they signed, and a site that could produce one is a site nobody at
Pharos should trust with money.

So the same numbers have to be *live* on the public site and *frozen* on an application, and
those are contradictory properties of one row.

Permissions are flat ([#16](https://github.com/wyattwsaint/pharos-academy-site/issues/16)), which
sharpens this. Either admin can change any fee, with no second signature and no role gate.
The only structural protection a family has is that the change cannot reach backwards.

The alternatives considered and rejected:

- **A foreign key from the application to the settings row.** The obvious normalised shape,
  and it produces exactly the failure the criterion forbids: the settings row is mutable, so
  following the key from an August application in February returns February's numbers. The
  application would silently re-price itself.
- **A foreign key to a *versioned* settings table, one row per save.** This works, and it is
  what a system with an audit requirement would do. Rejected on cost against benefit: it
  needs a second table, a version pointer on every application, and care at every read that
  the pointer is followed rather than the current row — three places to get right for a
  school that saves this row perhaps twice a year. The stamp is attribution, not an audit
  log (CONTEXT.md, "stamp"), and this project has consistently declined to build history
  where attribution is what is actually wanted.
- **Recomputing from a stored rate card on the application.** Half a copy. It freezes the
  rates and leaves the deposit, the registration fee and the deposit-credited flag live —
  and the flag is the one that moves the number most, being the difference between telling a
  three-class family they owe $1,300 and $900.

## Decision

**`agreed_terms` duplicates every money column, is written once, and is never updated.**

When a family applies, `recordAgreedTerms` **inserts** a copy of the current settings against
their name, with the date. Nothing in the codebase updates that row: there is no edit path
from the admin, no cascade from the settings row, and no foreign key that could carry one.
`saveMoneySettings` touches the settings row only.

The duplication is deliberate and the schema says so where a reader will trip over it.
"A change never rewrites what an already-enrolled family agreed to" is therefore a property
of the code rather than a promise about it — proved in `src/lib/money/store.test.ts` against
a real database, by saving a change and re-reading a record written before it.

The money admin screen tells the school this in the words that matter, on the confirmation
screen, immediately under "this affects every family": families who have already enrolled
keep the terms they agreed to. That sentence is what makes the change safe to make at all.

## Consequences

**Good.**

- A fee change cannot reach an enrolled family, structurally rather than by care.
- The settings row stays free to change, which is what makes acceptance criterion 1 possible:
  the public site can read one live row without that row being load-bearing for anybody's
  existing agreement.
- What a family agreed to is answerable as a document — one row, all of it, with a date —
  rather than as a reconstruction.

**Bad, and accepted.**

- The money columns are written out twice, in two tables. A new money setting has to be added
  to both, and the mapping functions in `store.ts` are the one place that is enforced.
- There is no history of the settings row itself. "What was the deposit last March?" is
  answerable only through whatever applications were taken that March. The school has not
  asked for the former, and the stamp says who last changed it.
- Two families applying either side of a change hold different terms, correctly, and any
  future reporting has to read each application's own numbers rather than the settings.
  Nothing reports on money yet, so this is a constraint on work not yet written.
