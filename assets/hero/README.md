# Hero video — master assets

Two masters, deliberately. Kept here so neither lives only in a Downloads folder.

| File | Used by | Why it exists |
|---|---|---|
| `veo-source-720p.mp4` | **variant D** | The master decided on [#12](https://github.com/wyattwsaint/pharos-academy-site/issues/12). |
| `veo-hope-720p.mp4` | **variant E** | Replaced E's hero on 2026-07-31. Composed to leave the right half of the frame open for the H.O.P.E. type block. |

E was re-shot; D was not. D exists only as the artefact #12 recorded, so overwriting the
one file would have silently changed the thing that ticket points at. The cost is that the
five-variant prototype now carries two videos instead of sharing one — about 1.2 MB more
base64. The client build ships E alone and pays none of it.

`veo-hope-720p.mp4`: **re-shot 2026-08-01** and overwritten in place. The 2026-07-31 clip
it replaced was never committed, and no ticket's artefact pointed at it, so nothing that
was decided is lost — but it is gone from the repo. Generated with Google Veo 3.1 (via
ElevenLabs), same 1280×720 / 8.00s / 24fps / h264 spec, and it loops without a hard cut —
frames at 0s and 7.96s differ only by cloud drift. Against the clip it replaced the tower
sits further right and larger and the horizon is lower, so the open sky the lockup stands
on is bigger.

The scrim over it is now **inverted**: E's hero type went to navy ink on the owner's
2026-08-01 reference, so the layer lightens the ground rather than darkening it. Every
line of the lockup was measured off the rendered screenshot at 1440px and at phone width;
all clear WCAG AA against the 40th-percentile ground. The phone gets a centred wash
because the crop puts the tower and treeline directly under the type.

It is also **narrowed to a single ellipse**, same day, over two further passes. The first
version lightened the whole right half, a top band and a bottom band — three washes, only
one of which had type under it — and it flattened the sky, the sea, the far shoreline and
the meadow, which is the painting the clip was chosen for. The bottom band went because
nothing sat on it. The top band went because it was the nav's ground and the nav already
carries its own text-shadow; without the band the nav still measures 5.01:1 against bare
sky, and the sky reads as sky rather than haze. What is left is one ellipse about the size
of the lockup.

The fix was a **smaller** wash, not a fainter one: fainter loses contrast everywhere,
smaller loses none where the type is. One intermediate attempt with a tighter phone ellipse
put the gold italic at 4.09:1 — a real failure — so **re-measure after any change to this
layer, do not eyeball it.**

A **third pass**, same day and the same complaint, found that the two breakpoints were held
back by different things. On desktop, almost nothing: the nav sits on bare sky and moves
only 5.01:1 → 4.88:1 across everything tested, so the ellipse's outer skirt — the part that
hazes the sea, not the part the ink sits on — was pure cost, and it was pulled in.

On phone the wash turned out to be the wrong **shape**, not the wrong strength. It was wide
and flat (78% × 40%) over a lockup that is five lines stacked, so the bottom two lines were
never on the ellipse's core at all — they were living on its skirt. That is why every
ordinary reduction broke those two lines and only those two: a faster falloff alone took the
gold italic from 5.67:1 to 3.24:1. Re-proportioning the ellipse to the type it covers, 58%
wide by 60% tall, fixes both halves at once — every line clears AA, the caps rule actually
improves, and a fifth of the frame's width comes back on each side, which is the tower on
the left and the treeline on the right.

Worst line now **4.88:1 on desktop** (the nav) and **5.29:1 on phone** (the gold italic),
against a 4.5:1 need. Little room is left: on phone, narrowing to 48% failed the caps rule
at 4.12:1 and collapsing the skirt failed the gold italic at 2.93:1.

- **Provenance:** generated with Google Veo 3.1 (via ElevenLabs), 2026-07-29. It depicts no real
  place. Enola has no coast; the lighthouse is the school's emblem, not its building.
- **Source spec:** 1280×720, 8.00s, 24fps, h264, ~1.3 Mbps. Frames at 0s and 7.95s are visually
  near-identical, so it loops without a hard cut.
- **The audio track is stripped** in every derived rendition. The source still carries a 256 kbps
  stereo AAC track; nothing on the site plays sound.

## Renditions the build needs

| | Resolution | Notes |
|---|---|---|
| Desktop | 2560×1440 | **Not yet produced.** Needs a Topaz pass (the pipeline that produced the June clip outputs 2560×1440). |
| Phone | 1280×720 | The source, re-encoded without audio. |

A 16:9 source in a tall viewport is scaled by `viewportHeight / 1080`, so a maximised window on a
1440p display wants the 2560×1440 rendition to stay 1:1. The 0.5× parallax adds **no** overscan
requirement — see the geometry note in `prototypes/src/template.html`.

`prototypes/assets/` holds throwaway ffmpeg renditions used by the prototype only. The 1920×1080
one there is a lanczos upscale standing in for the Topaz pass, not the real thing.
