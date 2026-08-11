# Staff portraits — provenance

Photographs of real, named, consenting adults who work at Pharos Academy. **Nothing here
is generated, and nothing here is stock.** That is the whole point of the directory: slot 4
was held empty from #13 until the school supplied these, precisely so that no invented face
would ever appear under a named member of staff. See `../imagery/README.md` for the rule and
the one place the owner overruled it — this is not that place.

| File | Who | Provenance |
|---|---|---|
| `jill-kilker.jpeg` | Jill Kilker, Head of School | Supplied by the Head of School, August 2026. 1536×2048, upright. |
| `george-jensen.jpeg` | Pastor George Jensen, Chaplain & Spiritual Advisor | Supplied by Pastor Jensen, August 2026. 4032×3024 with EXIF orientation 6 — the file is landscape and the tag says to stand it up. |
| `kathy-liddick.jpeg` | Kathy Liddick, Director of Business Administration | Supplied by Pastor Jensen, August 2026. 4032×3024, EXIF orientation 6, as above. |
| `mandy-saint.jpg` | Mrs. Mandy Saint, instructor | Supplied by the Head of School, August 2026. 2268×4032, upright. |

Identification of each face to each name was confirmed with the client (#99), not inferred
from the filenames — a phone's `IMG_3674.jpeg` says nothing about who is in it, and putting
the wrong person's face over a named bio is the one error this page cannot make quietly.

## What the build does to them

`node scripts/build-portraits.mjs` writes `public/portraits/<slug>.webp` — 600×600, WebP
q82, ~25–40 KB each. It bakes the EXIF rotation into the pixels rather than trusting the
tag, then takes a square crop biased upwards so the eyes sit above the middle of the circle
the page renders them in. Output is committed; the script is run by hand when a portrait
changes, exactly like `build-imagery.mjs`.

The sources stay here at full resolution because the crop is a judgement call recorded as a
number (`faceY`), and re-taking that judgement needs the original frame.

## Who is still missing

Six of the ten people have no photograph. They render their name, their role and what
they teach, with no portrait frame at all — an empty circle per missing face would be a page
advertising what it lacks. When the school sends more, they drop in here and the seed gains
a `photo`; nothing else changes.
