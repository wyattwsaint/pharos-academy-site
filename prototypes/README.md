# Prototypes — throwaway

Nothing here ships. Each prototype exists to answer one question, and dies once the
answer is captured on the ticket that commissioned it.

## `homepage-design-language.html`

**Question:** [#12 — Decide the design language and the immersive treatment](https://github.com/wyattwsaint/pharos-academy-site/issues/12).
"Immersive and premium" is not resolvable in conversation, so this puts three
structurally different homepages on screen instead.

Open the file directly in a browser, or use the published copy linked from #12.

| | | |
|---|---|---|
| `?variant=a` | **Plate** | Harbour dark. The Pharos engraving carries the page; one gold beam is the only colour event. Cormorant Garamond + Libre Franklin. |
| `?variant=b` | **Daybook** | The 2026–27 timetable *is* the hero — real classes, times and prices above the fold, no imagery at all. Fraunces + Source Sans 3 + IBM Plex Mono. |
| `?variant=c` | **Lantern** | Near-white, one column, enormous air. The lighthouse appears once, small, as a tailpiece. Instrument Serif + Public Sans. |

Add `&notes=1`, or press **Image slots** in the bar, to annotate the seven homepage
image slots with what goes in each and whether the school can supply it.
`←` / `→` cycle variants.

Section order is fixed by [#9](https://github.com/wyattwsaint/pharos-academy-site/issues/9)
and is not what is being tested. Copy, prices, times, class names and staff bios are
real, from `docs/mirror/`.

### Rebuilding

`prototypes/src/` holds the actual source. The published file is generated — fonts and
images are inlined as data URIs so it works offline and inside a strict CSP.

```sh
python src/build_fonts.py    # downloads the latin subsets, base64s them -> fonts.css
python src/build_assets.py   # crops/re-encodes the mark + engraving -> assets.json
sh     src/shoot.sh          # substitutes both into template.html, then screenshots
```

`shoot.sh` renders every variant at desktop and phone. Note: headless Chrome clamps the
window to 500px, so the "phone" shot is a 484px viewport, not 390px — the media queries
break at 760px so the phone layout is exercised, but real 390px wrapping is unverified.
