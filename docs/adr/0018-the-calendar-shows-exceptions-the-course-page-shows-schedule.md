# ADR-0018 — The calendar shows what is exceptional and the course page what is routine

**Status:** accepted
**Date:** 2026-08-14
**Context:** [#215](https://github.com/wyattwsaint/pharos-academy-site/issues/215),
[#233](https://github.com/wyattwsaint/pharos-academy-site/issues/233),
[#234](https://github.com/wyattwsaint/pharos-academy-site/issues/234),
[#235](https://github.com/wyattwsaint/pharos-academy-site/issues/235),
[#236](https://github.com/wyattwsaint/pharos-academy-site/issues/236),
[#237](https://github.com/wyattwsaint/pharos-academy-site/issues/237)
**Reverses:** question 4 of
[#186](https://github.com/wyattwsaint/pharos-academy-site/issues/186)

## Context

A family has two questions about the school year, and the calendar page answers
one of them badly and the other not at all.

**"What is happening in October?"** The month grid
([#186](https://github.com/wyattwsaint/pharos-academy-site/issues/186)) answers
this, and it is the half that works.

**"On which dates does my child's course meet?"** A parent asks this in August,
when the year is being planned around. The only public answer is the two
semester sheets at the top of the same page — week rows, **day track** columns,
and nothing in the cells but dates. To use one, a parent must already know that
*Art* is a Wednesday-track course, find the Wednesday column and read
twenty-eight dates down it. **The sheet never says the word "Art".** It answers a
question about a day track to a parent who asked a question about a course, and
it demands a piece of knowledge that page gives no way to get.

The course page — where the parent already is, and where the course is named —
shows no dates at all.

Two more problems follow from one page trying to be two things. The sheet and the
grid are presented as peers, so the page reads as two schedules that might
disagree and needs a test proving they cannot. And print keeps the sheet and
drops the grid, so a school office pins up a table of week numbers with no events
on it, while the **one-offs** — the fundraisers, the picture days, the open
houses — are on the half print hides.

## Decision

**The calendar shows what is exceptional; the course page shows what is
routine.**

A **one-off** and a **closure** print in their month cell, readable without
touching anything, because each is news: it happens once, and no parent can
derive it from anything else on the page.

A **meeting** of an **offering** sits behind a labelled trigger on its date,
because it is the same fact restated every week of a term. Pressing the trigger
lists what meets that day, grouped by time slot, each offering linking to its
course page.

The whole list of a course's meeting dates belongs on the **course page**, where
the course is named — a summary line a parent reads at a glance (*"28
Wednesdays, 9 Sep to 20 May"*), with the dates grouped by month behind a
disclosure. That answers the August question without the parent ever needing to
know which **day track** the course is on, which is the sheet's whole failure.

The two public semester sheets are deleted.

Nothing here is stored that is not stored today. The meetings, the closures and
the semester spans are still computed from the eight numbers on the School Year
screen.

## What #186 decided, and what happened to each of its reasons

#186 asked, as the fourth of its grilling questions, whether the classes go on
the grid and at what grain. It answered **"Not at all"**, and its scope note put
the same thing the other way round: "No **offering** names, no counts, and no
links from a cell to the by-day timetable." That is the decision this record
reverses, and it rested on two reasons.

**Density.** Five electives share the Wednesday 10:40 slot by design, so one
November Wednesday carries five or more entries — either the most useful thing on
the page or the thing that makes it unreadable. This reason was sound and it is
**answered rather than dropped**: a teaching date reveals what meets on it
instead of printing it, so the November Wednesday carries one control and not six
lines. Density was always an argument against *printing* offerings, and printing
them is not what is now decided. It stands, unchanged, against anything that
proposes to.

**Restatement.** The sheet on the same page already printed every meeting date,
so a grid naming what meets would be a second drawing of one fact — and #186's
acceptance criteria included a test that the two sections cannot disagree.
**This reason turned out to be false.** The sheet never named a course. It held
day track columns of dates, usable only by a parent who already knew the track,
so it was never stating the same fact as a cell that names *Art*; it was a
different, worse answer to a different question. Once that is seen, the test
proving the two halves agree is proving that two things which never said the same
thing still do not, and the sheet has no job left.

The reversal is therefore narrow, and worth stating as one line for whoever
reopens this: **density stands and restatement falls.**

## Week numbers leave the public site

A calendar month grid has one row per calendar week, and four **day tracks**
number that week four different ways — week 10 of the 2026–27 fall semester is 9
Nov on the Monday track and 4 Nov on the Wednesday track, and both are correct.
There is **no honest place on the grid to print one**.
`src/lib/calendar/months.ts` says so in its own header comment: the thing that
makes the tracks hard "has nowhere to land here and does not try to". #186 kept
the sheet for precisely that, and with the sheet deleted the week number has no
public surface left. It is not given a new one.

**The concept stays in the glossary, because the computation still needs it.**
Each track's week count is one of the eight numbers the year is built from; a
closure is what makes the four numberings diverge; the numbering itself is what
the derivation produces on the way to a list of dates. Retiring the word would
leave the code with no name for something it computes.

**The subscribed feed keeps its week numbers, and that is not an exception.** A
feed entry names its track — "Pharos Wednesday — Week 10" — so exactly one
numbering applies and the number means something. The grid's problem is that one
row has four. `calendar.ics` is unchanged in content and in shape.

If a course description ever wants to say "week 10", the number belongs on the
course page beside the course, not on a month grid.

## The admin School Year preview stays

The four-column preview on the admin School Year screen — Week down the side,
the four **day tracks** across, computed in the browser from the form as it is
typed — is **deliberately kept**. The deletion reaches the public page only, and
the test covering the preview is the guard that it did not reach further.

It is a different artefact for a different reader. Jill has just typed eight
dates, two week counts and a list of closed days, and her question is whether
they produce the dates she meant. That question **is about day tracks**: it is
answered by setting the four numberings side by side, where a closed Monday
costing the Monday track a week and the Wednesday track nothing shows up as the
columns going out of step. A day-track table is the wrong answer to a parent's
question and the right answer to hers.

The public sheets fail because they answer in a vocabulary their reader does not
have. The admin preview succeeds because its reader asked in that vocabulary.

## Rejected: showing one month at a time

#215 proposed drawing one month at a time — a dropdown, prev/next arrows, a
`<details>` per month, or `?month=2026-11` — instead of every month of the year
stacked down the page.

Rejected. **The grid's gain over a list was never that it was shorter; it was
that adjacent months can be compared.** A parent who sees that October is quiet
and May is busy is reading two months against each other, and that is the one
thing three lists of dates could never give. Showing one month at a time hands
that back and leaves a list wearing a grid's layout.

Two further costs, each sufficient alone. Every month renders today with no
JavaScript, so hiding eleven of them makes JavaScript load-bearing for the page's
main content unless the hiding is done some other way. And `#events` is what the
`Event` structured data points at and what a bookmark holds; if the section
becomes one month, a link into it lands on whichever month happens to be
selected.

Recorded here because it is the part most likely to be proposed back.

## Consequences

- **The course page has to land before the sheets go.** Until a course page
  answers "when does this meet", deleting the sheets removes the only public
  answer to the August question —
  [#233](https://github.com/wyattwsaint/pharos-academy-site/issues/233) before
  [#237](https://github.com/wyattwsaint/pharos-academy-site/issues/237).
- **Print inverts.** The printed page becomes the year as a two-column dated
  list, month by month, each line a date and what is on it, with consecutive
  closures sharing a name folded into a range — the shape of the annual calendar
  the school maintains by hand. It carries the one-offs, the **synced** ones
  ([ADR-0012](0012-synced-one-offs-live-in-their-own-table.md)) included, which
  the sheet never had; it carries no offerings and no week numbers. The e2e
  assertion that the sheet survives print is inverted rather than removed
  ([#236](https://github.com/wyattwsaint/pharos-academy-site/issues/236)).
- **Nothing revealed on screen is hidden on paper**, because paper cannot be
  pressed. A one-off's note is the single exception: prose in a two-column list
  is what would break the page.
- **The `#fall` and `#spring` anchors go with the sheets.** Nothing on the public
  site links to them. `#events` is untouched, so the structured data and any
  bookmark still land where they did.
- **The structured data is unchanged.** Offerings get no `Event` markup: a search
  result claiming "Art, 4 Nov" is a wrong-shaped claim about a thing families
  enrol in for a term. If offerings ever want markup it is `Course`, on the
  course page, and it is a different ticket.
- **The test that the two halves of the page agree is deleted** with the sheet it
  compared against. What takes its place is that the course page presents the
  dates the meeting computation returns, so a second implementation of the same
  dates is still caught.
- **`quiet` needs a new name.** The month view model's class means *this cell
  carries nothing*; under this decision the word wants to mean *this cell carries
  classes it is not printing*. Two meanings and one name — rename rather than
  overload.
