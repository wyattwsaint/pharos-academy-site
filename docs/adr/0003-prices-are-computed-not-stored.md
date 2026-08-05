# ADR-0003 — A course's price is computed, never stored

**Status:** accepted
**Date:** 2026-08-05
**Context:** [#22](https://github.com/wyattwsaint/pharos-academy-site/issues/22), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §2

## Context

The live site publishes each course's cost as typed text, in nine hand-maintained
artefacts — three HTML pages and six PDFs. They have already drifted from one another on
ages, days and texts. Price has not drifted **yet**, which is luck rather than design: it
is the same figure typed nine times.

The school charges by the hour at two rates, `$10/hour` and `$15/hour` for high-school
credit, and every one of the nineteen published costs is *exactly* contact hours × its
rate. Contact hours are themselves derivable: weeks × meetings a week × the length of a
meeting. Algebra 1's published 56 hours is 28 weeks × 2 meetings × 1 hour, and its
published $840 is 56 × $15.

## Decision

The `courses` table has **no price column and no contact-hours column**. It stores the
meeting times, the week count, the day tracks and a **rate tier by name**; `pricing.ts`
computes the figure, and every surface prints the computed one.

`pricing.test.ts` recomputes all nineteen and compares them against
`docs/mirror/data/courses.json` — the capture of what the school publishes today — rather
than against a fixture written beside the test.

## Consequences

- **The nine artefacts cannot disagree about money**, because there is one figure and it
  is derived from the two facts a person actually edits: the time and the weeks.
- **A course's price cannot be typed wrong.** Changing the meeting time changes the price,
  which is correct — the school charges for the hour.
- **The rate card is one module.** The two rates live in `RATE_PER_HOUR`; the course names
  its tier. Raising a rate is one edit.
- **The formula stopping being true is a test failure, not a silent wrong number.** If the
  school ever prices a course off-formula — a discount, a flat fee, a scholarship rate —
  the suite says so on the next run, and that is the moment to add a deliberate override
  column rather than to discover the divergence from a parent.
- Admin editing of courses, when it arrives, edits *times, weeks and tier* and never a
  price field. That is a constraint on a screen that does not exist yet, and it is the
  point of writing this down.
