# ADR-0025 — The application link is a bearer link with a life

**Status:** accepted
**Date:** 2026-08-28
**Context:** [#317](https://github.com/wyattwsaint/pharos-academy-site/issues/317),
[#310](https://github.com/wyattwsaint/pharos-academy-site/issues/310) story 14,
[#313](https://github.com/wyattwsaint/pharos-academy-site/issues/313)
**Relates to:** [ADR-0024](0024-the-site-captures-family-contact-info.md), which decided *what*
the site captures. This decides *who can reach it, and for how long*.

## Context

[#31](https://github.com/wyattwsaint/pharos-academy-site/issues/31) built a form that opens
pre-filled from an inquiry: `/admissions/apply?inquiry=<id>`. [#313](https://github.com/wyattwsaint/pharos-academy-site/issues/313)
added the phone number to what it carries. Until now that URL had exactly one sender — the
admin's inquiries screen, where Jill copies it into a reply she is already writing to a family
whose address she has already read. A handful of ids, sent deliberately, one at a time.

Story 14 of #310 asks for something else: *"as a parent who inquired first, I want my phone
number prefilled when I follow **the quiet application link**"* — the link in the family's own
confirmation email. That email goes to **every** inquirer, automatically, whether or not anybody
ever replies to them. Honouring the story means the id stops being a thing staff hand out and
becomes a thing the site broadcasts.

The id is a v4 uuid (`inquiries.id`), so it cannot be guessed or enumerated. What it opens is a
form filled with one household's name, email address, phone number and children's ages. It reads
nothing else from the row — not the message the family wrote — and it authenticates nothing: it
opens no existing application, reaches no other inquiry, and confers nothing on the admin. But
it is a bearer credential in an email, and email is forwarded.

The alternatives considered and rejected:

- **Don't put the id in the email.** The status quo, and it keeps the id in staff hands.
  Rejected: it abandons a story the school asked for, and it is a smaller safeguard than it
  looks — the same id already travels by the same medium in Jill's replies, so this widens an
  existing exposure rather than opening a new class of one. The family whose details are at risk
  is the family the email is addressed to, and the data is what they typed an hour ago.
- **A never-expiring link.** Simplest, and defensible on the grounds that a uuid is a uuid.
  Rejected: it makes the exposure permanent. A confirmation forwarded to a relative two years on
  still opens a working form full of that household's details, and nothing in the system can
  ever withdraw it.
- **A single-use link, dead once an application is submitted from it.** The tightest option.
  Rejected: it needs a column and a migration on a database where Preview, Production and
  Development are one endpoint, and it prevents a failure nobody has described — a family who
  applies does not re-follow the link, and one who abandons the form halfway would be locked out
  of their own prefill by it.
- **A lifetime that depends on which sender emitted the link.** Jill's paste always works, the
  email's copy dies. The most *useful* behaviour and much the worst design: it puts a security
  property in the sender's hands, and makes "does this link still work?" unanswerable from the
  id alone.

## Decision

**The application link is a bearer link, it is sent to every inquirer, and it stops working 90
days after the inquiry was received.**

Concretely:

- The confirmation email's closing line points at the pre-filled form and **names the prefill**
  rather than springing it: a family who clicks and finds their own phone number already typed
  either delights or flinches, and the sentence decides which.
- **The lifetime is computed, not stored.** `getInquiry` compares against the `received_at` the
  row already carries. No column, no migration, no backfill.
- **One rule, both senders.** The check lives in the single reader, so the link the school
  pastes obeys the same clock as the link the family was sent. Staff cannot mint a link that
  outlives the rule, and do not have to know they can't.
- **An expired link and an unknown one are the same state**, and the form says so in one line
  instead of opening silently blank. Distinguishing them would mean a third answer from
  `getInquiry` to change nothing the family does.
- **The admin stops printing an expired link.** Its only purpose is to be pasted; a link that
  will hand the family an empty form is worse than no link, because Jill sends it believing it
  works and finds out when the family tells her the form was blank.
- The link remains **a copy, not a join**. Following it fills the form and records nothing; an
  application still does not say which inquiry it came from. That is a real gap and it is a
  separate ticket, not a rider on this one.

  **Amended by [#319](https://github.com/wyattwsaint/pharos-academy-site/issues/319).** That
  ticket was opened and the gap is closed: an application now carries the id of the inquiry it
  was filled from. This is the promise this bullet made rather than a reversal of it, and it
  changes nothing about the link itself — the same bearer id, the same 90-day life, the same
  single reader. What it adds is a nullable column written **only when the link actually
  opened**: an expired or unknown id opened nothing and is recorded as nothing, which keeps
  "this form was filled from that inquiry" the one thing the column can mean. See the column's
  own doc comment for that argument, and the **application link** entry in `CONTEXT.md`.

**90 days is the school's number, not the code's.** A shorter or longer window is a change of
constant and its test — reopen this ADR only to change the *design*: to remove the expiry, to
make it single-use, or to let the two senders diverge.

## Consequences

**Good.**

- A family who already knows they want to apply does not retype what they sent an hour ago,
  which is the story, and it no longer depends on Jill replying first.
- The exposure is bounded rather than permanent. A forwarded confirmation is a working link for
  a season, not forever.
- "Is this link live?" is answerable from the id alone, on the screen where links are picked up.
- The email stops pointing families at the wrong page. `APPLY_PATH` was `/admissions` — the page
  describing *how applying works* — because the flow was unbuilt when the line was written; it
  has been built since #31 and the sentence has been quietly stale ever since.

**Bad, and accepted.**

- **A four-month-old inquiry becomes un-prefillable, for staff too.** Jill working an old lead
  retypes or asks. That is the cost of one rule, and the alternative was two rules and a
  security property nobody could see.
- Every inquirer's mailbox now holds a bearer link. The count of live ids in the world goes from
  "the ones Jill replied to" to "all of them", and the volume is the genuine change here even
  though the class of risk is not.
- A family who mangles the link — a mail client wrapping the uuid across a line — is told their
  link may have expired when it never existed. One state, one line, and the wording avoids
  asserting an age it cannot know.
- The monthly backup ZIP is unaffected: it carries the rows, and the ids were always in them.
