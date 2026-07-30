"""Derive the client-facing copy of variant E from the built prototype.

The prototype file is a review instrument: five variants in one document, a
switcher bar, keyboard cycling, and a slot-note for every image slot saying what
is missing and why. None of that goes in front of a client, and several of the
notes are frankly internal — whose instruction a choice came from, which images
are AI-generated, what has not been checked yet.

So this strips the instrument and leaves the page:

  * variants A-D deleted outright, E left as the only <main>
  * the switcher bar and every slot-note removed
  * the variant/notes machinery cut out of the script; the video hero survives
  * <title> becomes a real page title rather than "design language prototype"

It reads the BUILT file, not template.html, so everything is already inlined and
this stays a text transform. Run build_assets.py and shoot.sh first.

Output has no <!doctype>, <html> or <body> tag, because its destination is a
Claude Artifact, which supplies that wrapper itself. Opened straight off disk in
a browser it still renders — the parser infers all three.

    python build_client.py [OUT]

Deliberately not written into the repo by default: it is 4 MB of duplicated data
URI whose every byte is reproducible from here.
"""
import re
import sys
import pathlib

SRC = pathlib.Path(__file__).resolve().parents[1] / "homepage-design-language.html"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("homepage-client.html")

html = SRC.read_text(encoding="utf-8")
start = len(html)


def cut(pattern, expect=1, flags=re.S):
    """Delete every match of `pattern`, asserting how many there were. The count
    is the point: this file is generated, so a silent zero-match here would ship
    prototype chrome to a client."""
    global html
    html, n = re.subn(pattern, "", html, flags=flags)
    assert n == expect, "%r matched %d times, expected %d" % (pattern[:48], n, expect)


# --- the video data URIs live on D's <video>; E's borrows them ---------------
# One copy in the file is the reason E cost ~340 KB instead of ~1.3 MB. Deleting
# D would take the sources with it, so move them onto E's element first and
# point the hero script at its own variant.
srcs = re.search(r'<video id="d-vid" (data-lg="[^"]+" data-sm="[^"]+")', html)
assert srcs, "D's video sources not found — has the hero markup changed?"
html = html.replace('<video id="e-vid" ', '<video id="e-vid" ' + srcs.group(1) + " ", 1)
html = html.replace("document.getElementById('d-vid').dataset", "vid.dataset", 1)

# --- variants A-D -----------------------------------------------------------
for k in "abcd":
    cut(r'<main class="px-page %s" id="v-%s">.*?</main>\n' % (k, k))
# E is the only page left, so it is simply visible. .px-page/.on stays in the
# stylesheet; it costs nothing and keeps this a pure deletion.
html = html.replace('<main class="px-page e" id="v-e">',
                    '<main class="px-page e on" id="v-e">', 1)

# --- the switcher bar and the notes -----------------------------------------
cut(r'<div class="px-bar".*?</div>\n')
# and the chrome's stylesheet: the bar, the dashed slot outlines, the note
# panels. .px-page/.on is inside this block, hence the `on` class added above.
cut(r'/\* -+ prototype chrome.*?\.px-page\.on \{ display: block; \}\n')
# E carries seven: one per slot 1-6 plus the note on the navy band itself.
cut(r'\s*<p class="slot-note">.*?</p>', expect=7)
# The `slot` class is left on the wrappers. It only drives the dashed outline
# under body.notes, which can no longer be switched on, and stripping it means
# rewriting class lists on nested elements for no visible gain.

# --- the script -------------------------------------------------------------
# Everything above heroFx is the review instrument: the variant list, the bar
# wiring, the arrow keys, the notes toggle, and C's scroll-driven beam. Only the
# form's fake submit is worth keeping, and it is three lines.
i = html.index("<script>")
j = html.index("window.__heroes = {};")
html = html[:i] + """<script>
function pageSent(form) {
  const b = form.querySelector('button');
  b.textContent = "We'll get back to you!";
  b.disabled = true;
  return false;
}

""" + html[j:]
html = html.replace("return px.sent(this)", "return pageSent(this)", 1)

# heroFx ran for D and E and was then activated off the switcher's state.
tail = html.index("heroFx('d');")
html = html[:tail] + """heroFx('e');
window.__heroes.e(true);
</script>
"""

# --- the commentary ---------------------------------------------------------
# The stylesheet and the hero script are commented at length, and those comments
# are an internal argument: whose instruction a choice came from, which images
# are generated, what was tried and looked worse, which issue decided what. View
# Source is not private, so they come out of the client copy. They stay in
# src/template.html, which is where they are useful.
#
# base64 has no `*`, so no data URI can contain `/*` and this cannot eat one.
def strip_comments(block):
    inner = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
    return re.sub(r"\n{3,}", "\n\n", inner)

for tag in ("style", "script"):
    m = re.search(r"<%s>(.*?)</%s>" % (tag, tag), html, re.S)
    assert m, "no <%s> block" % tag
    html = html[:m.start(1)] + strip_comments(m.group(1)) + html[m.end(1):]

# --- the title --------------------------------------------------------------
html = html.replace("<title>Pharos Academy — design language prototype</title>",
                    "<title>Pharos Academy — Helping Our Parents Educate</title>", 1)

for stray in ("px-page e on", "id=\"v-e\""):
    assert stray in html, "lost E's page wrapper"
for stray in ("px-bar", "slot-note", "px.show", "VARIANTS", "id=\"v-d\"", "{{"):
    assert stray not in html, "%s survived" % stray

OUT.write_bytes(html.encode("utf-8"))
print("%s\n%d KB (from %d KB)" % (OUT, len(html.encode()) // 1024, start // 1024))
