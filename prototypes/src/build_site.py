"""Turn the client-facing prototype into a static site Vercel can serve.

`build_client.py` produces one 3 MB file aimed at a Claude Artifact: no document
wrapper, every asset a data URI. That shape is wrong for a URL. A browser cannot
stream a base64 video, cannot cache anything separately, and shows nothing until
the whole document has arrived — which over a phone connection, in a meeting, is
the difference between "here it is" and a blank screen.

So this does the inverse transform:

  * pulls every data: URI out into assets/<sha1>.<ext> and rewrites the reference
  * wraps the fragment in a real document with a charset and a viewport
  * adds the mark proof sheet at /mark, so one link carries both asks
  * marks the whole thing noindex, in the document and in the response headers

The URL is unguessable rather than password-protected, which is a deliberate
choice: Vercel's free protection needs a team login the client does not have.
Nothing here is confidential — it is an unfinished school homepage — but it
should not turn up in a search for the school either.

    python build_site.py            # writes ../site/

Run build_assets.py and shoot.sh first: this reads the built files, not the
templates.
"""

import base64
import hashlib
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent / "site"
PROOF = HERE.parent / "mark" / "mark-proof.html"

EXT = {
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "font/woff2": "woff2",
    "application/font-woff2": "woff2",
}

# data:<mime>;base64,<payload> — payload runs to the delimiter that closed the
# attribute or the url(), so stop at a quote, a paren, or whitespace.
DATA_URI = re.compile(r"data:([\w.+/-]+);base64,([A-Za-z0-9+/=]+)")


def externalise(html, assets):
    """Replace every data: URI with a path to a file, written once per payload."""
    seen = {}

    def swap(m):
        mime, payload = m.group(1), m.group(2)
        key = hashlib.sha1(payload.encode()).hexdigest()[:12]
        if key not in seen:
            ext = EXT.get(mime)
            if ext is None:  # unknown type: safer to leave it inline than guess
                return m.group(0)
            name = f"{key}.{ext}"
            (assets / name).write_bytes(base64.b64decode(payload))
            seen[key] = f"assets/{name}"
        return seen[key]

    return DATA_URI.sub(swap, html), seen


HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
"""


def document(fragment, title=None):
    """Wrap a build_client fragment in a real document.

    A <title> left in the body does still set the tab, but only because the
    parser rescues it. Lift it into the head where it belongs.
    """
    found = re.search(r"<title>.*?</title>", fragment, re.S)
    if found:
        title = found.group(0)
        fragment = fragment.replace(title, "", 1)
    elif title:
        title = f"<title>{title}</title>"
    return (
        HEAD
        + (title + "\n" if title else "")
        + "</head>\n<body>\n"
        + fragment.strip()
        + "\n</body>\n</html>\n"
    )


VERCEL_JSON = """{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
"""


def main():
    # Clear what this script owns and nothing else — `vercel link` leaves a
    # .vercel/ here, and wiping the whole directory would unlink the project on
    # every rebuild.
    assets = SITE / "assets"
    if assets.exists():
        shutil.rmtree(assets)
    for name in ("index.html", "mark.html", "robots.txt", "vercel.json"):
        (SITE / name).unlink(missing_ok=True)
    assets.mkdir(parents=True, exist_ok=True)

    # build_client writes a fragment; take it via a temp file rather than
    # re-implementing the strip here, so there is one place that knows what the
    # client may and may not see.
    tmp = SITE / "_client.html"
    subprocess.run([sys.executable, str(HERE / "build_client.py"), str(tmp)], check=True)
    fragment = tmp.read_text(encoding="utf-8")
    tmp.unlink()

    home, _ = externalise(fragment, assets)
    (SITE / "index.html").write_text(document(home), encoding="utf-8")

    proof, _ = externalise(PROOF.read_text(encoding="utf-8"), assets)
    proof = re.sub(r"<meta charset=[^>]*>", "", proof)  # the wrapper supplies it
    (SITE / "mark.html").write_text(
        document(proof, "The Pharos mark, redrawn"), encoding="utf-8"
    )

    (SITE / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (SITE / "vercel.json").write_text(VERCEL_JSON, encoding="utf-8")

    total = sum(f.stat().st_size for f in SITE.rglob("*") if f.is_file())
    print(f"{SITE}")
    for f in sorted(SITE.glob("*")):
        if f.is_file():
            print(f"  {f.name:14} {f.stat().st_size // 1024:5} KB")
    print(f"  assets/        {sum(1 for _ in assets.iterdir()):5} files, "
          f"{sum(f.stat().st_size for f in assets.iterdir()) // 1024} KB")
    print(f"  total          {total // 1024:5} KB")


if __name__ == "__main__":
    main()
