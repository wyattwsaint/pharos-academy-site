"""PROTOTYPE — throwaway. Pure logic module for issue #8.

QUESTION
--------
How does a family get from "the school has spoken to us" to enrolled, and what does
the school receive?

Specifically, the state-model half of that: can one model express the real 2026-27
course catalogue (per-course enrolment units, a genuine Monday 11:20 clash, a
deliberately oversubscribed Wednesday 10:40 slot, ages rather than grades), keep
"applied" and "paid" as separate states, and hold an empty payment slot that a Vanco
stage can later drop into without redesign?

No I/O, no terminal code in here. tui.py is the throwaway shell; this module is the
part worth lifting if the model survives contact.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, replace
from pathlib import Path

# --------------------------------------------------------------------------------------
# Money settings. Per #7 these are school-wide editable settings, never hard-coded in the
# flow. Here they are one dict so the prototype can show them being read, not baked in.
# --------------------------------------------------------------------------------------

MONEY = {
    "registration_fee_per_student": 25,
    "deposit_per_class": 100,
    "cheque_payable_to": "Pharos Academy",
    "cheque_mail_to": "9 Sherwood Drive, Enola, PA 17025",
    "cheque_grace_days": 14,
}

STATEMENT_OF_FAITH_VERSION = "2026-07-23"

SOF_QUESTIONS = [
    "Have you read the Statement of Faith in full?",
    "Do you agree with the Statement of Faith?",
    "Will you support it in your home while your child attends?",
]
SOF_RESPONDENTS = ["Father", "Mother", "Guardian"]


# --------------------------------------------------------------------------------------
# Catalogue
# --------------------------------------------------------------------------------------

TERM_YEAR, TERM_FALL, TERM_SPRING, TERM_BLOCK = "YEAR", "FALL", "SPRING", "BLOCK"


@dataclass(frozen=True)
class Offering:
    """One purchasable unit of a course. A course offers year OR either semester, or a
    single fixed block — never a free combination."""

    term: str
    weeks: int
    price: int
    label: str
    certain: bool = True  # False = the published data does not actually say this exists


@dataclass(frozen=True)
class Course:
    id: int
    title: str
    days: tuple
    start: int  # minutes from midnight
    end: int
    time_text: str
    duration_text: str
    ages_text: str
    age_min: int | None
    age_max: int | None
    instructor: str
    offerings: tuple
    materials_fee: int | None
    assessment_fee: int | None
    data_notes: tuple


def _parse_time(text: str) -> tuple[int, int]:
    """'11:20 a.m.-12:20 p.m.' -> (680, 740)."""
    parts = [p.strip() for p in text.replace("–", "-").split("-")]
    meridiems = [("p" if "p.m" in p or "pm" in p else ("a" if "a.m" in p or "am" in p else None)) for p in parts]
    if meridiems[0] is None:
        meridiems[0] = meridiems[1]
    out = []
    for part, mer in zip(parts, meridiems):
        m = re.search(r"(\d{1,2}):(\d{2})", part)
        h, mi = int(m.group(1)), int(m.group(2))
        if mer == "p" and h != 12:
            h += 12
        if mer == "a" and h == 12:
            h = 0
        out.append(h * 60 + mi)
    return out[0], out[1]


def _parse_ages(text: str) -> tuple[int | None, int | None]:
    m = re.match(r"\s*(\d{1,2})\s*-\s*(\d{1,2})", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def _derive_offerings(c: dict) -> tuple[list, list]:
    """Infer the purchasable units from the published duration + cost. Where the source
    is ambiguous the offering is emitted with certain=False and a note — the ambiguity is
    a finding, not something to quietly resolve."""
    d = c["duration"].lower()
    cost = c["cost"]
    notes: list = []

    if "flat" in cost:
        weeks = int(re.search(r"(\d+)\s*week", d).group(1))
        return [Offering(TERM_BLOCK, weeks, cost["flat"], f"{weeks}-week block")], [
            "block start date is not published anywhere, so a block's term is unknown"
        ]

    offs: list = []
    if "full year" in d:
        offs.append(Offering(TERM_YEAR, 28, cost["year"], "Full year (28 wks)"))
        if "one semester" in d:
            offs.append(Offering(TERM_FALL, 14, cost["semester"], "Fall semester"))
            offs.append(Offering(TERM_SPRING, 14, cost["semester"], "Spring semester"))
        elif cost.get("semester"):
            offs.append(Offering(TERM_FALL, 14, cost["semester"], "Fall semester", certain=False))
            offs.append(Offering(TERM_SPRING, 14, cost["semester"], "Spring semester", certain=False))
            notes.append(
                "a semester price is published but the duration says full year only — "
                "is a single semester actually purchasable?"
            )
    elif "fall semester" in d:
        offs.append(Offering(TERM_FALL, 14, cost["semester"], "Fall semester"))
    elif "spring semester" in d:
        offs.append(Offering(TERM_SPRING, 14, cost["semester"], "Spring semester"))
    return offs, notes


def load_catalogue(path: Path | None = None) -> list:
    path = path or Path(__file__).with_name("courses.json")
    raw = json.loads(path.read_text(encoding="utf-8"))
    courses = []
    for i, c in enumerate(raw["courses"]):
        start, end = _parse_time(c["time"])
        offs, notes = _derive_offerings(c)
        lo, hi = _parse_ages(c["ages"])
        if lo is None:
            notes.append("no numeric age range published — this course is stated in grades only")
        courses.append(
            Course(
                id=i,
                title=c["title"],
                days=tuple(c["days"]),
                start=start,
                end=end,
                time_text=c["time"],
                duration_text=c["duration"],
                ages_text=c["ages"],
                age_min=lo,
                age_max=hi,
                instructor=c["instructor"],
                offerings=tuple(offs),
                materials_fee=c.get("materialsFee"),
                assessment_fee=c.get("assessmentFee"),
                data_notes=tuple(notes),
            )
        )
    return courses


# --------------------------------------------------------------------------------------
# Term overlap
# --------------------------------------------------------------------------------------

_TERM_HALVES = {TERM_YEAR: {"F", "S"}, TERM_FALL: {"F"}, TERM_SPRING: {"S"}}


def terms_overlap(a: str, b: str) -> str:
    """'yes' | 'no' | 'unknown'. Blocks have no published dates, so a block against a
    single semester is genuinely unknown."""
    if TERM_BLOCK in (a, b):
        other = b if a == TERM_BLOCK else a
        if a == b == TERM_BLOCK:
            return "unknown"
        return "yes" if other == TERM_YEAR else "unknown"
    return "yes" if _TERM_HALVES[a] & _TERM_HALVES[b] else "no"


# --------------------------------------------------------------------------------------
# Application state
# --------------------------------------------------------------------------------------


@dataclass
class Student:
    id: int
    name: str
    age: int | None = None


@dataclass
class Selection:
    student_id: int
    course_id: int
    offering: int  # index into course.offerings
    status: str = "requested"  # requested | confirmed | withdrawn


@dataclass
class SoFResponse:
    respondent: str
    present: bool = False
    answers: list = field(default_factory=lambda: [None, None, None])  # True/False/None


@dataclass
class Payment:
    """The slot. At launch mode='cheque'; the Vanco stage flips mode without the
    surrounding states changing shape."""

    mode: str = "cheque"  # cheque | online
    status: str = "not_due"  # not_due | awaiting | received | overdue | paid_online
    amount_due: int = 0
    due_day: int | None = None
    settled_day: int | None = None


@dataclass
class Application:
    id: str
    family_name: str = ""
    email: str = ""
    phone: str = ""
    students: list = field(default_factory=list)
    selections: list = field(default_factory=list)
    sof: list = field(default_factory=lambda: [SoFResponse(r) for r in SOF_RESPONDENTS])
    sof_objections: str = ""
    sof_version: str = STATEMENT_OF_FAITH_VERSION
    sof_recorded_day: int | None = None
    status: str = "draft"  # draft | submitted | in_discussion | enrolled | withdrawn | stale
    submitted_day: int | None = None
    last_touched_day: int = 0
    payment: Payment = field(default_factory=Payment)
    from_inquiry: str | None = None  # inquiry id, if pre-filled
    supersedes: str | None = None


@dataclass
class World:
    """Everything the school can see. Deliberately holds more than one application so
    the tabulation question is visible."""

    day: int = 0
    catalogue: list = field(default_factory=load_catalogue)
    applications: list = field(default_factory=list)
    current: str = ""
    payment_slot_live: bool = False  # flip to simulate Vanco arriving later


# --------------------------------------------------------------------------------------
# Derived — pure functions over the state
# --------------------------------------------------------------------------------------


def app_by_id(w: World, aid: str) -> Application:
    return next(a for a in w.applications if a.id == aid)


def course_by_id(w: World, cid: int) -> Course:
    return w.catalogue[cid]


def student_selections(app: Application, student_id: int) -> list:
    return [s for s in app.selections if s.student_id == student_id and s.status != "withdrawn"]


def clashes(w: World, app: Application, student_id: int) -> list:
    """Every pairwise timetable collision for one student. Returns
    (sel_a, sel_b, severity) where severity is 'clash' | 'possible'."""
    out = []
    sels = student_selections(app, student_id)
    for i, a in enumerate(sels):
        for b in sels[i + 1 :]:
            ca, cb = course_by_id(w, a.course_id), course_by_id(w, b.course_id)
            shared_days = set(ca.days) & set(cb.days)
            if not shared_days:
                continue
            if not (ca.start < cb.end and cb.start < ca.end):
                continue
            ov = terms_overlap(ca.offerings[a.offering].term, cb.offerings[b.offering].term)
            if ov == "no":
                continue
            out.append((a, b, "clash" if ov == "yes" else "possible"))
    return out


def age_warnings(w: World, app: Application) -> list:
    out = []
    for s in app.selections:
        if s.status == "withdrawn":
            continue
        stu = next(x for x in app.students if x.id == s.student_id)
        c = course_by_id(w, s.course_id)
        if stu.age is None or c.age_min is None:
            continue
        if not (c.age_min <= stu.age <= c.age_max):
            out.append((stu, c))
    return out


def money_owed(w: World, app: Application) -> dict:
    """What the family posts a cheque for. Registration is per student per year;
    the deposit is per student per class. Tuition is NOT here — it goes to the
    instructor directly, per the handbook."""
    live = [s for s in app.selections if s.status != "withdrawn"]
    reg = len(app.students) * MONEY["registration_fee_per_student"]
    dep = len(live) * MONEY["deposit_per_class"]
    tuition = sum(course_by_id(w, s.course_id).offerings[s.offering].price for s in live)
    extras = 0
    for s in live:
        c = course_by_id(w, s.course_id)
        extras += (c.materials_fee or 0) + (c.assessment_fee or 0)
    return {
        "registration": reg,
        "deposits": dep,
        "due_now": reg + dep,
        "tuition_gross": tuition,
        # UNRESOLVED in the published material: is the $100 deposit a down-payment against
        # the course price, or does it sit on top of it? The two readings differ by $100
        # per class in what the family owes the instructor. The flow cannot show a family
        # what they owe until this is answered.
        "tuition_if_deposit_credited": tuition - dep,
        "other_fees": extras,
    }


def blocking_problems(w: World, app: Application) -> list:
    """What stops submission. Deliberately short — the Statement of Faith is
    disclose-and-discuss, so an objection never blocks."""
    out = []
    if not app.family_name or not app.email:
        out.append("family name and email are required")
    if not app.students:
        out.append("no students added")
    for stu in app.students:
        if not student_selections(app, stu.id):
            out.append(f"{stu.name or 'student'} has no classes selected")
        for a, b, sev in clashes(w, app, stu.id):
            if sev == "clash":
                ca, cb = course_by_id(w, a.course_id), course_by_id(w, b.course_id)
                out.append(f"{stu.name}: {ca.title} clashes with {cb.title}")
    answered = [r for r in app.sof if r.present]
    if not answered:
        out.append("nobody has answered the Statement of Faith questions")
    for r in answered:
        if any(x is None for x in r.answers):
            out.append(f"{r.respondent} has unanswered Statement of Faith questions")
    return out


def school_view(w: World) -> dict:
    """What the school receives. The tally is the thing #8 asks for and the map's fog
    list calls 'how class registrations tabulate'."""
    submitted = [a for a in w.applications if a.status in ("submitted", "in_discussion", "enrolled")]
    tally: dict = {}
    for a in submitted:
        for s in a.selections:
            if s.status == "withdrawn":
                continue
            c = course_by_id(w, s.course_id)
            key = (c.title, c.offerings[s.offering].label)
            tally.setdefault(key, []).append(a.family_name or a.id)
    return {
        "submitted": submitted,
        "tally": dict(sorted(tally.items())),
        "awaiting_cheque": [a for a in submitted if a.payment.status in ("awaiting", "overdue")],
    }


# --------------------------------------------------------------------------------------
# Actions — (world, action) -> world, mutated in place for prototype brevity
# --------------------------------------------------------------------------------------


def new_application(w: World, from_inquiry: dict | None = None) -> Application:
    aid = f"APP-{len(w.applications) + 1:03d}"
    app = Application(id=aid, last_touched_day=w.day)
    if from_inquiry:
        app.family_name = from_inquiry["family_name"]
        app.email = from_inquiry["email"]
        app.from_inquiry = from_inquiry["id"]
        for i, age in enumerate(from_inquiry["child_ages"]):
            app.students.append(Student(id=i, name=f"Child {i + 1}", age=age))
    w.applications.append(app)
    w.current = aid
    return app


def toggle_selection(w: World, app: Application, student_id: int, course_id: int, offering: int) -> str:
    existing = [
        s
        for s in app.selections
        if s.student_id == student_id and s.course_id == course_id and s.status != "withdrawn"
    ]
    if existing:
        app.selections.remove(existing[0])
        return "removed"
    app.selections.append(Selection(student_id, course_id, offering))
    return "added"


def submit(w: World, app: Application) -> list:
    problems = blocking_problems(w, app)
    if problems:
        return problems
    app.status = "submitted"
    app.submitted_day = w.day
    app.sof_recorded_day = w.day
    owed = money_owed(w, app)
    app.payment = Payment(
        mode="online" if w.payment_slot_live else "cheque",
        status="paid_online" if w.payment_slot_live else "awaiting",
        amount_due=owed["due_now"],
        due_day=None if w.payment_slot_live else w.day + MONEY["cheque_grace_days"],
        settled_day=w.day if w.payment_slot_live else None,
    )
    return []


def receive_cheque(w: World, app: Application) -> None:
    if app.payment.status in ("awaiting", "overdue"):
        app.payment.status = "received"
        app.payment.settled_day = w.day


def confirm_places(app: Application) -> None:
    for s in app.selections:
        if s.status == "requested":
            s.status = "confirmed"
    app.status = "enrolled"


def duplicate_application(w: World, app: Application) -> Application:
    """The same family applies twice. Nothing prevents it — the question is what the
    school sees."""
    twin = replace(
        app,
        id=f"APP-{len(w.applications) + 1:03d}",
        status="submitted",
        submitted_day=w.day,
        supersedes=None,
        payment=Payment(status="awaiting", amount_due=app.payment.amount_due, due_day=w.day + 14),
    )
    twin.selections = [Selection(s.student_id, s.course_id, s.offering) for s in app.selections]
    twin.students = [Student(s.id, s.name, s.age) for s in app.students]
    w.applications.append(twin)
    return twin


def advance_days(w: World, n: int) -> list:
    """Time passing is where the failure paths live."""
    w.day += n
    events = []
    for a in w.applications:
        if a.status == "draft" and w.day - a.last_touched_day >= 14:
            a.status = "stale"
            events.append(f"{a.id} went stale — abandoned mid-application, {w.day - a.last_touched_day} days untouched")
        if a.payment.status == "awaiting" and a.payment.due_day is not None and w.day > a.payment.due_day:
            a.payment.status = "overdue"
            events.append(f"{a.id} cheque overdue — applied day {a.submitted_day}, nothing arrived")
    return events


SEED_INQUIRY = {
    "id": "INQ-014",
    "family_name": "Whitmore",
    "email": "hannah.whitmore@example.com",
    "child_ages": [13, 7],
}


def seed_world() -> World:
    """Two applications already in the school's inbox, so the tally is not a list of one."""
    w = World()
    a = new_application(w)
    a.family_name, a.email = "Ballard", "ballard@example.com"
    a.students = [Student(0, "Ruth", 15), Student(1, "Tobias", 9)]
    a.selections = [
        Selection(0, 15, 0),  # Principles of Drawing, year
        Selection(0, 14, 0),  # Poetry Plays and Patterns, year
        Selection(1, 11, 0),  # Kingdom Math, year
    ]
    for r in a.sof[:2]:
        r.present, r.answers = True, [True, True, True]
    a.status, a.submitted_day = "submitted", 0
    a.payment = Payment(status="awaiting", amount_due=350, due_day=14)

    b = new_application(w)
    b.family_name, b.email = "Okoro", "okoro@example.com"
    b.students = [Student(0, "Ada", 11)]
    b.selections = [Selection(0, 2, 0), Selection(0, 4, 0)]  # Spanish 5-8, Latin 5-6
    b.sof[1].present, b.sof[1].answers = True, [True, True, True]
    b.status, b.submitted_day = "submitted", 0
    b.payment = Payment(status="received", amount_due=225, settled_day=3)

    w.current = ""
    return w
