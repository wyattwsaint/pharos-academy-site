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

The word `overdue` is **never stored**. What the row holds is that a cheque was
awaited, and from when; a payment past its three-week grace period is overdue
because the clock says so, which is how it happens "with no human action" and no
nightly job that can quietly stop running (ADR-0008).

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

### announcement

A headline, a short body, an optional link and an optional PDF, posted on a
date the school types. That is the shape of **every** notice Pharos puts out —
a fundraiser, a closure, a board update.

**A board update is an announcement with a file attached, not a slot.** The
live site has a fixed "Latest School Board Update – 7/1/2026" position on its
front page, which is why a July PDF is still the headline in October. There is
no such position here, no column and no flag: the board update ages out exactly
as a bake sale does, and nothing has to be retired next time.

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
home page — the banner is what replaced it in that region).

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

Not: "deploy" — republishing changes no code and produces no deployment.

### export

The school's own copy of the **editable set**, as one ZIP: the content as JSON,
every PDF as an ordinary file, and a README addressed to whoever opens it. It is
what **Download everything** produces on `/admin/backup`, and it is the same
bytes that arrive by email on the 1st of every month.

An export is **restorable without Postgres on purpose**. A `pg_dump` is smaller
and a better restore, and is worth nothing to a board with no developer: the
nightly dump answers "can this database be brought back", and the export answers
"can the school get its content back without asking anyone".

It carries content and not accounts. Logins and live sessions are excluded, each
with its reason written beside it in `src/lib/backup/export.ts`, and a table
added to the schema fails a test until somebody decides which it is.

Not: "backup" unqualified — that word covers both layers and they are not
interchangeable. Not "dump", which is the operator layer's artifact.
