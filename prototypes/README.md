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
| `?variant=d` | **Beacon** | **The decided direction.** Full-bleed video hero at 0.5× parallax with a blur-and-dim ramp, C's air and type, B's real timetable pulled up to section three. Instrument Serif + Public Sans. |
| `?variant=a` | **Plate** | Harbour dark. The Pharos engraving carries the page; one gold beam is the only colour event. Cormorant Garamond + Libre Franklin. |
| `?variant=b` | **Daybook** | The 2026–27 timetable *is* the hero — real classes, times and prices above the fold, no imagery at all. Fraunces + Source Sans 3 + IBM Plex Mono. |
| `?variant=c` | **Lantern** | Near-white, one column, enormous air. The lighthouse appears once, small, as a tailpiece. Instrument Serif + Public Sans. |

A, B and C were the three exploratory directions. **D is what goes in front of the
client**; A/B/C are kept only so the choice can be re-read.

Add `&notes=1`, or press **Image slots** in the bar, to annotate the homepage image
slots with what goes in each and whether the school can supply it. `←` / `→` cycle
variants.

Section order is fixed by [#9](https://github.com/wyattwsaint/pharos-academy-site/issues/9)
and is not what is being tested. Copy, prices, times, class names and staff bios are
real, from `docs/mirror/`.

### Variant D's review affordances

| | |
|---|---|
| `&p=0.5` | Pins the ramp's **optical** state — blur, dim, copy fade — at that progress, without scrolling. A still cannot convey parallax, and applying the translate at scroll 0 would just expose it as a gap, so `p` deliberately leaves the parallax offset alone. **Scroll to see the real thing.** |
| `&flat=1` | Pins the hero to 640px instead of the viewport, so a very tall window can capture the hero and the whole body in one screenshot. |

The hero's mark is `src/mark.svg` — a **hand-drawn approximation** of the existing raster
mark, not a measured trace. Structure and colours are faithful; the tower is chunkier
than the original. The real trace, and Jill's confirmation of it, is separate work.

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
