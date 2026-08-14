# Site mirror and content inventory — pharosacademy.net

Captured **2026-07-28** with a headless Chrome pass (Playwright), which the Wix rendering
requires; plain HTTP fetching returns partial content. Resolves [#4](https://github.com/wyattwsaint/pharos-academy-site/issues/4).

This is a **record of what the old site and the school's handbooks said** on the
capture date, not a statement of what is true now. Where the two disagree, the
site is the current answer. One known disagreement: the policy handbook
instructs families to pay tuition directly to their instructors, and since #187
tuition is paid to the school — see
[ADR-0013](../adr/0013-the-school-holds-the-tuition.md). Nothing here is edited
to match; do not re-derive the old model from it.

## What is here

| Path | Contents |
|---|---|
| `pages/` | Rendered text of all 19 pages, one file each, with URL/title/status header |
| `pdf/` | All 18 linked PDFs, downloaded and given human-readable names |
| `pdf-text/` | Extracted text of every PDF, same basenames |
| `forms/` | Rendered text of both live Google Forms (Apply Now, Volunteer Sign-Up) |
| `assets/` | The 8 school-owned images at full resolution, un-cropped |
| `data/courses.json` | Structured course data reconciled across all three presentations |
| `data/pages.json` | Page list with titles and status codes |
| `data/links.json` | Full link graph with anchor text |
| `data/assets.json`, `data/assets-manifest.json` | Every asset URL found, and what was downloaded |
| `data/external.json` | Every off-site link |

Stock photography served from Wix's shared media account (`11062b_*`) was **not** committed —
it is licensed to the Wix site, not to the school, and will be replaced. Those URLs are
recorded in `data/assets.json` if anyone needs to look at them.

---

## Headline: the "blocked on the school" list is much shorter than we thought

Four of the five items the map listed as absent are **already published**. Only one is genuinely missing.

| Previously believed absent | Actually |
|---|---|
| Tuition figures | **Published in full.** Every course carries a cost, materials fee, and assessment fee. The handbook adds registration fee, seat deposit, quarterly schedule, late fee, and refund terms. See "Money" below. |
| 2026-27 calendar dates | **Published in full.** Five calendar PDFs, all 28 weeks, both semesters, every holiday closure. See "Calendar" below. |
| Admissions requirements | **Published**, spread across the Apply Now form's checklist, the handbook's Parents-commit-to section, and the Statement of Faith agreement. Assembled below. |
| Grade range served | **Answerable from the course data.** Ages 4–18, i.e. PreK/K through 12th grade. |
| Photo release policy | **Genuinely absent.** No published document mentions photography, image use, or media consent for students. Still needed from the school. |
| Vector logo | **Genuinely absent**, but better than believed. The header logo's original is a 287×335 JPG. A larger mark also exists — `assets/cecb9d_46661c…~mv2.png`, filename "Pharos.png", **1024×871** — enough for most web use at 1× and 2×. There is still no vector and nothing print-safe, so ask, but this is no longer blocking. |

> **Correction (2026-08-10, #106).** The "larger mark" in the Vector logo row is not a
> mark. `assets/cecb9d_46661c…~mv2.png` is Thiersch's 1909 drawing of the Lighthouse of
> Alexandria — the picture `/general-8` printed beside the essay on the name — and the
> filename "Pharos.png" is what misread it as a logo. The vector logo row therefore stands
> as first believed: the only logo file captured is the 287×335 JPG, and a print-safe mark
> is still to ask the school for. The drawing itself is now published on About, and its
> source copy lives at `assets/imagery/thiersch-pharos.png`.

Two new items belong on that list:

- **A Media page.** `/about` has a nav item labelled "Media" pointing at `/about-5`, which is a byte-identical duplicate of the Volunteer page. There is no media content anywhere on the site.
- **Two supporting policies** the Child Protection policy names as existing but which are not published: a Personal Conduct / Morals Clause and a Youth Ministry Communication Policy.

---

## Money — the complete published picture

This is the single most consequential finding for [#6](https://github.com/wyattwsaint/pharos-academy-site/issues/6) and [#8](https://github.com/wyattwsaint/pharos-academy-site/issues/8).

**Rate card.** Every published price is internally consistent: contact hours × $10/hour for
elementary and middle-school courses, × $15/hour for high-school-credit courses. All 19
courses check out against this formula. Course prices range $90–$840.

**Fees, from `pdf-text/policy-handbook.txt` (handbook updated 2026-07-23):**

- $25 registration fee, per student per year, non-refundable
- $100 deposit, **per student per class**, non-refundable, holds the seat
- Class fees in four quarterly instalments — Aug 24, Oct 12, Dec 7, Feb 8 — with a $50 per class late fee
- Books/supplies and editing/evaluation fees due Aug 24
- Study hall fee, non-refundable
- 100% refund if withdrawing before classes start; prorated refund after Aug 31

**Three things here reshape the payment ticket:**

1. **Tuition is not currently collected by the school.** The handbook says parents "pay any
   remaining tuition **to instructors** by the deadline," and that a student "may not be able to
   attend class if there is a tuition balance." Today the school collects only the $25 registration
   fee and the $100 per-class deposits; the rest is instructor-to-parent. Moving tuition onto a
   Vanco surface is not digitising an existing flow — it is **changing who holds the money**, which
   is a school-governance decision, not a web decision. Raise it with George before #6 is answered.

2. **The $25 has two different names and one payment rail.** The handbook calls it a
   "Registration Fee"; the live Apply Now form calls it an "application fee (nonrefundable)" and
   instructs applicants to **mail a physical cheque** made payable to "Pharos Academy" at
   9 Sherwood Drive. That cheque is the thing the Vanco surface most obviously replaces.

3. **Pharos has no Vanco account of its own yet.** The `/giving` page links to
   `https://secure.myvanco.com/YH8R/home` — but the page text is explicit that this is *Enola First
   Church of God's* donation platform, where a giver selects "Pharos Academy" from a list.
   `YH8R` is the church's Vanco org ID, not Pharos's. The July board update confirms the direction
   of travel: "A dedicated Pharos bank account is being established, along with plans for online
   giving through Vanco." Note *giving*, not tuition.

**Also relevant to any payment build:** the same board update records that the Form 1023
application for federal tax-exempt status is still in progress (~$1,700, engagement letter signed).
Pharos is not yet a recognised 501(c)(3). Merchant onboarding and how donations are described
on the site both depend on that.

**One internal contradiction to have the school resolve:** the handbook states the study hall fee
as "$10 per study hall" in the payment section (p.3) and "$60 per student per Study Hall" in the
study hall section (p.8).

---

## Calendar — complete, published, and self-consistent

Five PDFs under `pdf/calendar-2026-27-*.pdf`, all extracted to text. The full calendar gives
28 weeks — 14 per semester — across four independent day tracks:

- **Fall:** Aug 31 / Sep 1 / Sep 2 / Sep 3 2026 through Dec 14–15 2026
- **Spring:** Jan 4 2027 through Apr 12 2027
- **Closures:** Labor Day (Mon 9/7), Election Day (Tue 11/3), Thanksgiving (Wed 11/25, Thu 11/26, Mon 11/30), Easter Monday

Each weekday has its own numbered week sequence, so week 10 falls on a different date depending
on which day your class meets. Any calendar model has to carry that; a single flat week number
is wrong.

**Two calendar defects:**

- The Easter closure is labelled **"EASTER MONDAY OFF (3/26)"**. 3/26/2027 is a Friday. Easter
  2027 falls on March 28, so Easter Monday is **March 29, 2027** — which matches the Monday
  track's actual gap (Mar 22 → Apr 5). The parenthetical date is wrong on the published PDF.
- **The Tuesday track has 28 scheduled class dates and zero courses.** No course on any of the
  three course presentations meets on a Tuesday. Either Tuesday courses are unannounced or the
  Tuesday calendar is aspirational.

For [#10](https://github.com/wyattwsaint/pharos-academy-site/issues/10): the source-of-truth
question is now much better posed. There is no Google Calendar in evidence anywhere on the live
site — the school's actual current calendar artefact is a set of hand-made PDFs. Whatever is
chosen has to produce those dates, and the four-track structure is the real modelling constraint.

---

## The Apply Now form — captured in full

`forms/googleform_apply-now.txt` has every field. This is the flow the Vanco surface replaces,
and it is the strongest available input to [#8](https://github.com/wyattwsaint/pharos-academy-site/issues/8).

**Structure:** Non-discrimination notice → student identity and address → parent/guardian
contacts (father, mother, guardian, each with email and cell) → siblings → custody arrangements →
authorised pickup contacts → home church and attendance → fit essay → medical and mental-health
history → Statement of Faith agreement → application checklist.

**The Statement of Faith gate already exists and has the shape the recap email described.** It is
a three-question grid — *have you read it*, *do you agree with it*, *are you comfortable with your
child being educated in alignment with it* — asked separately of Father, Mother, and Guardian,
followed by a **required** free-text field for objections or disagreements. That matches the July
board update: "Families will be asked to agree to the Statement of Faith, with an opportunity to
note any disagreements." The gate is not pass/fail; it is disclose-and-discuss.

**What the form does NOT do — and the new one must:**

- **No class selection at all.** Not a single course appears on the application. Class selection is
  entirely new build, and it has to handle per-course enrolment units (year, semester, or fixed
  6/8/12-week block), timetable clash detection, and per-class $100 deposits.
- **No payment.** It instructs the applicant to mail a cheque.

**The security consequence, which changes an assumption on the map.** This form collects, on
children: date of birth, home address, medical conditions and allergies, whether the child has
been evaluated for a learning disability / ADHD / behavioural or mental-health issues (with a
follow-up explanation), and custody arrangements. Issue #1 proposed admin auth as *"a shared
password plus signed HttpOnly cookie over a read-only lead list."* That is a reasonable posture
for marketing leads. It is not a defensible posture for children's health and custody records. If
the new site accepts this form, the admin surface needs real per-user accounts, and the storage
decision under "Where editable content physically lives" acquires a second, stricter tier. This
belongs on the map's fog list before any build starts.

**Assembled admissions requirements** (nothing here is missing; it is just scattered):

1. Completed application form
2. A copy of recent grades or test scores, if applicable, emailed to jkilker@enolacog.com
3. $25 non-refundable application fee by cheque
4. Read and agree to the Statement of Faith and Practice (objections disclosed, not disqualifying)
5. Read and sign the Handbook, Code of Conduct, Homework Policy — signature pages are in the PDFs
6. $100 non-refundable deposit per class
7. Daily access to **WhatsApp** — the handbook makes this a parental commitment; WhatsApp plus
   the website plus Facebook are the school's stated cancellation channels

Item 5 names a **Homework Policy** that is signed by parents but is not published on the site.
Item 7 is worth a design decision: the site is one of three announcement channels, and the
handbook commits the school to "provide an active website to inform Pharos Academy families of
all pertinent information and announcements."

---

## URL list — for the 301 map

Real nav is flat: **Home · About · Courses · Policies · Calendars & Events · Apply Now** (external).
Everything else is reached from a landing page. There is no sitemap.xml — the URL Wix advertises
in `robots.txt` returns 404 — so this list came from crawling the link graph.

| # | URL | Title | Reached from | Note |
|---|---|---|---|---|
| 1 | `/` | Home | nav | |
| 2 | `/about` | About | nav | Link hub only, no content of its own |
| 3 | `/courses` | Courses | nav | Link hub only |
| 4 | `/policies` | Policies | nav | PDF links + inline privacy policy |
| 5 | `/calendars-and-events` | Calendars & Events | nav | |
| 6 | `/core-values` | Why Pharos? | /about ×2 | Method, Core Values, Mission & Vision |
| 7 | `/about-3` | Start Date | /about | One line: August 31, 2026 |
| 8 | `/about-1` | Location | /about | Address + church link |
| 9 | `/general-8` | Pharos Meaning | /about | Essay on the name |
| 10 | `/statement-of-faith` | Statement of Faith | /about | |
| 11 | `/team-4` | Staff | /about | Three bios |
| 12 | `/giving` | Giving | /about | Links to the church's Vanco |
| 13 | `/volunteer` | Volunteer | /about | |
| 14 | `/about-5` | Volunteer | /about, labelled **"Media"** | **Duplicate of #13** |
| 15 | `/daily-course-offerings` | Daily Course Offerings | /courses | |
| 16 | `/full-course-descriptions` | Full Course Descriptions | /courses | |
| 17 | `/courses-by-grade-level` | Courses by Grade Level | /courses | |
| 18 | `/special-announcement` | Special Announcement | /calendars-and-events | Weis Markets fundraiser |
| 19 | `/download-calendars` | Download Calendars | /calendars-and-events | |

Slugs 7, 8, 9, 14 (`/about-3`, `/about-1`, `/general-8`, `/about-5`) are Wix autogenerated and
carry no meaning. They should be renamed on migration, with 301s from the old paths.

**Off-site targets that need a decision each:**

- Apply Now → Google Form `1FAIpQLSfs9SzH…` — replaced by the new flow
- Volunteer Information Sheet → Google Form `1FAIpQLSf1w0N…` — **also needs a decision**; it is a second form, not mentioned anywhere in the brief
- Give → `secure.myvanco.com/YH8R/home` (the church's, not Pharos's)
- `weis4school.com` (fundraiser, school ID 88082), `enolacog.com` (host church),
  Facebook `61574661741710`, YouTube `@PharosAcademy`,
  `enolacog.com/_files/.../…f557.pdf` ("Here We Stand 2016", a 50-page denominational
  doctrinal statement hosted on the church's domain and linked from the Statement of Faith page)

The Wix contact form in the footer of every page has no visible destination. Where those
submissions currently land — a Wix inbox, an email — needs to be established before cutover, or
enquiries will be silently dropped.

---

## Content redundancy list

**This list is for discussion with school leadership, not for action.** Removing content requires
their confirmation. This is the audit promised to George.

**True duplicates**

1. `/volunteer` and `/about-5` are the same page, word for word, both linked from `/about` — one
   as "Get Involved - Be a Volunteer!", the other as "Media". Keep one; the "Media" nav item is
   either a mislabel or a placeholder for content that was never written.
2. Mission and Vision statements appear verbatim in four places: `/core-values`, the handbook PDF,
   the Volunteer Google Form, and (the vision, partially) the homepage hero.
3. The H.O.P.E. acronym paragraph appears on `/` and again in the handbook.
4. The address block and Jill's phone number appear in the footer of all 19 pages, plus `/about-1`,
   plus the Apply Now form, plus the handbook.

**The three course presentations**

`/daily-course-offerings`, `/full-course-descriptions`, and `/courses-by-grade-level` are three
views of one dataset, each maintained by hand, each also mirrored as a PDF — nine artefacts for
one set of facts. They have already drifted (see below). In the new site this should be one
data source with three renderings, which removes the drift class entirely rather than fixing
individual instances.

**PDF/HTML pairs.** Five pages exist as both HTML and a downloadable PDF of the same content
(three course pages, the Statement of Faith, the Weis fundraiser). Worth asking whether the PDFs
serve a real need — printing for a co-op table, say — or are just a second thing to update.

**Possibly obsolete**

- `/special-announcement` — Weis Markets fundraiser. The July board update describes several other
  active fundraisers (Senators game, Texas Roadhouse, envelope wall, R&K Subs) that have no page,
  so this one page is either the sole survivor of a series or is stale.
- "Latest School Board Update - 7/1/2026" on `/calendars-and-events` — a dated PDF in a fixed slot.
  Either it becomes a real updates feed or it will read as stale by October.

---

## Content defects found

These are errors in the school's own published material. Flagging, not fixing.

| Where | Defect |
|---|---|
| `/courses-by-grade-level` vs `/daily-course-offerings` | Intro to Church and Bible History is "Ages 6-8" on two pages and "Ages 10-14" on the third |
| Calendar PDFs | "EASTER MONDAY OFF (3/26)" — 3/26/2027 is a Friday; the actual gap is Mon 3/29 |
| Handbook p.3 vs p.8 | Study hall fee given as $10 and as $60 |
| Handbook p.3 | "withdraw from classes **1weeks** before the start of class" and "requested in advance **1 weeks** before the start of each semester" — missing a space in one, and probably a missing digit in both |
| Child Protection PDF p.5 | A literal `??` left in the published text after "Personal Conduct / Morals Clause" |
| `/full-course-descriptions` | Stray backtick after "Mrs. Chelsea Miller\`" |
| Poetry, Plays, and Patterns | Required Text is "TBA" |
| The Pilgrim's Progress | Date list skips Wed 2026-09-30, a scheduled class day, without explanation |
| Board update vs site | Board update (7/1) says "13 classes"; the site lists 19 |
| Site-wide footer | "© 2025 by Pharos Academy" — a year stale |

---

## Structured course data

`data/courses.json` — all 19 courses with title, description-derived fields, cost, hourly rate,
contact hours, schedule, day, age range, stage, credit, texts, materials fee, assessment fee,
prerequisites, and instructor, plus a per-course `conflicts` array recording every place the three
presentations disagree.

Findings worth carrying forward into the class-selection design:

- **Enrolment units differ per course.** Full year, single semester, or a fixed block of 6, 8, or
  12 dated sessions. One course (Church and Bible History) offers full-year *or* either single
  semester. A single "enrol in a class" primitive will not fit.
- **The Wednesday 10:40 slot is deliberately oversubscribed** — five elective courses share it
  across the year, several overlapping in date range. Clash detection is required, not optional.
- **Monday 11:20** has a genuine clash: Algebra 1 and Beginner Latin (Grades 5-6).
- **Instructors are a real entity.** Eight of them, one (Mrs. Mandy Saint) teaching eight of the 19 courses.
  Given that tuition currently flows to instructors, they may need to exist in the data model.
- **Ages, not grades, are the primary axis.** Every course states an age range; grade equivalents
  are given as approximations. The published span is 4–18.

---

## How this was captured

`playwright-core` driving the installed Chrome, headless, 1400×1000. Per page: navigate,
wait for load, click every `[aria-expanded="false"]`, scroll the full height to trigger lazy
content, settle, then extract `innerText` and the link graph. Crawl seeded from `/` and followed
the internal link graph to closure. Sitemaps were tried first and all 404. PDF text extracted
with `pdfjs-dist`. The crawl scripts are not committed — they are single-use and the output is
the artefact.
