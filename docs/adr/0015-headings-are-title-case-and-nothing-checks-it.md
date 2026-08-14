# ADR-0015 — Headings are title case, and nothing checks it

**Status:** accepted
**Date:** 2026-08-13
**Context:** [#210](https://github.com/wyattwsaint/pharos-academy-site/issues/210), reverses part of
[ADR-0011](0011-the-punctuation-house-style-is-counted-not-chosen.md)

## Context

ADR-0011 settled the site's punctuation by counting what the site already did, and the
count said sentence case: "Our mission and vision", "Where we meet", on every page except
Admissions and the staff page. `punctuation.ts` encoded that as a rule, and the audit
reported the two pages that disagreed as findings.

Counting is a good way to settle a mark. It turned out to be a poor way to settle a heading,
for one reason the count could not see: the two dissenting pages are Admissions and the staff
page, which is to say the two pages a prospective family reads before any of the others. The
"minority" style was in the shop window. A visitor did not experience a site in sentence case
with two exceptions; they experienced a site that could not decide, sometimes within one
scroll.

The alternatives:

- **Apply the audit's findings and sentence-case Admissions.** What ADR-0011 pointed at, and
  it settles the inconsistency in the direction the count chose. Rejected on #210: title case
  is what the marketing surfaces already used and the stronger register for a school
  presenting itself.
- **Keep both, and call the split deliberate** — title case on marketing pages, sentence case
  in the admin. Rejected: it needs a rule about which pages are which, and the boundary
  (Current Families? the application?) is exactly where the ambiguity would live.
- **Invert the scan** — keep the machinery, flip it to report sentence-case headings.
  Rejected, and this is the substantive half of this ADR. See below.

## Decision

**Every heading the site writes for itself is title case, Chicago.** `<h1>`–`<h3>`, card and
block titles, and `<legend>`; public pages and admin under one rule. The long form is in
`docs/house-style.md`, the glossary entry is **heading case** in `CONTEXT.md`.

**Headings that read as sentences were retitled before being cased.** Title-casing a
sentence produces a headline generator — "Tell Us Your Children's Ages." — so eighteen
headings became label-like noun phrases first: "Your Children’s Ages", "Where the Times
Clash", "Not Included". #210 proposed "Conflicting Answers" for the third of those; it names
a **clash**, which is a fact about the timetable rather than about the answers, and *conflict*
is a synonym `CONTEXT.md` rules out by name. Two headings were left exactly as they were,
because their sentence *is* the point:
"Mornings here. Afternoons yours." on the home page, and "This affects every family." on the
money screen, which is a warning rather than a section label.

**The capitalisation rule is deleted, not inverted, and nothing replaces it.** A sentence-case
check is decidable from shape alone: a lowercase ordinary word mid-heading is evidence, and
the exceptions fit in two named lists. A title-case check is not. It has to know that "Fit" in
"the Right Fit for Your Family" is a noun and stays capitalised, that "the" is an article and
does not, and that "Is" in "Is Pharos the Right Fit" is a verb — which is a dictionary and a
part-of-speech reading, and the false findings would outnumber the real ones until the office
stopped reading the report. `headingCase`, `sentenceCase` and their word lists are gone from
`src/lib/punctuation.ts`.

**Nothing title-cases at render time either.** An algorithm applied to `{course.title}`
lowercases "Spanish" in *Basic Spanish Conversation for Beginners* and fights the editor who
typed it. This is a one-time sweep of literals, and ADR-0011's "a name is not a heading"
survives intact: database copy keeps the case the school gave it.

## Consequences

**Good.**

- One rule, so a new page has one answer rather than a judgement about which half of the
  site it belongs to.
- The marks, the spacing and the links — the rules that *are* decidable — keep their scan, and
  the audit stops carrying a section whose findings nobody was going to act on.
- The retitling is the larger win of the two: "The rest of About" and "What is not in it" were
  weak headings in either style.

**Bad, and accepted.**

- This is the first house-style rule with nothing behind it but prose. It will drift, and the
  thing that catches the drift is a person reading a diff. That is the trade #210 named
  explicitly and it is the honest one — a wrong linter is worse than none.
- ADR-0011's central claim — the style is counted, not chosen — no longer holds for headings.
  It still holds for every other rule in `docs/house-style.md`, and the count that produced
  them is unchanged.
- `docs/punctuation-audit.md` is a hand-regenerated snapshot; its capitalisation section
  describes a rule that no longer exists and will be gone at the next sweep.
