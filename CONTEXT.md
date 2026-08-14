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

### age band

One of the four ranges the catalogue's default view groups by — **4–6, 7–9, 10–13,
14–18**. A course appears under **every** band its published range touches, so
*Backyard Botany* (5–10) is findable under six, under eight and under ten.

Ages are the primary axis and grades are approximations; the school writes them
that way itself ("10-14, approximately 5th-8th grades"), and a band is never
labelled with a grade.

A course that publishes **no numeric range** is in **every** band. *Algebra 1* —
"8th Grade and older (or younger students who demonstrate proficiency)" — is the
one, and its real gate is a prerequisite. A course with no range is shown to
everyone, never to nobody.

Not: "grade level", "year group".

### rate tier

Which of the school's two hourly rates a course is priced at — **standard**
($10/hour) or **high-school credit** ($15/hour). It is what a course *stores*; the
price itself is computed from it and the contact hours, and never typed
(ADR-0003).

Note that the tier is not the same as carrying credit: *Basic Spanish (Grades
9-12)* is priced at the high-school rate and carries no credit. That is recorded
as published and flagged for the school, not normalised away.

Not: "price", "tuition", "hourly rate" on its own.

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

Note the British spelling of this heading, and note how far it reaches. **Prose
is American**: a family reads "enrollment" and "check", never "enrolment" or
"cheque". Those two words survive only as **column names, enum values and type
names** — `enrolment_units`, `payment_mode = 'cheque'`, `EnrolmentUnit` —
because renaming a schema for a spelling has migration cost and no user-visible
payoff. This entry is named for the type, not for the sentence.

Spelling is the only part of the house style that lives here. The marks, the
spacing and the capitals are in [`docs/house-style.md`](docs/house-style.md),
decided by ADR-0011.

### verbatim copy

Copy the site **transcribes** rather than writes: the Statement of Faith
(`beliefs.ts`), the About page (`story.ts`), the course catalogue
(`catalogue.ts`) and the `courses` rows seeded from it. Each has a test beside
it that fails on any drift from the capture in `docs/mirror/` — `story.ts` says
"including a tidied dash or a corrected space".

It is the school's document, not the site's copy, and **no house style reaches
it**. A tight em dash there is a real finding and still not ours to correct: the
school changes its document, and the transcription follows. The punctuation
audit lists such findings under *whose copy is it* rather than acting on them
(ADR-0011).

Not: "seed data" — the catalogue is seeded *and* verbatim, and the money
settings are seeded and not.

### offering

A **course** paired with an **enrolment unit** — the concrete thing a family
selects and pays a deposit against. The **catalogue** is the courses — however
many the school currently publishes, which is a number the site derives and
never types (#138); "offerings" is what the application flow actually operates
on, because *Latin I, Fall* and *Latin I, Year* are two different purchases of
one course.

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

Since #220 the flip carries less. What a stated `online` submission changes is
the **mode** and not the status: the row still opens `awaiting`, because nothing
about the family's answer says money arrived.

Since #111 the slot is **partly filled**, and it is filled for **all three
amounts through one channel**. The **registration fee**, the **per-class
deposits** and the **tuition** are one lump sum, paid upfront through the
church's Vanco giving page — one campaign, held as `pay_online_url` on the school
details row, so the office moves it without a deploy, and empty there means the
Apply page offers no online payment at all. A **check** to the school is the
fallback, for the whole total and never the deposits alone.

Every surface now words it that way: both emails (#221), and the Apply page
(#219), which asks the family which method they mean and records the answer —
see **stated payment method** below.

All three are the school's money. Tuition does **not** go to the instructors —
see [ADR-0013](docs/adr/0013-the-school-holds-the-tuition.md), which reverses
what this section said until #187 and explains why the field names had to move
with the copy; [ADR-0017](docs/adr/0017-one-lump-sum-through-the-giving-page.md)
supersedes the part of it that kept the deposits on a check, and names what
survives.

**A check is the fallback, never a peer.** On the Apply page paying online is the
primary action and posting a check is a disclosure beside it — and what it asks
for is the whole total, because there is no second channel left for the rest of
it to go down.

*Applied* and *paid* are separate states on separate axes. An application is
`submitted` while its payment is `awaiting`, then `overdue`, then `received`;
none of those changes the application's own state, and none of them is set by
what the family said their method would be.

The row also holds a **payment mode** — the payment axis's spelling of the
family's stated *payment method*, `cheque` or `online` (the column keeps the
British spelling; every label above it reads American). It is what the office
should be watching for and never evidence of anything, so **both modes open
`awaiting`** (#220): a row that opened `paid online` because somebody chose
online would assert money nobody has seen.

The word `overdue` is **never stored**. What the row holds is that a cheque was
awaited, and from when; a payment past its three-week grace period is overdue
because the clock says so, which is how it happens "with no human action" and no
nightly job that can quietly stop running (ADR-0008). **Only a cheque row can
be overdue** — the grace period measures the post, and an online row has no
envelope to be late.

`paid online` is written by the **office**, through one admin action that
records a payment matched by hand against the reference, and by nothing else
(#220). It was reserved for a payment slot that would write it the moment a
family paid; no such slot exists and none is coming, so the alternative to
somebody ticking it is a status no row could ever hold. It is offered on either
mode — a family who said cheque and then paid at the giving page is an ordinary
thing, and the office is still the only witness — and the way back from a match
made in error is the same move that restarts a cheque's grace period, worded for
the mode.

What is offered on **cheque rows only** is the pair that names an envelope: the
cheque has arrived, and wait again for one. An online row is never asked to
expect a cheque from a family who said they were not sending one.

### stated payment method

What the family said they would do, recorded on the application as
`payment_mode` (#219). It is a **statement of intent and never a receipt**: Vanco
sends no confirmation back, so a `paid online` flag set from a family clicking a
link would be a claim nobody checked. What it buys is the office knowing whether
to watch the post tray, and nothing else — the payment state and the amounts owed
are exactly what they were, and a Vanco payment is still matched to an
application by hand.

Choosing the check therefore delays nothing. The rule that gates the send button
asks whether the question was answered and never which answer it was, exactly as
the Statement of Faith gate does (ADR-0009).

The form spells it `check` and the column spells it `cheque`, which is the
**enrolment unit** rule above meeting a word that now lives in both halves at
once; `paymentModeOf` is the one line where they meet.

### class tally

How many children are in each class, counted **once per family, per child, per
course**. It is the number the school decides whether a class runs on, and the
deduplication is the whole of why it is a term: a family applies twice for
ordinary reasons — a second child added, a change of unit, a form sent again
because nobody replied — and every one of those doubles that family's own rows
in a raw count.

Both applications are kept and both are listed, because each is a record of
something a family actually sent. What is deduplicated is the **count**: one row
in the tally, carrying a **second-submission note** that exists to explain a
number that would otherwise look wrong.

**Blocking a second application on the email address is wrong**: two households
share one, and re-applying is a real thing to do.

Nothing about it is stored — no `supersedes` column, no pointer written at
submission. It is recomputed from the applications each time, so a correction is
a correction rather than a migration, and the record of what each family sent
stays exactly what they sent.

Not: "enrolment numbers" (a seat in the tally is not an enrolment), "roll",
"class list".

### conversation flag

The mark an application carries when somebody answered "no" to one of the three
Statement of Faith questions, or wrote something in the objections field. It
routes the application to a conversation.

**It is not a rejection, and nothing in the codebase may make it one.** The flag
is recorded at submission, printed above the family's name in the school's
notification email and shown on the admin screen — first, because it is the one
line that changes what somebody does about the application.

Not: "rejected", "failed the Statement", "review required".

### reference

The short code one application calls itself by — `PA-` and eight characters,
grouped in fours, spelled from an alphabet with no `0`/`O`, `1`/`I`/`L` or any
other pair a family confuses while copying (#218). It is what the family reads
off the confirmation screen and their email, what both emails print, and what
the Applications screen shows on every row.

It exists because the office matches a Vanco payment to an application **by
hand** (ADR-0013): the note a family typed into the church's giving page is the
only thing joining the two, and a 36-character uuid is not something anybody
retypes correctly.

**It is derived from the row id, never stored** — one pure function
(`applicationReference`), no column, no second identity to keep in step, the
same code for the same row for as long as the row exists (ADR-0016; computing
rather than storing, as in ADR-0003). Nothing looks an application up by it, and
two rows could in principle share one — the ADR says why that is accepted. A
refused submission wrote no row, so it has no reference, and no surface invents
one.

Not: "application id" (that is the uuid, and no family sees it), "confirmation
number", "receipt".

### payment method

How a family **said** they would pay — `online` or `check`, and nothing else
(#221). It is never evidence a payment arrived: Vanco still sends the site no
confirmation, so this is the family's own answer and its whole job is to let the
office know whether to watch for an envelope.

There is no third value for a split. An envelope now contains the **whole total
or nothing**, never the deposits alone, and both application emails word one
instruction from this one answer — the giving page and the amount to enter, or
the remittance address and the whole total, never both. The school's
configuration can veto it in one direction only: a giving page that is not set
turns a stated `online` into a check, because an instruction pointing at an
address that is not there is a blank line where the one thing the email exists
to say should be.

Both emails print the same **invoice** from one writer (`invoice` in
`src/lib/application/notices.ts`): registration, deposits, tuition, the deposit
credit where it applies, one total, a status line and the reference — aligned
columns, plain text, no template engine. One writer because a school told to
expect $865 and a family told to send $100 is the same submission saying two
things.

Not: "payment status", "paid", "payment state" — none of those are facts this
site can observe.

### money settings

The single row holding every number about money the school controls: the two
**rate tiers**, the registration fee, the per-class deposit, the late fee, the
study hall fee, the four quarterly payment dates, the refund terms, whether the
deposit is credited against tuition, and the addresses new applications are
emailed to.

One row, on purpose. Every money figure on the public site is read from it and
none is typed into page copy, so a fee changed here is changed on the homepage,
the class pages and the Admissions page in the same republish. A test walks the
public templates and fails on a dollar figure written as a literal.

Saving it asks for an **explicit confirmation naming the change and its effect
on every family**, which no other editable record does — and an identical save
is refused rather than **stamped**, because the stamp is the only control on
the money once permissions are flat.

Separate from **school details** deliberately: sharing a row would mean either a
phone-number typo asks the "this affects every family" question or a deposit
change does not.

Not: "fees", "pricing", "the fee schedule" — the fee schedule is what the
settings *produce*.

### agreed terms

A frozen copy of the **money settings** as they stood when one family applied,
written once and never updated. The price a family applied at is the price they
pay.

A **copy**, not a reference. The columns are duplicated from the money settings
row deliberately: a foreign key would mean a later fee change rewrote what an
already-enrolled family agreed to, which is precisely the thing this record
exists to make impossible (ADR-0006).

Append-only. There is no edit path and no delete path, from the admin or
anywhere else.

Not: "the family's price", "quote", "invoice" — nothing here is billed from.

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

### person

Somebody at the school — a name, a role, an **optional** bio and an **optional**
photograph. There is exactly **one list**: leadership and instructors are the
same kind of thing and the same rows (ADR-0004). Pastor George Jensen is the
reason — he is the chaplain *and* teaches Algebra 1, and as two rows his name
would drift the first time it was corrected in one of them.

**Instructor is not a status a person carries.** It is a fact about the
catalogue: a person is an instructor exactly when some course names them, so
assigning a course makes them one on the staff page, the class page and the
timetable at once. **Leadership** *is* stored, as a rank, because it carries an
order the staff page renders in that nothing else can derive.

A missing bio and a missing photograph are **null and valid** — the staff page
renders such a person by showing their name and what they teach, and invents
neither a paragraph nor a face. Four people have a photograph, because those are
the four the school sent (#99); a photograph is always a file this site holds,
never an off-site face nobody here can vouch for.

Not: "staff member" (excludes nobody but sounds like it excludes instructors),
"teacher", "instructor" as an entity.

The **printed page is the school's voice, not this glossary's** — since #143 it
reads "Our Dedicated Staff" and "Instructors", which are the words the school
asked for and the words a parent uses. The rule above still binds every issue
title, test name, type and identifier: a `person` is what the code has, and
being an instructor is still a fact about the catalogue rather than a status on
the row.

### announcement

A headline, a short body, an optional link and an optional PDF, posted on a
date the school types. That is the shape of **every** notice Pharos puts out —
a fundraiser, a closure, a board update.

**A board update is an announcement with a file attached, not a slot.** The
live site has a fixed "Latest School Board Update – 7/1/2026" position on its
front page, which is why a July PDF is still the headline in October. There is
no such position here, no column and no flag: the board update ages out exactly
as a bake sale does, and nothing has to be retired next time.

**An announcement that has aged out is history; one that has become false is
deleted.** Those are two different things and only the second is ever removed.
A stale notice is a true thing about July, and the news page carries it; a
notice for an event the school withdrew — the Texas Roadhouse night #146
replaced — says something untrue about next week, and no staleness rule catches
it, because its date is the day it was posted rather than the day of the event.
That deletion is a migration, not a button: it is rare enough to be argued in
writing each time.

**Current** means posted within the last six weeks. It is a property of an
announcement, not of a page: the home page carried the current ones until #109
removed that section — the school asked for a quieter front page and urgent
notices go in the announcement banner — and no surface reads the rule today. It
is kept in the domain because a surface was removed and the feature was not.

The news page carries all of them, stale ones included. It always has, which is
why the home page was free to drop them: the record is somewhere else.

The **posted date** is not the [stamp](#stamp): correcting a typo in August must
not make a July notice current again.

Not: "news item" (the page is called News; the thing on it is an announcement),
"post", "board update" as a kind of its own.

### announcement banner

The one short, timely line across the top of the **home page** — "Register now!
Classes begin August 31". A switch, a message, a real date and an optional link,
and there is exactly one of it.

It is **not an [announcement](#announcement)**, and the near-identical name is
the trap: an announcement is one of many dated notices that ages out onto the
news page, and it is never urgent enough to interrupt anybody. The banner is a
singleton the office switches on for a fortnight and off again, and it lives on
the **school details** row beside the address, not in the announcements table —
because that screen's save already revalidates every published page, which is
what lets the words change without a deploy.

The date is a real date, stored as one and rendered American with no ordinal
suffix — "August 31", never "August 31st" and never free text. It renders
**after** the message, so the office types "Register now! Classes begin".

It is a **bar, not a modal**, and it is dismissible: a modal on first paint
costs conversion and traps a keyboard visitor. A dismissal is remembered against
the message itself, so the next thing the office puts up reaches the people who
closed the last one.

Not: "popup", "alert", "the announcements section" (which #109 removed from the
home page — the banner is what replaced it in that region), and not the
[registration call to action](#registration-call-to-action), whose words the
example above is one keystroke away from.

### one-off

A single dated thing on the school's calendar that belongs to no day track — an
open house, a picture day, a dine-to-donate fundraiser. Held on one date, with a
start time, a place and a note that are each **optional and whose absence is a
real state**: "Field day, May 12" is a complete one-off, not an unfinished one.
It is stored as a row an admin edits, never typed into a page.

It is deliberately not a [meeting date](#day-track): a meeting is one of 112
computed from eight numbers and belongs to a track; a one-off happens once and
belongs to nothing. Forcing the two into one model gives every meeting a place
it never has and every one-off a week number that means nothing.

**The page shows the year; the markup shows what is still ahead; the feed shows
everything.** The calendar page draws a one-off on its own date in a month grid,
past ones included, because the cell's position already says the date has gone
(#186) — the rule that showed only what was ahead (#146) was written for a list,
where a finished fundraiser led. What still filters is the `Event` structured
data: a crawler has no cell, and last spring's concert offered to a search result
as though it were on is a wrong claim about today. The boundary is unchanged — a
one-off is kept through the whole of its own day, in the school's own timezone,
and drops the morning after, because a fundraiser is at its most useful on the
morning it happens. The subscribed calendar is deliberately unfiltered: it is the
record of the year, and the phone reading it decides what to draw.

It is also the one record on this site that is **deleted rather than kept**: a
cancelled concert left on a subscribed feed is a family driving to a school that
is dark.

Not: "event" on its own (which also names an application's lifecycle events),
"closure" (a day the school is shut, which belongs to the year), "announcement".

### synced one-off

A [one-off](#one-off) the school holds in **its own Google calendar**, which this
site reads and republishes in its own design. Same shape as any other one-off —
one date, an optional time, place and note — and the same thing on the page. The
whole of the difference is **who holds it**: an admin one-off is a row somebody
typed here, and a synced one-off is a copy of a row somebody typed in Google.

It is the first thing on this site that is **editable and not in the
[editable set](#editable-set)**. That list stays the seven things it was: a
synced one-off has no form, no save and no delete in the admin, because editing
it here would be editing a copy the next sync overwrites. The place to change it
is Google, and the site says so rather than offering a control that loses.

**The sync touches today and later, and never the past.** The school's Google
calendar is mostly an archive — eighteen one-offs in it when this was built, and
seventeen of them already over — and importing that archive would be the site
asserting things about a year it was not party to. One of those seventeen is the
Texas Roadhouse night the school withdrew, whose [announcement](#announcement)
was deleted for having become false; copying it back is a decision nobody made.
So the site starts its record from the day the sync starts, and keeps a synced
one-off after its date goes by rather than deleting it for being over. The feed
still shows everything the site has ever known. It just does not know 2025.

**Two sources describing one day are two entries, and the site does not guess.**
Nothing dedupes a synced one-off against an admin one that shares its date: two
fundraisers in a fortnight is an ordinary week at this school, and a rule that
hid the second would hide it invisibly. A real duplicate is visible on the page,
and whoever made it removes one — in Google or in the admin, whichever they own.

It carries no [stamp](#stamp) and cannot: nobody signs in to run a sync, so there
is no [actor](#actor) to name. What it carries is when the calendar was last
read, which is a different fact and is not attribution.

**It is as fresh as yesterday, and that is the promise.** The calendar is read
once a day and the site [republishes](#republish) only when something in it moved.
The site already tells families that a subscribed calendar reaches a phone
"within a few hours, sometimes a day or two", and that a short-notice change
comes by text — reading Google every hour would sit inside a delay that has
already been promised and bought nothing. When the calendar cannot be reached,
nothing is written and nothing is republished: the page keeps the copy it has,
which is the last thing the school is known to have said.

**Not everything in the school's Google calendar is one.** That calendar also
states the [school year](#day-track) — four weekly "Classes in session" series,
one per day track, plus a "First day of classes" and a stray "Classes in
session" that recur not at all. Those are **term dates**, they are computed here
from the eight numbers on the School Year screen, and the sync leaves every one
of them behind: restating them from Google would put a second, disagreeing
source of truth on the same page as the first. The Tuesday series is the proof —
it is in Google, and the Tuesday track is routinely empty.

It is **held apart from the admin's own rows, in its own table** (ADR-0012), so
that "the sync never overwrites what the school typed" is enforced by the schema
rather than remembered. The cost is that the calendar page, the feed and the
structured data each read two sources and merge them.

Not: "imported event" (nothing is imported — the copy is refreshed, and Google
stays the original), "Google event" (which names Google's record, not ours),
"external event".

### registration call to action

The gold "Register now!" button on the **home page**, standing beside the
inquiry form's own button, with the first day of classes on a second line under
it. It leads to the application.

It is **not the [announcement banner](#announcement-banner)**, and the two say
almost the same words, which is the whole reason this entry exists. The banner
is a bar the office switches on for a fortnight and writes itself; this is a
fixture that is always there and whose only variable is the date. The date is
not typed at all — it is the **school year start** off the school details row,
the same field the office already edits, which is what lets the start of term
move without a deploy.

It is set in the **raw gold of the mark**, and that gold is a ground rather than
a word: as text it fails contrast on every light band the site has, which is
what `--color-gold-ink` exists for. On this button the ground is the raw gold
and the type on it is navy.

Not: "the apply button" (the application flow has its own buttons on its own
page), "the register banner".

### policy

A document the school asks families to read, and sometimes to sign: a title, one
sentence saying what it is, a position in the list, a "parents sign this" tick,
and a PDF. Four of them today — Handbook, Code of Conduct, Child Protection,
Child Protection Background Check.

**A policy is published by its file, not by its row.** A policy created from the
admin exists before its document does, and for that gap it is deliberately absent
from the policies page rather than listed as a link to nothing. The admin says so
on its own screen.

**Its address is fixed.** The slug is minted from the title once, at creation,
and then never recomputed — it is the URL on a printed handbook and on the far
end of a 301 from the Wix site. Renaming a policy is a title change, not a move.
Replacing the document changes the bytes at that address and nothing else: no new
URL, no redirect, no inbound link broken.

**Its versions are retained.** Every upload appends a version; nothing overwrites
or deletes one. Each has its own permanent address, linked from the admin rather
than from the policies page, because "what did the family who enrolled in August
sign?" is the school's question and not a parent's. The two kinds of address want
opposite caching, which is why there are two of them (ADR-0005).

The **updated date** is stamped from the upload and is typeable nowhere: there is
no date control on either policy form, so the published date cannot disagree with
the document. It is not the [stamp](#stamp) — correcting a description in August
must not tell every family the Handbook changed.

Not: "document" alone (the file is a document; the policy is the thing that has
one), "attachment" (that is an [announcement](#announcement)'s optional PDF),
"revision" (a version is the file, not a diff).

### agreement

A family's answer to "who agrees to this document?", asked on the
[application](#conversation-flag) about the two [policies](#policy) families
sign — the Code of Conduct and the Handbook. Three answers, in the school's own
words from its live form: **Student agrees**, **Parent agrees**, **Neither
agrees**.

**It is asked once, of the family.** The live form asks once, and an application
carrying three children still records one answer per document. The singular word
"student" is the form's phrasing, not a per-child question.

**Unanswered is not "neither".** Where an answer exists the record says which
one; where none exists it says nothing rather than saying they refused — the same
distinction the Statement of Faith grid keeps between a blank column and a "no".
Since #85 a question the school *asked* has to be answered before the
application can be sent, so an unanswered agreement on a submitted application is
now only possible for a document that was never published.

**It carries the policy version it was given against**, so a later upload cannot
reinterpret what a family agreed to. The link a family reads goes to the policy's
fixed address; only the record keeps the number.

**No answer to it blocks a submission, and none of them raises the
[conversation flag](#conversation-flag).** "Neither agrees" is an ordinary
answer and goes through like any other. Whether it should route to a
conversation is the school's call, not the site's (#71).

Not: "signature" (nothing is signed here — the paper at enrolment is), "consent",
"acceptance".

### complete application

An application with an answer to every question the school asked: a family name,
a reachable email, a child with a name and an age, at least one class, **one full
column** of the Statement of Faith grid by any one respondent, and an
[agreement](#agreement) answer for each published document. Until it is
complete, **Send the application** is greyed and a list beside it names what is
still needed.

**Complete means answered, never agreed** (#85, ADR-0009). "No" is complete.
"Neither agrees" is complete. An objection is complete, and still raises the
[conversation flag](#conversation-flag). Nothing about what a family thinks can
make their application incomplete, and a request to change that is a different
decision with its own ADR.

**One column, not three.** A father applying alone, a mother applying alone and a
legal guardian applying alone are the same application to this rule. A second
column half filled in is extra information rather than a new defect.

**It is derived, never stored.** There is no "checked" state and no "valid" flag:
the browser re-derives it on every keystroke and the server on every render and
every POST, from one rule set. Pressing **Check these choices** is a preview and
never a step.

Not: "validated", "approved", "accepted" (the school does that, later, by
reading it).

### heading case

**Title case, Chicago**, for every heading the site writes for itself: `<h1>` to
`<h3>`, card and block titles, and `<legend>`. "Our Mission and Vision", "A Week
in the Life" — every word capitalised except articles, coordinating conjunctions
and prepositions of fewer than five letters, and even those when first or last.
Hyphenates capitalise both sides ("Half-Day", "Pre-K"); acronyms stay as
authored ("FAQ", "K–12").

Public pages and admin, one rule for both (#210). It reverses the sentence-case
style #148 counted, because the site did both — sometimes on the same page — and
a mix reads as unfinished rather than as a choice.

Two headings are exempt and stay as written: "Mornings here. Afternoons yours."
(the two-sentence rhythm is the point) and "This affects every family." (a
warning, not a section label).

It does **not** reach form labels, buttons, nav links or table column headers —
that is UI chrome, and title case there looks dated — and it does not reach a
**verbatim copy** heading or one the site renders from a row, which is the name
of a thing and keeps the case the school gave it.

**Nothing enforces it.** No linter, and no title-casing at render time: a rule
that guesses needs a dictionary and mangles proper nouns. `docs/house-style.md`
holds the long form, and ADR-0015 says why the scan that used to check this was
deleted rather than inverted.

Not: "sentence case", which is what the site did before #210 and what half of
`docs/punctuation-audit.md`'s capitalisation section still describes.

### microschool

What Pharos **is** — a small school that families enrol in for the classes they
choose, and that teaches those classes in community. The site says it in exactly
one wording, held as `SCHOOL_DESCRIPTION` in `src/lib/site.ts` and read from
there by the hero, the About page, `llms.txt` and the structured data: **A
Christian, classical hybrid microschool** (#137).

A microschool is not a **homeschool**, and that is the near-synonym worth being
careful about here: the families Pharos serves homeschool, and the site says so
freely — the *school* does not. Copy about homeschooling families is correct;
copy calling Pharos a homeschool is a claim about what kind of institution it is,
and a wrong one. The hero made it for one release.

Not: "hybrid homeschool", "co-op", "university-model school".

### H.O.P.E.

**Helping Our Parents Educate** — the school's own acronym, real copy from the
existing site, not invented for this build. It appears as a gold `H O P E` row on
the navy band of the homepage, where each letter opens an illustrated card.

Always set with the periods when written as the acronym in prose (`H.O.P.E.`);
the homepage sets the four letters spaced as a display device (`H O P E`), which
is typography, not a second spelling.

### actor

Whoever is driving the admin on a given request — a **named account**, or
**break-glass access**. The actor is resolved from the session cookie once, by
the middleware, and handed to the page; it is what a **stamp** names.

An actor is not a "user": break-glass is a legitimate actor and is nobody's
account, which is why `Actor.userId` is nullable and `adminUsers` has no row
for it.

Not: "current user", "admin", "session".

### break-glass

The single password held in the Vercel environment as `BREAK_GLASS_PASSWORD`,
which answers exactly one situation: **both admins locked out at once**. It is
consulted only after every named account has already refused, so it can never
shadow a real account, and it is never a person — edits made through it are
stamped `Break-glass access`.

The defining property is that **the path stays cold**. Absent or blank is a
closed door, never an open one; the value is never logged, not even a prefix;
and nothing in the test suite signs in through it.

Not: "admin password", "master password", "recovery code" — recovery is
**mutual reset**, which is a different thing entirely.

### mutual reset

The school's recovery story for a forgotten password: **either admin resets the
other** from the Users screen. There are no reset links and no transactional
email, because there is no mail sender to own. A reset ends that person's
sessions everywhere, because the usual reason to reset a password is that
somebody else has it.

### stamp

The "Last edited by <name> on <date>" line an editable record carries. One
stamp per record, overwritten by each save — it is attribution, not an audit
log, and there is no history behind it.

The stamp is load-bearing rather than decorative: permissions are flat, so
attribution is the only remaining control on who changed the money settings.

### republish

Re-requesting **every** public path past the CDN cache, so the live site
re-renders. It is what a save does automatically, what the **Retry** button does
after a save reported the live site had not updated, and what the Republish
button does with no edit attached.

Whole-site on purpose: a per-path invalidation map is a second source of truth
about which edit touches which page, and it drifts silently.

Answered where it was asked: the button carries a **return path** and the
outcome is reported back there, not on School details (#198).

### return path

The screen a form comes back to when the work happens somewhere else — the page
sign-in was bounced away from, or the screen **Republish** was pressed on. It
travels as a hidden field, so it is always a value somebody else could have
written: only a path on this site is honoured, and anything else falls back to
School details.

Not: a URL. A return path that could name another host is an open redirect
wearing the school's own domain.

Not: "deploy" — republishing changes no code and produces no deployment.

### outcome code

What an action says for itself when the answer travels back through a redirect
rather than being rendered by the post. A short code in the query string —
`state-enrolled`, `payment-cheque-received` — and never the sentence: a message
in a URL is a message anybody can rewrite, so the code names a fact the store
already wrote and the screen decides the wording from it, refusing any part that
is not in the closed lists (#201).

Where a **return path** names a screen, an outcome code names what happened, and
on Applications the two halves travel together: the code says what moved, the
`at` parameter and the fragment say which row it moved on, and the banner renders
beside the buttons that were pressed.

Not: the only way an outcome is reported. The editors post and render, because
they hold a revalidation answer a redirect would throw away; a screen with no
such answer to lose redirects instead, and a refresh then repeats nothing.

### export

The school's own copy of the **editable set**, as one ZIP: the content as JSON,
every PDF as an ordinary file, and a README addressed to whoever opens it. It is
what **Download everything** produces on `/admin/backup`, and it is the same
bytes that arrive by email on the 1st of every month.

It carries the **synced one-offs** too, which are the one thing in it that is
not in the editable set. The export answers "can the school get its content back
without asking anyone", and half a calendar is a worse answer than a whole one —
the fact that Google also holds a copy is not a reason for this site's own record
of its year to have a hole in it.

An export is **restorable without Postgres on purpose**. A `pg_dump` is smaller
and a better restore, and is worth nothing to a board with no developer: the
nightly dump answers "can this database be brought back", and the export answers
"can the school get its content back without asking anyone".

It carries content and not accounts. Logins and live sessions are excluded, each
with its reason written beside it in `src/lib/backup/export.ts`, and a table
added to the schema fails a test until somebody decides which it is.

Not: "backup" unqualified — that word covers both layers and they are not
interchangeable. Not "dump", which is the operator layer's artifact.
