# Pharos Academy — domain context

The vocabulary this project uses, and means precisely. When an issue title, a
test name, a type or a piece of UI copy names one of these concepts, it uses the
term as defined here — not a synonym. Where a term has a tempting near-synonym
that means something else, the entry says so.

This file is read before exploring the codebase (`docs/agents/domain.md`).
Decisions that constrain the build live in `docs/adr/`; the reconciled build
plan lives on [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18).

## Glossary

### day track

One of the four weekday streams the school runs — **Monday, Tuesday, Wednesday,
Thursday**. A day track has its own first-class date each semester, its own week
count and, critically, **its own week numbering**: the four tracks do not align,
because each skips only its own holidays. Week 10 of the 2026–27 fall semester
is 9 Nov on the Monday track and 4 Nov on the Wednesday track, and both are
correct.

A day track is not a "day of the week" in the calendar sense — it is the school's
own unit of scheduling, and a year in which a track has **no first-class date and
no courses is complete, not incomplete**. The Tuesday track is routinely empty.

Not: "cohort", "stream", "class day".

### enrolment unit

What a course actually sells. One of four:

- **Year** — both semesters.
- **Fall** — the fall semester only.
- **Spring** — the spring semester only.
- **Block** — a dated run shorter than a semester, starting on a real meeting
  date of that course's day track; the end date is computed from the block
  length.

Each course ticks the units it offers, so the site can never present a family
with a semester the school does not sell. The enrolment unit is the thing being
bought; it is **not** the same as the course, and two families in the same course
may hold different enrolment units.

Note the British spelling — "enrolment" is the term, used consistently.

### offering

A **course** paired with an **enrolment unit** — the concrete thing a family
selects and pays a deposit against. "Nineteen courses" is the catalogue;
"offerings" is what the application flow actually operates on, because *Latin I,
Fall* and *Latin I, Year* are two different purchases of one course.

Not: "product", "SKU", "enrolment" on its own.

### clash

Two selected offerings whose meeting times overlap **and** whose terms are known
to overlap. A clash is a fact: the family cannot attend both, and the application
says so plainly.

Overlap is real overlap, not adjacency — Monday's *God Made Everything*
(9:00–10:30) and *Principles of Drawing* (10:10–11:10) clash by twenty minutes.
And term overlap is part of the test: two courses sharing a time slot do **not**
clash if one is Fall and the other is Spring.

The Wednesday 10:40 slot carries five electives by design. That is
oversubscription, not a clash, and is never reported as one.

Not: "conflict", "collision", "double-booking".

### possible clash

A deliberate third state, distinct from both *clash* and *no clash*. Two
offerings share a time slot, but at least one is a **Block** whose start date the
school has not set yet, so whether their terms overlap is genuinely **unknown**.

The family is told the clash is *possible* rather than certain. The alternative —
collapsing the unknown into either answer — is a site that either invents a
collision or hides one.

| terms overlap | severity |
| --- | --- |
| yes | `clash` |
| unknown | `possible clash` |
| no | none |

### payment slot

The third of the application's four stages — Statement of Faith gate → class
selection → **payment slot** → confirmation. It is **empty at launch**: the
school takes cheques, and the stage is a reserved seam, not a stub to be filled
in later by guesswork.

It was verified empty by driving it: flipping it live in the prototype changed
exactly one thing — the next submission read `paid online` instead of
`awaiting cheque`. No other state, screen or flag moved. That is what makes it a
slot rather than a hole.

*Applied* and *paid* are separate states on separate axes. An application is
`submitted` while its payment is `awaiting cheque`, then `overdue`, then
`received`; none of those changes the application's own state.

### editable set

The complete, closed list of things Jill and George can change from the admin,
and therefore the complete list of things that need a store:

**Courses · Policy documents · School year and events · People · Announcements ·
School details · Money settings.**

The seam is **authored-by-me vs editable-by-them**. Page copy authored in the
repo — the Pharos etymology essay, the core values, the H.O.P.E. explanation,
the Statement of Faith body — stays in git as `.astro` and is *not* in the
editable set. There is **no second seam inside the editable set**: everything in
that list is equally theirs.

Anything not on the list is not editable, and adding to it is a decision, not an
implementation detail.

### H.O.P.E.

**Helping Our Parents Educate** — the school's own acronym, real copy from the
existing site, not invented for this build. It appears as a gold `H O P E` row on
the navy band of the homepage, where each letter opens an illustrated card.

Always set with the periods when written as the acronym in prose (`H.O.P.E.`);
the homepage sets the four letters spaced as a display device (`H O P E`), which
is typography, not a second spelling.
