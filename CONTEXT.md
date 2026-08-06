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
neither a paragraph nor a face.

Not: "staff member" (excludes nobody but sounds like it excludes instructors),
"teacher", "instructor" as an entity.

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
