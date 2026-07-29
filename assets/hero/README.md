# Hero video — master asset

`veo-source-720p.mp4` is the master for the homepage hero decided on
[#12](https://github.com/wyattwsaint/pharos-academy-site/issues/12). Kept here so it does not
live only in a Downloads folder.

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
