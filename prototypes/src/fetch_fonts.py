"""Fetch the Google Fonts CSS that build_fonts.py inlines.

build_fonts.py reads fonts/*.css and base64s the latin woff2 out of each one.
This fetches those CSS files. Weight/style sets below are exactly what
template.html uses -- keep them minimal, every extra face lands in the single
self-contained HTML file.
"""
import os
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

FAMILIES = {
    # variant A
    "cormorant-garamond": "Cormorant+Garamond:ital,wght@0,300;0,600;1,300",
    "libre-franklin": "Libre+Franklin:wght@400;500;600",
    # variant B
    "fraunces": "Fraunces:wght@400;600;700",
    "source-sans-3": "Source+Sans+3:wght@400;600",
    "ibm-plex-mono": "IBM+Plex+Mono:wght@400;500",
    # variants C and D
    "instrument-serif": "Instrument+Serif:ital@0;1",
    "public-sans": "Public+Sans:wght@400;600",
}

os.makedirs("fonts", exist_ok=True)
for name, spec in FAMILIES.items():
    url = "https://fonts.googleapis.com/css2?family=%s&display=swap" % spec
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    path = os.path.join("fonts", name + ".css")
    open(path, "w", encoding="utf-8").write(css)
    print("%-22s %d faces, %d KB" % (name, css.count("@font-face"), len(css) // 1024))
