"""PROTOTYPE — throwaway TUI shell for issue #8. All logic lives in flow.py.

Run:  python prototypes/application-flow/tui.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import flow as F  # noqa: E402

B, D, R = "\x1b[1m", "\x1b[2m", "\x1b[0m"
RED, YEL, GRN, CYA = "\x1b[31m", "\x1b[33m", "\x1b[32m", "\x1b[36m"

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


# ---------------------------------------------------------------- input


def getkey() -> str:
    if not sys.stdin.isatty():
        # headless: replay a keystroke script from stdin, one character per action.
        ch = sys.stdin.read(1)
        if not ch:
            return "q"
        return {"\n": " ", "<": "UP", ">": "DOWN"}.get(ch, ch)
    try:
        import msvcrt

        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            code = msvcrt.getwch()
            return {"H": "UP", "P": "DOWN", "K": "LEFT", "M": "RIGHT"}.get(code, "?")
        if ch == "\r":
            return "ENTER"
        if ch == "\x03":
            raise KeyboardInterrupt
        return ch
    except ImportError:
        import termios
        import tty

        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
            if ch == "\x1b":
                seq = sys.stdin.read(2)
                return {"[A": "UP", "[B": "DOWN", "[D": "LEFT", "[C": "RIGHT"}.get(seq, "?")
            if ch == "\r":
                return "ENTER"
            if ch == "\x03":
                raise KeyboardInterrupt
            return ch
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)


def ask(prompt: str, default: str = "") -> str:
    print(f"\n{B}{prompt}{R} {D}[{default}]{R} ", end="", flush=True)
    try:
        val = input().strip()
    except EOFError:
        val = ""
    return val or default


# ---------------------------------------------------------------- state


class UI:
    def __init__(self):
        self.w = F.seed_world()
        self.screen = "home"
        self.cursor = 0
        self.student = 0
        self.filter_age = True
        self.msg = ""
        self.events: list = []

    @property
    def app(self):
        return F.app_by_id(self.w, self.w.current) if self.w.current else None

    @property
    def stu(self):
        a = self.app
        if not a or not a.students:
            return None
        self.student = min(self.student, len(a.students) - 1)
        return a.students[self.student]


# ---------------------------------------------------------------- render helpers


def hhmm(m: int) -> str:
    h, mi = divmod(m, 60)
    ap = "am" if h < 12 else "pm"
    h12 = h if 1 <= h <= 12 else abs(h - 12) or 12
    return f"{h12}:{mi:02d}{ap}"


def banner(ui: UI) -> list:
    w = ui.w
    slot = f"{GRN}LIVE (Vanco simulated){R}" if w.payment_slot_live else f"{D}empty — cheque by post{R}"
    return [
        f"{B}PHAROS APPLICATION FLOW{R} {D}prototype for #8 — throwaway{R}",
        f"{D}day {w.day}   applications {len(w.applications)}   payment slot: {R}{slot}",
        "",
    ]


def app_summary(ui: UI) -> list:
    a = ui.app
    if not a:
        return [f"{D}no application open — [n] start one{R}", ""]
    owed = F.money_owed(ui.w, a)
    p = a.payment
    pay = {
        "not_due": f"{D}not due{R}",
        "awaiting": f"{YEL}awaiting cheque (due day {p.due_day}){R}",
        "overdue": f"{RED}CHEQUE OVERDUE{R}",
        "received": f"{GRN}cheque received day {p.settled_day}{R}",
        "paid_online": f"{GRN}paid online day {p.settled_day}{R}",
    }[p.status]
    sof = ", ".join(
        f"{r.respondent[:1]}{'+' if r.present and all(x is not None for x in r.answers) else '?' if r.present else '-'}"
        for r in a.sof
    )
    lines = [
        f"{B}{a.id}{R}  {a.family_name or D + '(no name)' + R}  {D}{a.email}{R}",
        f"  status {B}{a.status}{R}   application-state and payment-state are separate: {pay}",
        f"  students {len(a.students)}   classes {len([s for s in a.selections if s.status != 'withdrawn'])}"
        f"   SoF {sof}   {D}from inquiry: {a.from_inquiry or 'no — clean slate'}{R}",
        f"  {B}due now ${owed['due_now']}{R} {D}(reg ${owed['registration']} + deposits ${owed['deposits']})"
        f"   tuition to instructors ${owed['tuition_gross']}{R}"
        f" {YEL}or ${owed['tuition_if_deposit_credited']}{R} {D}(unresolved)   other fees ${owed['other_fees']}{R}",
    ]
    return lines + [""]


# ---------------------------------------------------------------- screens


def screen_home(ui: UI) -> list:
    out = [f"{B}HOME{R}", ""]
    out += [
        f"{D}The flow: Statement of Faith gate -> class selection -> [payment slot] -> confirmation.{R}",
        f"{D}The slot is designed in and empty at launch. Press [v] to drop Vanco into it and watch{R}",
        f"{D}whether anything else in the model has to move.{R}",
        "",
        f"  {B}n{R} new application, clean slate",
        f"  {B}i{R} new application, pre-filled from inquiry INQ-014 (Whitmore, children 13 and 7)",
        f"  {B}o{R} open an existing application",
        "",
    ]
    for a in ui.w.applications:
        mark = ">" if a.id == ui.w.current else " "
        out.append(f" {mark} {a.id}  {a.family_name or '(draft)':12} {a.status:12} {D}{a.payment.status}{R}")
    return out


def screen_family(ui: UI) -> list:
    a = ui.app
    out = [f"{B}FAMILY AND STUDENTS{R}", ""]
    if not a:
        return out + [f"{D}open an application first{R}"]
    for i, s in enumerate(a.students):
        mark = f"{CYA}>{R}" if i == ui.student else " "
        n = len(F.student_selections(a, s.id))
        out.append(f" {mark} {s.name:16} age {s.age if s.age is not None else '?':>3}   {D}{n} classes{R}")
    out += [
        "",
        f"{D}Not collected here, and that is the open question: DOB, home address, allergies and{R}",
        f"{D}medical conditions, learning-disability / ADHD / mental-health evaluation history,{R}",
        f"{D}custody arrangements. The live Google Form asks for all of it, up front, from a{R}",
        f"{D}stranger. This prototype takes name + age only and defers the rest — [w] to see what{R}",
        f"{D}the deferred set would look like as a separate, later, signed-on-paper step.{R}",
        "",
        f"  {B}a{R} add student   {B}e{R} edit selected   {B}UP/DOWN{R} select   {B}f{R} family name/email   {B}w{R} sensitive-data note",
    ]
    return out


def screen_classes(ui: UI) -> list:
    a, stu = ui.app, ui.stu
    out = [f"{B}CLASS SELECTION{R}  " + (f"{D}for {stu.name}, age {stu.age}{R}" if stu else "")]
    if not a or not stu:
        return out + ["", f"{D}add a student first{R}"]

    cat = ui.w.catalogue
    shown = [
        c
        for c in cat
        if not ui.filter_age or stu.age is None or c.age_min is None or (c.age_min <= stu.age <= c.age_max)
    ]
    if not shown:
        shown = cat
    ui.cursor = max(0, min(ui.cursor, len(shown) - 1))
    sel_map = {s.course_id: s for s in F.student_selections(a, stu.id)}

    out += [
        f"{D}filter by age: {'ON' if ui.filter_age else 'OFF'}  ({len(shown)}/{len(cat)} courses)   "
        f"a course offers year OR a semester, never both{R}",
        "",
    ]
    for i, c in enumerate(shown):
        cur = f"{CYA}>{R}" if i == ui.cursor else " "
        s = sel_map.get(c.id)
        box = f"{GRN}[x]{R}" if s else "[ ]"
        off = c.offerings[s.offering] if s else c.offerings[0]
        unit = off.label + ("" if off.certain else f" {YEL}?{R}")
        days = "/".join(d[:3] for d in c.days)
        title = c.title[:38]
        price = f"${off.price}"
        flag = f" {YEL}!{R}" if c.data_notes else ""
        line = f" {cur}{box} {title:38} {D}{days:8} {hhmm(c.start)}-{hhmm(c.end):8}{R} {unit:20} {price:>5}{flag}"
        out.append(line if s else f"{D}{line}{R}" if False else line)

    out.append("")
    cl = F.clashes(ui.w, a, stu.id)
    for x, y, sev in cl:
        cx, cy = F.course_by_id(ui.w, x.course_id), F.course_by_id(ui.w, y.course_id)
        col = RED if sev == "clash" else YEL
        word = "CLASH" if sev == "clash" else "POSSIBLE CLASH (block dates unpublished)"
        out.append(f" {col}{word}{R}: {cx.title} vs {cy.title} {D}({'/'.join(set(cx.days) & set(cy.days))} {cx.time_text}){R}")
    for stu2, c in F.age_warnings(ui.w, a):
        if stu2.id == stu.id:
            out.append(f" {YEL}AGE{R}: {stu2.name} is {stu2.age}; {c.title} is published for {c.ages_text}")
    if not cl:
        out.append(f" {D}no clashes{R}")

    hovered = shown[ui.cursor]
    if hovered.data_notes:
        out.append("")
        for n in hovered.data_notes:
            out.append(f" {YEL}!{R} {hovered.title}: {D}{n}{R}")

    out += [
        "",
        f"  {B}UP/DOWN{R} move  {B}SPACE{R} select/deselect  {B}u{R} cycle enrolment unit  "
        f"{B}g{R} age filter  {B}TAB{R} next student",
    ]
    return out


def screen_sof(ui: UI) -> list:
    a = ui.app
    out = [f"{B}STATEMENT OF FAITH{R}  {D}version {F.STATEMENT_OF_FAITH_VERSION}{R}", ""]
    if not a:
        return out + [f"{D}open an application first{R}"]
    out += [
        f"{D}Disclose-and-discuss, not pass/fail. An objection never blocks submission — it{R}",
        f"{D}routes the application to a conversation. Asked separately of each respondent.{R}",
        "",
    ]
    for i, r in enumerate(a.sof):
        state = "present" if r.present else f"{D}not part of this household{R}"
        out.append(f" {B}{i + 1}{R}. {r.respondent:10} {state}")
        if r.present:
            for j, q in enumerate(F.SOF_QUESTIONS):
                v = r.answers[j]
                mark = f"{GRN}yes{R}" if v is True else f"{YEL}no{R}" if v is False else f"{RED}--{R}"
                out.append(f"      {D}{j + 1}) {q:62}{R} {mark}")
    out += [
        "",
        f" objections recorded: {a.sof_objections or D + '(none written)' + R}",
        "",
        f"{D}What gets stored: which respondents answered, each answer, the free text, the day,{R}",
        f"{D}and the version of the Statement they saw. Not stored: whether they scrolled it.{R}",
        f"{D}A scroll-to-unlock control is a WCAG 2.2 AA hazard and buys no real evidence.{R}",
        "",
        f"  {B}f/m/g{R} toggle Father / Mother / Guardian present and answering yes",
        f"  {B}F/M/G{R} flip that respondent's answer to 'do you agree' to NO   {B}t{R} type an objection",
        f"  {D}(digits are the screen switcher — respondents cannot own them){R}",
    ]
    return out


def screen_review(ui: UI) -> list:
    a = ui.app
    out = [f"{B}REVIEW AND SUBMIT{R}", ""]
    if not a:
        return out + [f"{D}open an application first{R}"]
    for stu in a.students:
        out.append(f" {B}{stu.name}{R} {D}age {stu.age}{R}")
        for s in F.student_selections(a, stu.id):
            c = F.course_by_id(ui.w, s.course_id)
            o = c.offerings[s.offering]
            out.append(
                f"   {c.title[:40]:40} {D}{'/'.join(d[:3] for d in c.days):8}{R} {o.label:20} "
                f"${o.price:<5} {D}deposit ${F.MONEY['deposit_per_class']}{R}"
            )
    owed = F.money_owed(ui.w, a)
    out += [
        "",
        f" {B}Post a cheque for ${owed['due_now']}{R} to {F.MONEY['cheque_mail_to']}, payable to "
        f"{F.MONEY['cheque_payable_to']}.",
        f" {D}Tuition is paid direct to instructors — not to the school, not through this site.{R}",
        f" {YEL}Unresolved:{R} is the ${F.MONEY['deposit_per_class']} deposit credited against the course price, or on top of it?",
        f" {D}   deposit on top     -> the family owes instructors ${owed['tuition_gross']}{R}",
        f" {D}   deposit credited   -> the family owes instructors ${owed['tuition_if_deposit_credited']}{R}",
        f" {D}The published material does not say. The flow cannot state a family's total until it does.{R}",
        f" {D}Other fees ${owed['other_fees']} (materials, assessment).{R}",
        f" {D}All figures read from the money settings of #7, none hard-coded.{R}",
        "",
    ]
    probs = F.blocking_problems(ui.w, a)
    if probs:
        out.append(f" {RED}cannot submit:{R}")
        for p in probs:
            out.append(f"   - {p}")
    else:
        out.append(f" {GRN}ready to submit{R}")
    out += ["", f"  {B}s{R} submit"]
    return out


def screen_school(ui: UI) -> list:
    v = F.school_view(ui.w)
    out = [f"{B}WHAT THE SCHOOL RECEIVES{R}", ""]
    out.append(f"{B}Inbox{R}")
    for a in v["submitted"]:
        flags = []
        if any(x is False for r in a.sof if r.present for x in r.answers) or a.sof_objections:
            flags.append(f"{YEL}needs a conversation{R}")
        if a.payment.status == "overdue":
            flags.append(f"{RED}cheque overdue{R}")
        if a.supersedes:
            flags.append(f"{YEL}duplicate of {a.supersedes}{R}")
        out.append(
            f"  {a.id}  {a.family_name:12} {len(a.students)} students, "
            f"{len([s for s in a.selections if s.status != 'withdrawn'])} classes  "
            f"{D}${a.payment.amount_due} {a.payment.status}{R}  " + "  ".join(flags)
        )
    out += ["", f"{B}Class tally{R} {D}— the question the map's fog list calls 'how registrations tabulate'{R}"]
    for (title, unit), fams in v["tally"].items():
        out.append(f"  {title[:38]:38} {D}{unit:20}{R} {len(fams)}  {D}{', '.join(fams)}{R}")
    out += [
        "",
        f"{D}Failure paths — press the key and watch the state, not the happy path:{R}",
        f"  {B}t{R} advance 7 days (drafts go stale, cheques go overdue)   {B}c{R} receive cheque for current",
        f"  {B}k{R} confirm places for current   {B}d{R} same family applies twice   {B}v{R} flip the payment slot live",
        "",
    ]
    for e in ui.events[-4:]:
        out.append(f"  {YEL}*{R} {e}")
    return out


SCREENS = {
    "home": ("Home", screen_home),
    "family": ("Family", screen_family),
    "classes": ("Classes", screen_classes),
    "sof": ("Statement", screen_sof),
    "review": ("Review", screen_review),
    "school": ("School", screen_school),
}
ORDER = ["home", "family", "classes", "sof", "review", "school"]


def render(ui: UI) -> None:
    if sys.stdin.isatty():
        os.system("cls" if os.name == "nt" else "clear")
    else:
        print("\n" + "=" * 100)
    lines = banner(ui) + app_summary(ui)
    tabs = "  ".join(
        (f"{B}{i + 1} {SCREENS[k][0]}{R}" if k == ui.screen else f"{D}{i + 1} {SCREENS[k][0]}{R}")
        for i, k in enumerate(ORDER)
    )
    lines.append(tabs)
    lines.append(D + "-" * 100 + R)
    lines += SCREENS[ui.screen][1](ui)
    lines += ["", D + "-" * 100 + R, f"{D}1-6 screens   q quit{R}   " + (f"{CYA}{ui.msg}{R}" if ui.msg else "")]
    print("\n".join(lines))


# ---------------------------------------------------------------- loop


def handle(ui: UI, k: str) -> bool:
    ui.msg = ""
    w = ui.w
    a = ui.app

    if k == "q":
        return False
    if k in "123456":
        ui.screen = ORDER[int(k) - 1]
        return True
    if k == "v":
        w.payment_slot_live = not w.payment_slot_live
        ui.msg = "payment slot " + ("LIVE — new submissions pay online" if w.payment_slot_live else "empty again")
        return True
    if k == "t":
        if ui.screen == "sof" and a:
            a.sof_objections = ask("objection text", a.sof_objections)
        else:
            ui.events += F.advance_days(w, 7)
            ui.msg = f"day {w.day}"
        return True

    if ui.screen == "home":
        if k == "n":
            F.new_application(w)
            ui.screen = "family"
        elif k == "i":
            F.new_application(w, F.SEED_INQUIRY)
            ui.screen = "family"
            ui.msg = "pre-filled from inquiry — name, email, two children's ages"
        elif k == "o":
            aid = ask("application id", w.applications[-1].id if w.applications else "")
            if any(x.id == aid for x in w.applications):
                w.current = aid
        return True

    if not a:
        return True

    if ui.screen == "family":
        if k == "a":
            name = ask("student name", f"Child {len(a.students) + 1}")
            age = ask("age", "10")
            a.students.append(F.Student(len(a.students), name, int(age) if age.isdigit() else None))
            a.last_touched_day = w.day
        elif k == "e" and a.students:
            s = ui.stu
            s.name = ask("name", s.name)
            age = ask("age", str(s.age))
            s.age = int(age) if age.isdigit() else None
        elif k == "f":
            a.family_name = ask("family name", a.family_name or "Whitmore")
            a.email = ask("email", a.email or "family@example.com")
        elif k == "w":
            ui.msg = (
                "deferred to paper at enrolment: DOB, address, allergies, medical, "
                "evaluation history, custody"
            )
        elif k in ("UP", "DOWN") and a.students:
            ui.student = (ui.student + (1 if k == "DOWN" else -1)) % len(a.students)
        return True

    if ui.screen == "classes":
        stu = ui.stu
        if not stu:
            return True
        cat = w.catalogue
        shown = [
            c
            for c in cat
            if not ui.filter_age
            or stu.age is None
            or c.age_min is None
            or (c.age_min <= stu.age <= c.age_max)
        ] or cat
        ui.cursor = max(0, min(ui.cursor, len(shown) - 1))
        c = shown[ui.cursor]
        if k == "UP":
            ui.cursor = (ui.cursor - 1) % len(shown)
        elif k == "DOWN":
            ui.cursor = (ui.cursor + 1) % len(shown)
        elif k == " ":
            ui.msg = F.toggle_selection(w, a, stu.id, c.id, 0) + f": {c.title}"
            a.last_touched_day = w.day
        elif k == "u":
            sel = {s.course_id: s for s in F.student_selections(a, stu.id)}.get(c.id)
            if sel and len(c.offerings) > 1:
                sel.offering = (sel.offering + 1) % len(c.offerings)
                ui.msg = f"{c.title}: {c.offerings[sel.offering].label}"
            elif sel:
                ui.msg = f"{c.title} has one purchasable unit only"
            else:
                ui.msg = "select the course first"
        elif k == "j":
            ui.cursor = (ui.cursor + 1) % len(shown)
        elif k == "k":
            ui.cursor = (ui.cursor - 1) % len(shown)
        elif k == "g":
            ui.filter_age = not ui.filter_age
        elif k == "\t":
            ui.student = (ui.student + 1) % max(1, len(a.students))
            ui.cursor = 0
        return True

    if ui.screen == "sof":
        idx = {"f": 0, "m": 1, "g": 2}
        if k in idx:
            r = a.sof[idx[k]]
            r.present = not r.present
            r.answers = [True, True, True] if r.present else [None, None, None]
        elif k.lower() in idx and k.isupper():
            r = a.sof[idx[k.lower()]]
            r.present = True
            r.answers[1] = False if r.answers[1] is not False else True
            ui.msg = "recorded as a disagreement — this does not block submission"
        return True

    if ui.screen == "review" and k == "s":
        probs = F.submit(w, a)
        ui.msg = "submitted" if not probs else f"{len(probs)} problems"
        if not probs:
            ui.screen = "school"
        return True

    if ui.screen == "school":
        if k == "c":
            F.receive_cheque(w, a)
        elif k == "k":
            F.confirm_places(a)
        elif k == "d":
            twin = F.duplicate_application(w, a)
            twin.supersedes = a.id
            ui.msg = f"{twin.id} is a second application from the same family — nothing stopped it"
        return True

    return True


def main() -> None:
    ui = UI()
    while True:
        render(ui)
        try:
            k = getkey()
        except KeyboardInterrupt:
            break
        if k == "ENTER":
            k = " "
        if not handle(ui, k):
            break
    os.system("cls" if os.name == "nt" else "clear")
    print("prototype closed — capture findings on #8")


if __name__ == "__main__":
    main()
