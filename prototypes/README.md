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
| `?variant=e` | **Beacon, warmed** | **The current front-runner** — D's structure on a warm, ceremonial surface: warm paper and parchment bands, navy as ground and headings only, a serif/sans split by role, a rule-with-diamond between sections, an H O P E panel row, a navy footer band. The parallax is D's; **the hero video is E's own** since 2026-07-31, and the H O P E letters open illustrated cards. |
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

**A second line is now taken, and this one changes what the school claims to be.**
On **2026-08-01** the owner instructed that the hero's sub-brand read
**"A Christian Classical Hybrid Homeschool"** — replacing "A Christian Classical,
Hybrid-Microschool". This is not punctuation. All 19 mirrored pages say
**Microschool**, and `README.md` describes Pharos as a microschool; a microschool is a
school children attend, a homeschool is one parents run. The instruction came after the
wording was shown to be the client's own, and was reaffirmed. **The client has not
confirmed it** — it needs putting to George and Jill (#14) before anything ships. The
change is applied to variant E and, through `build_client.py`, to the client copy;
variants A–D are untouched, and this README and the root README keep recording what the
live site actually says.

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

Both use the **same** hero code (`heroFx('d')` / `heroFx('e')`). They no longer share the
same clip: E was re-shot on 2026-07-31 against `assets/hero/veo-hope-720p.mp4`, whose
right half is open sky for the type block, while D keeps the clip #12 decided on. Each
`<video>` now carries its own sources and the built file holds both — about 1.2 MB more
than when E borrowed D's. The client build ships E alone and pays none of it.

### E's hero and the H.O.P.E. row

E's hero composition changed with the clip. The mark and `PHAROS ACADEMY` **stack to the
left of the lighthouse**; the right column is set from a reference the owner supplied —
display line, gold italic, a gold rule carrying a **cross**, then two letterspaced caps
lines and the buttons. The school's name remains the `h1` even though the display line is
larger. The reference's own sub-brand, "A Christian Homeschool Co-op", was **rejected**: it
appears nowhere in `docs/mirror/`, and the line reads "A Christian Classical,
Hybrid-Microschool" instead. The header is now **fixed** — chrome-less over the hero, navy
with a gold hairline once the hero is past, its corner lockup fading in only then.

The four H O P E letters are `<button>`s. Hover opens a card, click or tap sticks it, Escape
or an outside click closes it, and it is keyboard reachable — deliberately the same contract
and the same code shape as the class descriptions. Desktop: the card floats **upward** over
the verse, 380px, anchored to the outer edge for the first and last letters. Below 1000px it
expands in its own cell; below 620px, where the row is 2-up and a cell is ~150px, it floats
again but spans both columns.

**Two things on that row are not settled.** The three paintings behind H, O and P contain
generated people, which `assets/imagery/README.md` forbade absolutely until the owner
overruled it on 2026-07-31; and all four sentences are the prototype's drafts, not the
school's words — nothing in `docs/mirror/` expands the acronym past "Helping Our Parents
Educate". Both are on [#13](https://github.com/wyattwsaint/pharos-academy-site/issues/13)
for George and Jill.

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

E's four renditions come from `assets/hero/veo-hope-720p.mp4` the same way, named
`hope-*` instead of `hero-*`:

```sh
S=../assets/hero/veo-hope-720p.mp4
ffmpeg -i $S -an -vf "scale=1920:1080:flags=lanczos" -c:v libx264 -preset slow -crf 27 \
  -pix_fmt yuv420p -movflags +faststart assets/hope-1920.mp4
ffmpeg -i $S -an -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart assets/hope-1280.mp4
ffmpeg -i $S -vframes 1 -vf "scale=1600:-2:flags=lanczos" -c:v libwebp -quality 72 \
  assets/hope-poster.webp
ffmpeg -i $S -vframes 1 \
  -vf "scale=64:-2:flags=lanczos,gblur=sigma=1.2,scale=1600:-2:flags=bicubic" \
  -c:v libwebp -quality 55 assets/hope-poster-blur.webp
```

`poster-blur.webp` is the pre-blurred layer that gets crossfaded over the playing video.
It is deliberately tiny (640px, 3 KB) — it is only ever seen blurred, and never
filtering a live video is the whole point.

### Screenshot caveats

`shoot.sh` renders every variant at desktop and phone. Headless Chrome clamps the CSS
viewport to a **500px minimum** regardless of `--window-size`, so the phone shot defeats
the clamp by rendering a 796px window at device-scale 2 — a true **390px CSS viewport**.

**390px is no longer unverified.** `src/audit.py` (Playwright + axe-core, driving the
installed Chrome) checks E at 390 / 768 / 834 / 1024 / 1440 for horizontal overflow and
WCAG 2.1 AA, and writes `src/audit/report.json`. As of 2026-07-31: no overflow and **zero
axe violations at any width**, closed or with a H.O.P.E. card open. What remains unjudged
is the same 11–12 nodes as before — the hero type over the moving video, which axe cannot
evaluate against a video frame and which no number has yet been put to. **No real device
has seen this**; 390px here is a true 390px *layout*, not a phone.
