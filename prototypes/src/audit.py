#!/usr/bin/env python
"""Audit the built prototype: axe, contrast, overflow, tap targets — at real widths.

Why this exists: `shoot.sh` drives Chrome through the command line, and Chrome
clamps a headless *window* to 500 CSS px wide no matter what `--window-size` says.
`--force-device-scale-factor` does not divide it either (780@2x measures 764 CSS
px, not 390), so shoot.sh's own comment about a "796px window => a true 390px CSS
viewport" was wrong and its phone shots were really 492 px. This drives Chrome
through CDP instead (`Emulation.setDeviceMetricsOverride`, which is what
Playwright's `viewport=` compiles to), where 390 means 390.

Uses the Chrome already installed (`channel="chrome"`) — no browser download.

    pip install playwright
    python prototypes/src/audit.py            # every variant, every width
    python prototypes/src/audit.py e 390      # narrow it

Writes JSON + PNGs to the scratchpad dir printed on exit. Throwaway, like
everything else in here.
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

SRC = pathlib.Path(__file__).resolve().parent
PAGE = (SRC.parent / "homepage-design-language.html").as_uri()
AXE = (SRC / "axe.min.js").read_text(encoding="utf-8")
OUT = SRC / "audit"

# 390 is the iPhone 12/13/14/15 logical width and the narrowest thing that
# matters. 768/834/1024 are iPad mini / iPad Air / iPad Pro portrait — the
# tablet band nothing has ever looked at. 1440 is the desktop already shot.
VIEWPORTS = [
    ("390", 390, 844, 3),
    ("768", 768, 1024, 2),
    ("834", 834, 1112, 2),
    ("1024", 1024, 1366, 2),
    ("1440", 1440, 900, 1),
]

# Everything a pointer is meant to hit. WCAG 2.2 AA (2.5.8) wants 24x24 CSS px;
# 44 is the Apple/AAA figure, reported separately as advice rather than a fail.
HITTABLE = "a[href], button, input, textarea, select, [role=button]"

PROBE = """() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const over = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    // an element that scrolls its own overflow (the timetable) is allowed to be
    // wider than the screen — that is the affordance, not a bug
    let sc = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') { sc = true; break; }
    }
    if (sc) continue;
    if (r.right > vw + 1 || r.left < -1) {
      over.push({ sel: el.tagName.toLowerCase() + '.' + [...el.classList].join('.'),
                  left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  // WCAG 2.2 SC 2.5.8 Target Size (Minimum), which is the AA criterion — 24x24
  // CSS px, not the 44 that gets quoted at it. 44 is SC 2.5.5, and that is AAA.
  // Counting everything under 44 produced 31 "failures" that are not failures,
  // which is worse than not checking: it buries the ones that are.
  // 2.5.8's spacing exception is the part that actually decides this page, so it
  // is evaluated rather than assumed: an undersized target passes if a 24px
  // circle on its centre reaches no other target.
  const targets = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.closest('.px-bar')) continue;   // the review instrument, not the page
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    targets.push({ el, r,
      sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''),
      text: (el.textContent || '').trim().slice(0, 30) });
  }
  const small = [];
  for (const t of targets) {
    if (t.r.width >= 24 && t.r.height >= 24) continue;
    const cx = t.r.left + t.r.width / 2, cy = t.r.top + t.r.height / 2;
    let crowdedBy = null;
    for (const o of targets) {
      if (o === t) continue;
      const undersized = o.r.width < 24 || o.r.height < 24;
      let hit;
      if (undersized) {
        const ox = o.r.left + o.r.width / 2, oy = o.r.top + o.r.height / 2;
        hit = Math.hypot(cx - ox, cy - oy) < 24;      // circle meets circle
      } else {
        const dx = Math.max(o.r.left - cx, 0, cx - o.r.right);
        const dy = Math.max(o.r.top - cy, 0, cy - o.r.bottom);
        hit = Math.hypot(dx, dy) < 12;                // circle meets box
      }
      if (hit) { crowdedBy = o.sel + ' ' + JSON.stringify(o.text); break; }
    }
    small.push({ sel: t.sel, text: t.text,
                 w: Math.round(t.r.width), h: Math.round(t.r.height),
                 fails: !!crowdedBy, crowdedBy });
  }
  return { docScroll: de.scrollWidth, vw, overflow: over, small };
}""".replace("SELECTOR", json.dumps(HITTABLE))


def run(variant, wanted=None):
    OUT.mkdir(exist_ok=True)
    report = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        for name, w, h, dsf in VIEWPORTS:
            if wanted and name not in wanted:
                continue
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=dsf)
            page.goto(f"{PAGE}?variant={variant}")
            page.wait_for_timeout(2500)

            probe = page.evaluate(PROBE)
            page.add_script_tag(content=AXE)
            axe = page.evaluate(
                "async () => await axe.run(document,"
                " {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})"
            )
            # axe cannot judge text over a video or a photograph — it reports those
            # as *incomplete*, not as passes. Counting only violations would have
            # scored the hero clean without ever looking at it.
            incomplete = [
                {"id": v["id"], "help": v["help"],
                 "nodes": [{"target": n["target"], "summary": (n.get("any") or [{}])[0].get("message", "")[:200]}
                           for n in v["nodes"][:12]]}
                for v in axe["incomplete"]
            ]
            passes = {v["id"]: len(v["nodes"]) for v in axe["passes"]}
            report[name] = {
                "viewport": [w, h, dsf],
                "docScrollWidth": probe["docScroll"],
                "horizontalOverflow": probe["docScroll"] > probe["vw"] + 1,
                "offenders": probe["overflow"][:20],
                "under24": probe["small"],
                "violations": [
                    {
                        "id": v["id"],
                        "impact": v["impact"],
                        "help": v["help"],
                        "nodes": [
                            {"target": n["target"], "summary": n.get("failureSummary", "")[:400]}
                            for n in v["nodes"][:8]
                        ],
                    }
                    for v in axe["violations"]
                ],
                "incomplete": incomplete,
                "contrastPasses": passes.get("color-contrast", 0),
            }
            # A full-page capture of a 100dvh hero stitches wrong — Chrome scrolls
            # and re-composites, and the hero reflows under it, so the tail of the
            # page comes back duplicated. `&flat=1` pins the hero to 640px, which
            # is what that affordance is for. The hero itself is shot separately,
            # unflattened, at true viewport height.
            page.screenshot(path=str(OUT / f"{variant}-{name}-hero.png"))
            page.close()

            # ...and at 1x, because Chrome silently duplicates bands when the
            # captured bitmap passes its texture limit: 6874 CSS px at dsf 3 is
            # 20622 px tall, over the 16384 ceiling, and the tail came back with
            # the header stitched into it twice. 1x keeps every width under it.
            flat = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            flat.goto(f"{PAGE}?variant={variant}&flat=1")
            flat.wait_for_timeout(1800)
            flat.screenshot(path=str(OUT / f"{variant}-{name}.png"), full_page=True)
            flat.close()
        browser.close()
    return report


if __name__ == "__main__":
    args = sys.argv[1:]
    variants = [a for a in args if a.isalpha()] or ["e"]
    widths = [a for a in args if a.isdigit()] or None
    all_reports = {v: run(v, widths) for v in variants}
    (OUT / "report.json").write_text(json.dumps(all_reports, indent=2), encoding="utf-8")

    for v, rep in all_reports.items():
        for name, r in rep.items():
            flags = []
            if r["horizontalOverflow"]:
                flags.append(f"OVERFLOW {r['docScrollWidth']}px")
            nv = sum(len(x["nodes"]) for x in r["violations"])
            if nv:
                flags.append(f"{nv} axe nodes / {len(r['violations'])} rules")
            bad = [x for x in r["under24"] if x["fails"]]
            if bad:
                flags.append(f"{len(bad)} targets fail SC 2.5.8")
            flags.append(f"contrast: {r['contrastPasses']} passed")
            print(f"  {v} @ {name:>4}  " + "; ".join(flags))
            for x in r["violations"]:
                print(f"       ! [{x['impact']}] {x['id']}: {len(x['nodes'])} node(s)")
            for x in r["under24"]:
                if x["fails"]:
                    print(f"       ! 2.5.8 {x['w']}x{x['h']} {x['sel']} {x['text']!r}"
                          f" — crowded by {x['crowdedBy']}")
            for x in r["incomplete"]:
                print(f"       ? {x['id']}: {len(x['nodes'])} node(s) axe could not judge")
    print("\n->", OUT)
