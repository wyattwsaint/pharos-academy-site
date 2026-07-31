#!/usr/bin/env python
"""Measure the hero's real contrast — the one thing axe refuses to judge.

axe reports every element over the video as *incomplete*: "background color could
not be determined due to a background gradient". So the hero, which is the only
place on the page where type sits on a photograph, is the only place the automated
pass says nothing about. This measures it instead of assuming it.

Method: hide the hero's type (visibility, so layout is preserved), screenshot what
is actually behind it — video frame, scrim gradients and dim layer composited by
the browser — then, for every text box, compute the WCAG ratio of the type colour
against *each background pixel* it covers. Reported as the worst pixel and the
share of pixels below threshold, because a headline is only as readable as its
brightest patch of sky.

Sampled across the video's whole 8s loop (the brightest frame is the one that
matters, and it is not frame 0) and at both ends of the blur/dim ramp.

    python prototypes/src/hero_contrast.py            # variant e
    python prototypes/src/hero_contrast.py d          # compare against D
"""
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

SRC = pathlib.Path(__file__).resolve().parent
PAGE = (SRC.parent / "homepage-design-language.html").as_uri()
OUT = SRC / "audit"

WIDTHS = [(390, 844), (834, 1112), (1440, 900)]
RAMP = [0, 1]                       # ?p= pins the blur/dim ramp without scrolling
FRAMES = [0.0, 1.6, 3.2, 4.8, 6.4]  # across the 8s loop

MEASURE = """(v) => {
  const root = document.getElementById('v-' + v);
  const out = [];
  for (const el of root.querySelectorAll('.e-head a, .e-head b, .e-hero-copy h1,'
      + ' .e-hero-copy p, .e-hero-copy .wm, .e-hero-copy .e-tag, .e-hero-cta a,'
      + ' .e-hero-cta small, .d-head a, .d-head b, .d-hero-copy h1, .d-hero-copy p,'
      + ' .d-hero-cta a, .d-hero-cta small')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.top > innerHeight) continue;
    // a solid-background button is judged by axe already; only measure type that
    // actually sits on the photograph
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') continue;
    // Skip a wrapper whose text is really in a child that is also measured. The
    // brand link boxes the mark as well as the wordmark, so it was scoring the
    // wordmark against the mark's own gold beam and calling it a contrast
    // failure — a graphic behind a graphic, not type on a ground.
    if (el.querySelector('a, b, h1, p, em, small')) continue;
    // Skip type the ramp has already faded out. At ?p=1 the copy layer's opacity
    // is 0 by design, so anything measured there is contrast against a headline
    // nobody can see — and the wash, which lives inside that layer, is gone too,
    // which made it read as a regression rather than as invisible.
    let op = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      op *= parseFloat(getComputedStyle(n).opacity);
    }
    if (op < 0.15) continue;
    const px = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight) || 400;
    out.push({
      sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : ''),
      text: (el.textContent || '').trim().slice(0, 32),
      x: r.x, y: r.y, w: r.width, h: r.height,
      color: cs.color, size: px, weight: wt,
      large: px >= 24 || (px >= 18.66 && wt >= 700),
    });
  }
  return out;
}"""

# `visibility: hidden` on the copy container would take its *background* with it,
# and the copy container is exactly where the hero's scrim now lives — measuring
# that way reports the contrast of a fix that is switched off. Make the glyphs
# transparent instead: everything painted behind them stays, and the sampled
# pixels are literally the ones the type sits on. text-shadow has to go too — it
# still paints under transparent text, and WCAG gives it no credit anyway.
HIDE = """() => {
  const s = document.createElement('style');
  s.id = 'hc-hide';
  s.textContent = '.e-head *, .e-hero-copy *, .d-head *, .d-hero-copy *'
    + '{ color: transparent !important; text-shadow: none !important; }';
  document.head.appendChild(s);
}"""


def lum(c):
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_rgb(s):
    nums = s[s.index("(") + 1:s.index(")")].split(",")
    vals = [float(n) for n in nums]
    rgb = tuple(int(round(v)) for v in vals[:3])
    alpha = vals[3] if len(vals) > 3 else 1.0
    return rgb, alpha


def run(variant):
    OUT.mkdir(exist_ok=True)
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome",
                                    args=["--autoplay-policy=no-user-gesture-required"])
        for vw, vh in WIDTHS:
            for pr in RAMP:
                page = browser.new_page(viewport={"width": vw, "height": vh}, device_scale_factor=1)
                page.goto(f"{PAGE}?variant={variant}&p={pr}")
                page.wait_for_timeout(2500)
                boxes = page.evaluate(MEASURE, variant)
                page.evaluate(HIDE)
                for t in FRAMES:
                    page.evaluate(
                        "(t) => { for (const v of document.querySelectorAll('video'))"
                        " { v.pause(); try { v.currentTime = t; } catch (e) {} } }", t)
                    page.wait_for_timeout(450)
                    shot = OUT / f"bg-{variant}-{vw}-p{pr}-t{t}.png"
                    page.screenshot(path=str(shot))
                    img = Image.open(shot).convert("RGB")
                    for b in boxes:
                        # inset by 1px so the box edge itself is not sampled
                        x0, y0 = max(0, int(b["x"]) + 2), max(0, int(b["y"]) + 2)
                        x1 = min(img.width, int(b["x"] + b["w"]) - 2)
                        y1 = min(img.height, int(b["y"] + b["h"]) - 2)
                        if x1 <= x0 or y1 <= y0:
                            continue
                        crop = img.crop((x0, y0, x1, y1))
                        fg, alpha = parse_rgb(b["color"])
                        need = 3.0 if b["large"] else 4.5
                        worst, fails, total = 99.0, 0, 0
                        worst_px = None
                        # every 2nd pixel: same answer, a quarter of the work
                        for py in range(0, crop.height, 2):
                            for px_ in range(0, crop.width, 2):
                                bg = crop.getpixel((px_, py))
                                # the type's own alpha composites it onto that pixel
                                eff = tuple(int(round(fg[i] * alpha + bg[i] * (1 - alpha))) for i in range(3))
                                r = ratio(eff, bg)
                                total += 1
                                if r < need:
                                    fails += 1
                                if r < worst:
                                    worst, worst_px = r, bg
                        rows.append({
                            "vw": vw, "p": pr, "t": t, "sel": b["sel"], "text": b["text"],
                            "size": b["size"], "large": b["large"], "need": need,
                            "worst": worst, "worst_bg": worst_px,
                            "failpct": 100.0 * fails / max(1, total),
                        })
                    shot.unlink()
                page.close()
        browser.close()
    return rows


if __name__ == "__main__":
    variant = (sys.argv[1] if len(sys.argv) > 1 else "e")
    rows = run(variant)
    # worst case per element across every frame, ramp position and width
    agg = {}
    for r in rows:
        k = (r["sel"], r["text"])
        cur = agg.get(k)
        if cur is None or r["worst"] < cur["worst"]:
            agg[k] = r
    print(f"\nvariant {variant} — worst background pixel under each hero element")
    print(f"{'ratio':>7} {'need':>5} {'fail%':>6}  {'@w':>5} {'p':>2} {'t':>4}  element")
    for (sel, text), r in sorted(agg.items(), key=lambda kv: kv[1]["worst"]):
        mark = "FAIL" if r["worst"] < r["need"] else "ok"
        print(f"{r['worst']:7.2f} {r['need']:5.1f} {r['failpct']:5.1f}%  "
              f"{r['vw']:>5} {r['p']:>2} {r['t']:>4}  {mark:>4}  {sel} {text!r}")
