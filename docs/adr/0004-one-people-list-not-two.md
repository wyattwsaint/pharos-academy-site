# ADR-0004 — One list of people; being an instructor is derived, never stored

**Status:** accepted
**Date:** 2026-08-05
**Context:** [#26](https://github.com/wyattwsaint/pharos-academy-site/issues/26), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18)

## Context

The school publishes people in two unrelated places. `docs/mirror/pages/team_4.txt` — the
live staff page — carries three named people with bios: the head of school, the chaplain,
and the director of business administration. `docs/mirror/data/courses.json` carries an
instructor's name typed onto each of the nineteen courses, eight distinct names, one of
whom teaches eight of them.

The two overlap. Pastor George Jensen is on the staff page as Chaplain & Spiritual Advisor
*and* is the typed instructor of Algebra 1. Modelled as two tables he becomes two rows,
and the day somebody corrects his name, his honorific, or his title on the staff page, the
class page keeps the old one. That is the failure this whole build exists to end, and it
is already live on the site for ages, days and texts.

The obvious alternative — a `people` table plus an `instructors` table, or a `people` table
with an `is_instructor` flag — moves the drift rather than removing it. A flag has to be
set by hand, so a course assigned to somebody whose flag is off prints an instructor who
does not appear on the staff page, and nothing detects it.

## Decision

**One `people` table.** A person is a slug, a name, a role, an optional bio, an optional
photograph, and an optional leadership rank. `courses.instructor_slug` is a foreign key
into it; the typed-name column is gone (migration `0003-people`).

**Being an instructor is not a column.** It is a fact about the catalogue:
`instructorsAmong(people, courses)` returns the people some course names, with what they
teach. The staff page's "Who teaches" section, each class page and the timetable all read
it, so assigning a course to somebody makes them an instructor on every surface at once.

**Being leadership *is* a column** — `leadershipRank` — because it carries an order the
staff page renders in, and that order is a decision the school makes rather than a fact
derivable from anything else. Null means not leadership.

**A bio and a photograph are `null`, never `''`.** An unwritten bio is a valid state, and
the parser that reads the admin form turns an empty textarea into null so the two cannot
mean different things in the same column.

## Consequences

- **George Jensen is one row**, appearing in both sections of the staff page. A correction
  to his name reaches the staff page, Algebra 1's page and the timetable together, because
  there is one name.

  **Narrowed by [#266](https://github.com/wyattwsaint/pharos-academy-site/issues/266)
  (2026-08-15).** Assigning a course still makes somebody an instructor on every surface at
  once, but a **retired** person is no longer named on every surface that names them: a
  course the school still runs prints nobody, and a retired course goes on printing them.
  That is this ADR defending itself rather than contradicting itself — a retired person left
  named on a live class would be printed on that class while being absent from the staff
  page it links to, which is exactly the drift merging the two lists was meant to prevent.
  Because instructor is not a status a person carries, there is nothing to store and nothing
  to keep in sync: the rule is a rendering rule and lives at `instructorOf`, the one place
  #257 established for deciding whether a class names anybody, so the class page, the full
  descriptions, the timetable and the structured data cannot disagree. It is also what lets
  the school act on a departure the day it happens — retiring a person is never refused,
  whatever they teach, and no course is reassigned or touched.
- **There is no second list to keep in sync**, so "no separate instructor entity" is a
  property of the schema rather than a discipline somebody has to maintain.
- **The foreign key makes a course naming somebody who is not on the list impossible.**
  `instructorOf` throws rather than printing a name it could not resolve, and the database
  refuses to delete somebody nineteen courses point at — which is why the admin offers no
  delete.

  **Narrowed again by [#262](https://github.com/wyattwsaint/pharos-academy-site/issues/262)
  (2026-08-15).** The admin now offers a delete, and it is unconditional. The foreign key is
  unchanged and still refuses a bare `delete from people` — what changed is that, since the
  column became nullable, `deletePerson` can clear the references first. So the sentence
  "the database refuses to delete somebody nineteen courses point at" is still true of the
  raw statement, and no longer describes the admin: the classes are left running and
  unstaffed, and the confirmation names them. The reasoning is ADR-0021's — a person is the
  school's own content, and nothing a family sent points at one.

  **Narrowed by [#257](https://github.com/wyattwsaint/pharos-academy-site/issues/257)
  (2026-08-15).** This bullet used to read "a course with no real instructor impossible",
  and `instructor_slug` was `not null`. It is now nullable: the school puts a class on the
  schedule before it decides who teaches it, and under the old column such a class could
  not be typed into the admin at all. Nothing above changes — there is still one list, an
  instructor is still derived from the catalogue, and a course still cannot name somebody
  who is not a person. What changes is that it may name **nobody**, which every surface
  renders as an absence (CONTEXT.md, "unstaffed course") rather than as a gap to fill. The
  reversal is deliberate and is the same stance this ADR already takes on a missing bio and
  a missing photograph.
- **Editing a person republishes the whole site.** A name is printed on the staff page, on
  each class that person teaches and in the timetable, so `/admin/people/<slug>` calls
  `revalidateAll` and reports the answer, exactly as school details does (#18 §3).
- **Photographs stay honest.** The column was null for all ten seeded people until the
  school supplied four of them (#99): Jill Kilker, George Jensen, Kathy Liddick and Mandy
  Saint, built into `public/portraits/` from the sources in `assets/portraits/`. The other
  six are still null and render as no face rather than a generated or stock one, and the
  admin still refuses a photograph path that is not a file in this site, so an
  unvouched-for face cannot be hot-linked into a named member of staff's place.
- **The homepage no longer holds a second list at all.** Its "Who teaches" band used to
  carry three people as #21's approved copy, with one-line credentials that have no column
  here — the one place a name could drift from this table. #142 replaced it with an
  invitation and a link to the staff page, so every name the site prints now comes from
  `people`.
