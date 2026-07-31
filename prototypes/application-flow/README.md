# Application flow — throwaway logic prototype

**Question:** [#8 — Decide the shape of the application, class selection and the deferred
payment slot](https://github.com/wyattwsaint/pharos-academy-site/issues/8).

Behaviour, not appearance (appearance inherits [#12](https://github.com/wyattwsaint/pharos-academy-site/issues/12)).
Specifically: can one state model hold the real 2026-27 catalogue — per-course enrolment
units, a genuine Monday 11:20 clash, a deliberately oversubscribed Wednesday 10:40 slot,
ages rather than grades — keep **applied** and **paid** as separate states, and hold an
**empty payment slot** that a Vanco stage drops into later without redesign?

## Run

```
python prototypes/application-flow/tui.py
```

Windows or POSIX, stdlib only. `courses.json` is a copy of `docs/mirror/data/courses.json`
from the `mirror/site-inventory` branch — all 19 real courses, real times, real prices.

## Shape

- `flow.py` — pure. Catalogue derivation, clash detection, money, the reducer-ish action
  set, the school's view. This is the part worth lifting if the model survives.
- `tui.py` — throwaway shell. Six screens: Home, Family, Classes, Statement, Review,
  School. `1`–`6` switch, `q` quits.

Two applications are seeded so the class tally is not a list of one.

## What to press

- Home `i` — start an application **pre-filled from an inquiry** (name, email, two
  children's ages), or `n` for a clean slate. That is the pre-fill question, live.
- Classes — pick **Algebra 1** and **Beginner Latin (5-6)** for a 13-year-old. Monday
  11:20, hard clash. Then `u` to move Latin to a semester and watch the clash *survive*,
  because Algebra 1 is a full year.
- Classes — pick two of the Wednesday 10:40 blocks for a 7-year-old. **Possible clash**,
  not a clash: no block start dates are published anywhere, so the site cannot know.
- `!` in the course list — the published data does not say whether a full-year course can
  be bought one semester at a time, even though it prints a semester price. Nine courses.
- Statement — `x` records a disagreement. It does **not** block submission.
- Review — the deposit-vs-tuition ambiguity, in dollars.
- School `t` — advance a week. Drafts go stale, cheques go overdue. `d` — the same family
  applies twice, and nothing stops it.
- `v` anywhere — drop Vanco into the payment slot and re-submit. Watch what else has to
  move.

## Status

Open. Findings go on #8; this directory dies once they are captured.
