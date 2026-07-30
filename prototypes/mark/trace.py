# Redraw the Pharos mark from the only raster of it that exists.
#
#   python trace.py            # writes ../src/mark.svg
#
# The school never handed over artwork, so the source is source-287x335.jpg —
# the original upload behind the Wix logo, which the live site itself serves
# cropped to 76x110. Everything here is mechanical: upscale, separate the three
# flat colours, trace each one. No shape is invented and nothing is redesigned.
#
# Needs: pillow, numpy, scipy, potracer.

import pathlib

import numpy as np
import potrace
from PIL import Image
from scipy.ndimage import gaussian_filter

HERE = pathlib.Path(__file__).parent
SRC = HERE / "source-287x335.jpg"
OUT = HERE.parent / "src" / "mark.svg"

# The mark's true colours, read straight off the raster — each is thousands of
# exactly-equal pixels, so these are the values, not an average.
PALETTE = {
    "gold": (251, 176, 59),  # #FBB03B — the three beams
    "blue": (89, 166, 208),  # #59A6D0 — lighthouse and the light wave
    "deep": (77, 130, 161),  # #4D82A1 — the deep wave
}
VAR = {
    "gold": "var(--mark-gold, #FBB03B)",
    "blue": "var(--mark-blue, #59A6D0)",
    "deep": "var(--mark-deep, #4D82A1)",
}
COMMENT = {
    "gold": "the three beams",
    "blue": "lantern, galleries, tower and the light wave",
    "deep": "the deep wave",
}

S = 8  # upscale factor: enough that a 1px railing is 8px of curve to fit
# How much of a colour a pixel must carry to count as that colour. 0.5 would be
# the neutral choice; 0.22 is deliberately low, because the gallery railings are
# a single JPEG-mangled pixel wide and anything higher breaks them into dashes.
# The cost is a fraction of a pixel of extra weight on every other edge.
THRESHOLD = 0.22
SIGMA = 0.4  # smooths JPEG wobble out of the wave edges; halves the path data
TURDSIZE = 0.08  # drop specks smaller than this fraction of a source pixel


def masks(image):
    """Split the image into one boolean mask per palette colour.

    Classifying by nearest colour throws the railings away: they are mostly
    white, so 'nearest' calls them white. Instead, measure how far each pixel
    travels from white *towards* each colour, pick the colour whose line it sits
    on, and keep it if it travelled far enough.
    """
    a = np.asarray(image).astype(np.float32)
    white = np.array([255.0, 255.0, 255.0])
    amount, offline = {}, {}
    for name, rgb in PALETTE.items():
        axis = np.array(rgb, dtype=np.float32) - white
        t = ((a - white) @ axis) / (axis @ axis)
        amount[name] = t
        offline[name] = np.linalg.norm(a - (white + t[..., None] * axis), axis=-1)

    names = list(PALETTE)
    nearest = np.stack([offline[n] for n in names], -1).argmin(-1)
    out = {}
    for i, name in enumerate(names):
        field = np.where(nearest == i, amount[name], 0.0)
        out[name] = gaussian_filter(field, SIGMA * S) > THRESHOLD
    return out


def trace(mask):
    """Trace one mask into SVG path data, back in source-pixel coordinates."""
    # potracer inverts whatever it is handed, so hand it the inverse.
    path = potrace.Bitmap(~mask).trace(
        turdsize=int(S * S * TURDSIZE), alphamax=1.0, opttolerance=0.5
    )
    subpaths = []
    for curve in path.curves:
        start = curve.start_point
        d = f"M{start.x / S:.1f} {start.y / S:.1f}"
        for seg in curve.segments:
            if seg.is_corner:
                d += f"L{seg.c.x / S:.1f} {seg.c.y / S:.1f}"
                d += f"L{seg.end_point.x / S:.1f} {seg.end_point.y / S:.1f}"
            else:
                d += (
                    f"C{seg.c1.x / S:.1f} {seg.c1.y / S:.1f}"
                    f" {seg.c2.x / S:.1f} {seg.c2.y / S:.1f}"
                    f" {seg.end_point.x / S:.1f} {seg.end_point.y / S:.1f}"
                )
        subpaths.append(d + "Z")
    return subpaths


HEADER = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="9.5 10.5 268 302" role="img" aria-label="Pharos Academy">
  <!-- Traced from the school's own mark by prototypes/mark/trace.py. Source:
       prototypes/mark/source-287x335.jpg, the original upload behind the Wix
       logo and the largest raster of it that exists anywhere - the live site
       serves it cropped to 76x110, and no vector was ever supplied. Upscaled
       8x, separated per colour, potraced. Same shapes, no rebrand.

       Colours are the mark's true values, read off the raster: #59A6D0,
       #4D82A1, #FBB03B. The #5AA7D0 / #45789E / #FAB03B used before this were
       eyeballed.

       The gallery railings are the one place the source fights back: they are
       ~1px and JPEG-mangled, so the threshold is set low enough to keep them
       continuous, which costs a fraction of a pixel of weight everywhere else.

       Awaiting Jill's confirmation - issue #13. -->
"""


def main():
    image = Image.open(SRC).convert("RGB")
    w, h = image.size
    big = image.resize((w * S, h * S), Image.LANCZOS)
    paths = {k: trace(m) for k, m in masks(big).items()}
    body = "\n".join(
        f"  <!-- {COMMENT[k]} -->\n"
        f'  <path fill="{VAR[k]}" fill-rule="evenodd" d="{" ".join(paths[k])}"/>'
        for k in ("gold", "blue", "deep")
    )
    OUT.write_text(HEADER + body + "\n</svg>\n", encoding="utf-8")
    print(
        f"{OUT}: {len(body)} bytes of path data, "
        + ", ".join(f"{k} {len(v)}" for k, v in paths.items())
    )


if __name__ == "__main__":
    main()
