# The mark

Pharos has no vector logo and never did. `#4` recorded that gap; this closes it by
redrawing the mark from the only raster that exists.

| File | What it is |
| --- | --- |
| `source-287x335.jpg` | The original Wix upload — the largest copy of the mark anywhere. The live site serves it cropped to 76×110. |
| `trace.py` | Regenerates `../src/mark.svg` from that raster. Deterministic; re-running it should produce no diff. |
| `mark-proof.html` | The sheet to put in front of Jill. Self-contained — open it in a browser, or send the PNG. |
| `mark-proof.png` | The same sheet rendered at 1.5×, for email. |

## What was and wasn't decided here

Redrawing, not rebranding. Same lighthouse, same waves, same three beams, same
colours — `#12` put the rebrand out of scope and this respects that. Every shape
comes out of the raster; none was invented.

One thing did change. The colours we had been using were eyeballed from the
image, and the real ones are a shade off:

| | Was | Is |
| --- | --- | --- |
| Light blue | `#5AA7D0` | `#59A6D0` |
| Deep blue | `#45789E` | `#4D82A1` |
| Gold | `#FAB03B` | `#FBB03B` |

The deep blue was the one worth catching — it was out by enough to read as a
different colour beside the real thing. `template.html` now uses all three.

## The railings

The gallery railings are a single pixel wide in a JPEG, which is to say they are
half destroyed before tracing starts. `THRESHOLD` in `trace.py` is set low
enough to keep them continuous rather than dashed, and that costs a fraction of
a pixel of weight on every other edge. That trade is the only judgement call in
the file; it is worth re-reading if the mark ever looks heavy beside the old one.

## Still open

Jill has not confirmed it yet — that is the second half of `#13`. Until she has,
treat `../src/mark.svg` as a proposal.
