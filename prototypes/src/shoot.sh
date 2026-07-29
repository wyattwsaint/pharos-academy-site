#!/bin/sh
# rebuild + screenshot every variant at desktop and phone widths
cd "$(dirname "$0")" || exit 1
python - <<'PY'
import json, os
html = open("template.html", encoding="utf-8").read()
html = html.replace("/*FONTS*/", open("fonts.css", encoding="utf-8").read())
a = json.load(open("assets.json"))
for k, v in [("{{ENGRAVING}}", a["engraving_light"]), ("{{MARK}}", a["mark"]), ("{{CHURCH}}", a["church"])]:
    html = html.replace(k, v)
assert "{{" not in html
out = r"C:\Users\wyatt\source\repos\pharos-academy-site\prototypes\homepage-design-language.html"
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w", encoding="utf-8").write(html)
print(round(os.path.getsize(out) / 1024), "KB")
PY

CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
SHOTS='C:\Users\wyatt\AppData\Local\Temp\claude\C--Users-wyatt-source-repos-pharos-academy-site\251db427-76b0-49f1-a8c3-3857824ff03f\scratchpad\shots'
SRC='C:\Users\wyatt\source\repos\pharos-academy-site\prototypes\homepage-design-language.html'
mkdir -p shots
for v in a b c; do
  # headless clamps the window to 500px wide, so the phone shot renders at
  # device-scale 2 in a 796px window => a true 390px CSS viewport.
  for size in "1440,1600:desktop:1" "500,2600:phone:2"; do
    dim=$(echo "$size" | cut -d: -f1)
    tag=$(echo "$size" | cut -d: -f2)
    dsf=$(echo "$size" | cut -d: -f3)
    "$CH" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
      --virtual-time-budget=5000 --window-size="$dim" --force-device-scale-factor="$dsf" \
      --screenshot="$SHOTS\\$v-$tag.png" \
      "file:///C:/Users/wyatt/source/repos/pharos-academy-site/prototypes/homepage-design-language.html?variant=$v" \
      >/dev/null 2>&1
  done
done
ls -l shots
