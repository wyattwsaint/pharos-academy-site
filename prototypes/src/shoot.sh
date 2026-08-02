#!/bin/sh
# rebuild + screenshot every variant at desktop and phone widths
cd "$(dirname "$0")" || exit 1
python - <<'PY'
import base64, json, os, pathlib

html = open("template.html", encoding="utf-8").read()
html = html.replace("/*FONTS*/", open("fonts.css", encoding="utf-8").read())

a = json.load(open("assets.json"))
for k, v in [("{{ENGRAVING}}", a["engraving_light"]), ("{{MARK}}", a["mark"]),
             ("{{CHURCH}}", a["church"]), ("{{ENGRAVING_MASK}}", a["engraving_mask"]),
             ("{{STILL_SCRIPTURE}}", a["still_scripture"]),
             ("{{STILL_DESK}}", a["still_desk"]), ("{{VISTA_PATH}}", a["vista_path"]),
             ("{{HOPE_H}}", a["hope_h"]), ("{{HOPE_O}}", a["hope_o"]),
             ("{{HOPE_P}}", a["hope_p"]), ("{{HOPE_E}}", a["hope_e"])]:
    html = html.replace(k, v)

# variant D's assets. The video is inlined as a data URI like everything else so
# the single file works offline and inside a strict CSP.
def durl(path, mime):
    b = pathlib.Path(path).read_bytes()
    print("  %s: %d KB" % (os.path.basename(path), len(b) // 1024))
    return "data:%s;base64,%s" % (mime, base64.b64encode(b).decode())

ASSETS = pathlib.Path("..") / "assets"
print("variant D assets:")
html = html.replace("{{VIDEO_LG}}", durl(ASSETS / "hero-1920.mp4", "video/mp4"))
html = html.replace("{{VIDEO_SM}}", durl(ASSETS / "hero-1280.mp4", "video/mp4"))
html = html.replace("{{POSTER}}", durl(ASSETS / "poster.webp", "image/webp"))
html = html.replace("{{POSTER_BLUR}}", durl(ASSETS / "poster-blur.webp", "image/webp"))

# E's hero is now a DIFFERENT clip (assets/hero/veo-hope-720p.mp4). D keeps the
# one #12 decided on, untouched, so the artefact that ticket recorded still
# reads. The cost is that this file no longer shares one video between the two
# variants — it carries both, ~1.2 MB of base64 more. The client build ships E
# alone, so it pays none of that.
print("variant E assets:")
html = html.replace("{{VIDEO_E_LG}}", durl(ASSETS / "hope-1920.mp4", "video/mp4"))
html = html.replace("{{VIDEO_E_SM}}", durl(ASSETS / "hope-1280.mp4", "video/mp4"))
html = html.replace("{{POSTER_E}}", durl(ASSETS / "hope-poster.webp", "image/webp"))
html = html.replace("{{POSTER_E_BLUR}}", durl(ASSETS / "hope-poster-blur.webp", "image/webp"))

# the hand-drawn SVG mark goes in as markup, not a data URI, so it inherits the
# variant's colour tokens and can be inspected in devtools
svg = pathlib.Path("mark.svg").read_text(encoding="utf-8")
svg = svg[svg.index("<svg"):].strip()
html = html.replace("{{MARKSVG}}", svg)

assert "{{" not in html, "unsubstituted placeholder remains"
out = r"C:\Users\wyatt\source\repos\pharos-academy-site\prototypes\homepage-design-language.html"
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w", encoding="utf-8").write(html)
print(round(os.path.getsize(out) / 1024), "KB total")
PY

CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
SHOTS='C:\Users\wyatt\AppData\Local\Temp\claude\C--Users-wyatt-source-repos-pharos-academy-site\b2c022b7-b7f0-46e6-ac14-dde0ef7ab705\scratchpad\shots'
SHOTS_POSIX=$(printf '%s' "$SHOTS" | tr '\\' '/')
mkdir -p "$SHOTS_POSIX"   # chrome --screenshot will not create parent dirs
URL="file:///C:/Users/wyatt/source/repos/pharos-academy-site/prototypes/homepage-design-language.html"

shot () { # shot <name> <window-size> <device-scale> <query>
  "$CH" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --autoplay-policy=no-user-gesture-required \
    --virtual-time-budget=8000 --window-size="$2" --force-device-scale-factor="$3" \
    --screenshot="$SHOTS\\$1.png" "$URL?$4" >/dev/null 2>&1
}

for v in e d a b c; do
  # headless clamps the window to 500px wide, so the phone shot renders at
  # device-scale 2 in a 796px window => a true 390px CSS viewport.
  shot "$v-desktop" "1440,1600" 1 "variant=$v"
  shot "$v-phone"   "500,2600"  2 "variant=$v"
done

# D's hero on its own: at rest, mid-ramp and fully ramped, so the scroll
# treatment is legible in a still. ?p= pins the ramp without scrolling.
shot "d-hero-rest" "1440,900" 1 "variant=d&p=0"
shot "d-hero-mid"  "1440,900" 1 "variant=d&p=0.5"
shot "d-hero-end"  "1440,900" 1 "variant=d&p=1"
shot "e-hero-rest" "1440,900" 1 "variant=e&p=0"
shot "e-hero-mid"  "1440,900" 1 "variant=e&p=0.5"
shot "e-hero-end"  "1440,900" 1 "variant=e&p=1"
# E with the imagery slots annotated — four of five now filled, slot 4 (staff
# portraits) is the only one left and needs real photographs, not a painting.
shot "e-notes"     "1440,2600" 1 "variant=e&notes=1"

ls -l "$SHOTS_POSIX"
