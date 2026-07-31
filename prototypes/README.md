# Prototypes — throwaway

Nothing here ships. Each prototype exists to answer one question, and dies once the
answer is captured on the ticket that commissioned it.

## `homepage-design-language.html`

**Question:** [#12 — Decide the design language and the immersive treatment](https://github.com/wyattwsaint/pharos-academy-site/issues/12).
"Immersive and premium" is not resolvable in conversation, so this puts structurally
different homepages on screen instead.

Open the file directly in a browser, or use the published copy linked from #12.

| | | |
|---|---|---|
| `?variant=e` | **Beacon, warmed** | **The current front-runner** — D's structure on a warm, ceremonial surface: warm paper and parchment bands, navy as ground and headings only, a serif/sans split by role, a rule-with-diamond between sections, an H O P E panel row, a navy footer band. The hero video and its parallax are D's, untouched. |
| `?variant=d` | **Beacon** | The direction decided on #12. Full-bleed video hero at 0.5× parallax with a blur-and-dim ramp, C's air and type, B's real timetable pulled up to section three. Instrument Serif + Public Sans. |
| `?variant=a` | **Plate** | Harbour dark. The Pharos engraving carries the page; one gold beam is the only colour event. Cormorant Garamond + Libre Franklin. |
| `?variant=b` | **Daybook** | The 2026–27 timetable *is* the hero — real classes, times and prices above the fold, no imagery at all. Fraunces + Source Sans 3 + IBM Plex Mono. |
| `?variant=c` | **Lantern** | Near-white, one column, enormous air. The lighthouse appears once, small, as a tailpiece. Instrument Serif + Public Sans. |

A, B and C were the three exploratory directions; **D** was the decision on #12; **E** is
D's surface warmed towards a reference poster the user supplied
(`ImageTemplateStyles.png`, an AI-generated composite), taking **style principles only**.
D is left intact as the artefact #12 recorded — E is a new variant, not an edit of D.

E deliberately does **not** take from that reference: its density (which is carried
entirely by fourteen illustrations — this page owns five usable images), navy body copy,
an all-serif setting, "A Christian homeschool co-op.", its generated mothers and children,
or its five-pillar strip — which claims a **music** programme Pharos does not teach.
`"Helping Our Parents Educate"` is real (the H.O.P.E. acronym).

**One tagline is now taken, and taken knowingly.** E's hero sets "Faith. Family. Learning.
Together." beneath the lockup. This reverses an earlier decision recorded here that E takes
no invented copy from the reference: the owner was shown that the line appears nowhere on
`pharosacademy.net`, and chose it anyway. It is the single deliberate exception to the rule
that every word on this page is real copy from `docs/mirror/`. The hero's other caps line,
"A Christian Classical, Hybrid-Microschool", is the owner's punctuation of the client's own
sub-brand — the 19 mirrored pages all set it as "A Christian Classical Hybrid Microschool",
without the comma or the hyphen. Flagged on #12.

Add `&notes=1`, or press **Image slots** in the bar, to annotate the homepage image
slots with what goes in each and whether the school can supply it. `←` / `→` cycle
variants. E now carries **two** paintings the owner generated — slots 2 + 3, merged into one
section, and slot 5 (provenance in `assets/imagery/README.md`); their notes record the crop
and the treatment. Both are set as **accents**: a plate never gets a row to itself, it pairs
with its section's eyebrow and heading in a ~38% column. The Bible still-life that used to
fill slot 3 was dropped from the page when the two sections merged. Two things the notes
say out loud: slot 5 holds a **landscape**, not the
classroom interior it was specified as, so the page shows no picture of anywhere Pharos
actually is; and slot 4 — the three staff portraits — stays empty because it must be
photographs of real consenting adults ([#13](https://github.com/wyattwsaint/pharos-academy-site/issues/13)),
never a painting. No agent here can generate images.

Section order is fixed by [#9](https://github.com/wyattwsaint/pharos-academy-site/issues/9)
and is not what is being tested. Copy, prices, times, class names and staff bios are
real, from `docs/mirror/`.

### Review affordances for the video heroes (D and E)

| | |
|---|---|
| `&p=0.5` | Pins the ramp's **optical** state — blur, dim, copy fade — at that progress, without scrolling. A still cannot convey parallax, and applying the translate at scroll 0 would just expose it as a gap, so `p` deliberately leaves the parallax offset alone. **Scroll to see the real thing.** |
| `&flat=1` | Pins the hero to 640px instead of the viewport, so a very tall window can capture the hero and the whole body in one screenshot. |

Both use the **same** hero code (`heroFx('d')` / `heroFx('e')`) and, in the built file,
the **same single copy** of the video: E's `<video>` carries no data attributes and
borrows D's, so adding E cost ~160 KB, not ~1.3 MB.

The hero's mark is `src/mark.svg` — a **real trace** of the existing raster mark, redrawn
deterministically by `mark/trace.py` from the 287×335 original (commit `9636651`). Same
shapes, no rebrand. Three colours shifted slightly when they were read off the raster
instead of by eye, so every variant moved with them; the details, and the one judgement
call about the gallery railings, are in `mark/README.md`. Jill's confirmation of the
redraw is still outstanding ([#13](https://github.com/wyattwsaint/pharos-academy-site/issues/13)).

### Rebuilding

`prototypes/src/` holds the actual source. The published file is generated — fonts,
images **and the video** are inlined as data URIs so the single file works offline and
inside a strict CSP.

```sh
python src/fetch_fonts.py    # pulls the Google Fonts CSS -> src/fonts/*.css
python src/build_fonts.py    # base64s the latin woff2 subsets -> src/fonts.css
python src/build_assets.py   # crops/re-encodes the mark + engraving -> src/assets.json
sh     src/shoot.sh          # substitutes everything into template.html, then screenshots
```

`src/fonts/`, `src/fonts.css` and `src/assets.json` are generated and are not committed —
run the first three steps before `shoot.sh` on a fresh clone.

The video renditions in `assets/` come from `assets/hero/veo-source-720p.mp4` at the repo
root (see the README there for provenance and what the real build needs):

```sh
S=../assets/hero/veo-source-720p.mp4
ffmpeg -i $S -an -vf "scale=1920:1080:flags=lanczos,unsharp=5:5:0.7:5:5:0.0" \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart assets/hero-1920.mp4
ffmpeg -i $S -an -c:v libx264 -preset slow -crf 29 -pix_fmt yuv420p \
  -movflags +faststart assets/hero-1280.mp4
ffmpeg -i $S -frames:v 1 -vf "scale=1920:1080:flags=lanczos" -q:v 82 assets/poster.webp
ffmpeg -i $S -frames:v 1 -vf "scale=640:360:flags=lanczos,gblur=sigma=14" -q:v 78 \
  assets/poster-blur.webp
```

`poster-blur.webp` is the pre-blurred layer that gets crossfaded over the playing video.
It is deliberately tiny (640px, 3 KB) — it is only ever seen blurred, and never
filtering a live video is the whole point.

### Screenshot caveats

`shoot.sh` renders every variant at desktop and phone. Headless Chrome clamps the CSS
viewport to a **500px minimum** regardless of `--window-size`: passing 390 yields a
390px-wide *image* of a 500px-wide *layout*, i.e. a crop that looks like broken wrapping
but isn't. The phone shots are therefore a true 500px viewport. Media queries break at
760px so the phone layout is exercised, but **real 390px wrapping remains unverified**
and wants a device check before this direction is built.
