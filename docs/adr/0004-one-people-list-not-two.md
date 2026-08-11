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
- **There is no second list to keep in sync**, so "no separate instructor entity" is a
  property of the schema rather than a discipline somebody has to maintain.
- **The foreign key makes a course with no real instructor impossible.** `instructorOf`
  throws rather than printing an empty instructor line, and the database refuses to delete
  somebody nineteen courses point at — which is why the admin offers no delete.
- **Editing a person republishes the whole site.** A name is printed on the staff page, on
  each class that person teaches and in the timetable, so `/admin/people/<slug>` calls
  `revalidateAll` and reports the answer, exactly as school details does (#18 §3).
- **Photographs stay honest.** The column was null for all ten seeded people until the
  school supplied four of them (#99): Jill Kilker, George Jensen, Kathy Liddick and Mandy
  Saint, built into `public/portraits/` from the sources in `assets/portraits/`. The other
  six are still null and render as no face rather than a generated or stock one, and the
  admin still refuses a photograph path that is not a file in this site, so an
  unvouched-for face cannot be hot-linked into a named member of staff's place.
- **The homepage's "Who teaches" band is not this list.** Its three people are #21's
  approved copy with one-line credentials that have no column here, and it was left alone
  deliberately. If it is ever made to read `people`, the credential line is the column that
  has to be added first.
