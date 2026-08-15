# ADR-0009 — The application gates on answers, never on agreement

**Status:** accepted
**Date:** 2026-08-10
**Context:** [#86](https://github.com/wyattwsaint/pharos-academy-site/issues/86), implemented by
[#85](https://github.com/wyattwsaint/pharos-academy-site/issues/85), builds on
[#71](https://github.com/wyattwsaint/pharos-academy-site/issues/71)
**Supersedes:** the "no submit is disabled" clause of [#31](https://github.com/wyattwsaint/pharos-academy-site/issues/31) AC 7

## Context

The application form accepts submissions it should not. A family can reach the bottom of the
page and send an application in which nobody has answered a single Statement of Faith
question and neither the Code of Conduct nor the Handbook question has been touched. Those
answers are the reason the questions are asked: an application that arrives with all nine
faith cells and both agreements blank tells the school nothing, and Jill collects them
afterwards by email — which is the work the form was built to remove.

The form is also silent until the end. Everything wrong with it is reported after **Send the
application** is pressed, on a re-render from the top, so a family lands on a banner rather
than on the empty box, at the far end of a document that runs through the Statement, the
picker and the totals.

The obvious fix — grey the button until the form is complete — collides with a rule this
project deliberately holds. #31 AC 7 forbids a scroll-gate, and the e2e test that enforces it
makes the strongest DOM-level claim available: **no submit on this page is disabled, ever**.
That claim was never the decision; it was the cheapest way to prove the decision at the time.
Left as written it forbids every gate, including one that has nothing to do with scrolling.

The alternatives considered:

- **Leave the form ungated and improve the errors only.** Honest about the accessibility risk,
  and it leaves the actual complaint — blank applications reaching the school — unfixed. The
  emails to collect the missing answers continue.
- **Gate on agreement.** Require a "Yes" on the faith questions and an agreement to both
  documents. This is a different school. It turns the form from a conversation-starter into a
  doctrine test, and it deletes the flag's whole purpose — an objection that cannot be
  submitted is never read. **Rejected, and it is not a variation on this decision: it is a
  separate one, and it would have to be made with Jill, in the open, with the ADR that says
  so.**
- **Use `disabled` on the button.** The literal reading of "greyed out", and it removes the
  button from the tab order, so the keyboard and screen-reader users least able to find the
  missing field are the ones who cannot reach the control that would tell them. Rejected.
- **Require every column of the faith grid.** Blocks a single-parent household on a column
  that will never be filled. Rejected: one respondent's column is the requirement.

## Decision

**The application gates on having answered, never on what was answered.**

A form is complete when it has a family name, an email address that looks like one, at least
one child with a name and an age, at least one class chosen, **one full column of the
Statement of Faith grid answered by any one respondent**, and an answer to **every askable
agreement** — every document the school has actually published. **Send the application** is
greyed until then, and beside it a live list names what is still missing, each item a link to
the control it is about.

"No" passes. "Neither agrees" passes. An objection typed into the free-text box passes. All of
them still route the application to a conversation exactly as they do today, and nothing in
the gate can turn a disagreement into a validation failure.

The button is greyed with `aria-disabled`, not `disabled`, so it keeps its place in the tab
order: a keyboard or screen-reader user reaches it, activates it, and is told what is missing
and taken there.

**What this supersedes.** The "no submit is disabled" clause of #31 AC 7 — the
operationalisation, not the criterion. `disabled` remains absent from every submit on the
page, so the assertion survives as written; what changes is that it is no longer the whole
proof, because a greyed `aria-disabled` button would now pass it.

**What this deliberately preserves.**

- **There is no scroll-gate** (#31 AC 7 itself). Nothing is hidden, nothing waits on the
  Statement's disclosure being opened, and the children's section is visible and editable from
  the first paint. The gate reads answers, never scroll position or reading time.
- **The Statement of Faith is disclose-and-discuss** (#31 AC 6). A "No" is never an error,
  never appears in `errors`, and never blocks a send.
- **The children's sensitive data does not enter the site** (ADR-0007). A gate is a reason to
  ask for more; this one asks for nothing that is not already on the form.

**Where the rules live.** The pure rules move to `src/lib/application/validation.ts`, a leaf
module importing the shared email check and `agreements.ts` — itself a leaf — and otherwise
only types.
`validateApplication` keeps its name, its signature and its home, by re-export from
`application.ts`. The reason is bundle weight: the page's browser script runs these rules as
the family types, and importing them from `application.ts` would pull the rate card, the
catalogue, the timetable and the Statement into the browser to discover that a text field is
empty. `validation.test.ts` asserts the import graph, so the saving cannot be undone by
accident.

## Consequences

**Good.**

- An application that reaches the school has the answers the school asked for. The follow-up
  email to collect them stops being routine.
- A family finds out what is missing while they are still in the section it is missing from,
  and a greyed button is an instruction rather than a dead end.
- The gate is legible: everything it requires is a field being non-empty, and the reader who
  wonders "could this ever refuse an objection?" can see that it could not.
- The rules are one small module, so the server and the browser run the same ones rather than
  two copies that drift. Nothing is stored between evaluations — there is no "checked" flag and
  no "valid" flag — so editing a class after a passing check cannot leave the button lying
  about the form.
- A refused send — greyed button with scripting on, round trip with scripting off — puts focus
  on the thing that needs attention. Both paths walk the same rows and the same documents, so
  they land in the same place.
- The flag keeps meaning what it meant. `isFlagged` is untouched: it still flags on any "No"
  and on any objection, and still does not consult the agreements. The gate did not fill that
  queue with routine cases.
  **Superseded by [ADR-0020](0020-yes-or-no-replaces-who-agrees.md):** `isFlagged` now reads the
  agreements, and a **No** to a document flags. The gate above is untouched by that — flagging
  is not refusing, and a **No** still sends.
- A policy the school has not published produces no question and therefore no requirement. The
  gate always matches the form the family was shown.

**Bad, and accepted.**

- A greyed button is a refusal, and some families will meet it. The live list and the links
  are what keep it from being a wall, and they are load-bearing rather than decoration — if
  they regress, this decision is worse than what it replaced.
- `aria-disabled` needs the click handler that `disabled` gives free: the button stays
  clickable and has to answer for itself. That is code with a failure mode.
- The gate now has two implementations to keep honest — the browser's and the server's, for
  scripting-off. The shared leaf module is what makes them the same rules; a rule added to one
  and not the other is the regression to watch for.
- A family who wanted to leave the Statement of Faith questions alone entirely can no longer
  send an application. That is the decision, and "Not answered" in all nine cells is no longer
  a way through. Answering "No" to all three is.
- Two of #31's end-to-end tests described the old behaviour and were rewritten rather than
  deleted. They are the ones to read if this decision is ever revisited.
- **Any future request to require a "Yes"** — on an article, on the Code of Conduct, on the
  Handbook — is a reversal of this decision and must be taken as one. It would turn a
  conversation-starter into a doctrine test, and the argument would be about what the school
  wants to be rather than about what the form should validate. **Reopen this ADR rather than
  tightening the check.**
