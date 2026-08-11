# Imagery — provenance

Source images for the site's illustrative slots. Nothing here is a photograph of a real
place, object or person belonging to Pharos Academy.

## The one file here that is neither generated nor ours

| File | What | Provenance |
|---|---|---|
| `thiersch-pharos.png` | Line drawing: Prof. H. Thiersch's 1909 reconstruction of the Lighthouse of Alexandria. 1024×871, on a light ground. **About, beside the essay on the name** (#106). | **Public domain**, published 1909. Copied byte-for-byte from the school's own upload in the mirror (`docs/mirror/assets/cecb9d_46661c…~mv2.png`, filename `Pharos.png`), which is what the old `/general-8` printed. |

The licence condition on this one is the **attribution**: the work is free to publish
given that Thiersch is named. So the caption under it on About is not decoration and is
not optional, and `e2e/about.spec.ts` fails if it goes missing. The credit line itself is
transcribed from the old page, in `src/lib/about/story.ts`.

The mirror's own README had this file down as a large copy of the school's logo mark,
which is what its filename suggests and what it is not. That row is corrected in
`docs/mirror/README.md`, because it also meant the "no vector logo" question was recorded
as half-answered when it is still fully open.

## The generated illustration

| File | What | Provenance |
|---|---|---|
| `still-scripture.jpg` | Painterly still-life: an open Bible and a hand-written journal by lamplight, daisies in a jug, a shelf behind. 1672×941 (16:9), uncropped. **Slot 3 (Classes)**, on the owner's instruction. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |
| `still-study.png` | Painterly still-life: leather-bound books, a globe, a brass compass, a drawing of a classical portico, warm window light. 1672×941 (16:9). **Unused** — held slot 3 until `still-scripture.jpg` replaced it. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |
| `still-lamp.png` | Painterly still-life: an open Bible and a hand-written journal by oil-lamp light, wildflowers, dark ground. 1672×941 (16:9). **Unused** — it is `still-scripture.jpg` in a night key, the same objects in the same arrangement, and running both two screens apart read as one picture used twice. Slot 6 lost its image rather than swap. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |
| `still-desk.png` | Painterly still-life: an open journal and loose pages on a scrubbed table by a window, brushes in a jar, daisies. 1672×941 (16:9); cropped to 3:2 for slot 2. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |
| `vista-path.png` | Painterly landscape: a footpath through a wildflower meadow at sunrise. 1672×941 (16:9); cropped to 21:9 for slot 5. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |
| `still-library.png` | Painterly still-life: bookshelf, a globe on a brass stand, a compass, a portico drawing. 1672×941 (16:9). **Unused** — same subject as `still-study.png`; only one of the two could ever have run, and neither does. Held for an interior page. | **AI-generated**, ChatGPT, 29 July 2026, by the site owner. |

## The H.O.P.E. popouts — and the line they cross

| File | What | Provenance |
|---|---|---|
| `hope-h-helping.png` | Watercolour: two women in a sunlit library, one passing an open book to the other. **H — Helping.** | **AI-generated**, ChatGPT, 31 July 2026, by the site owner. |
| `hope-o-our.png` | Watercolour: eight people — two men, a woman, five children — working around a long table. **O — Our.** | as above |
| `hope-p-parents.png` | Watercolour: a woman on a sofa reading to a boy and a girl. **P — Parents.** | as above |
| `hope-e-educate.png` | Watercolour still-life: a gilt globe, a botanical book, blue-and-gold bindings, daisies. **E — Educate.** No people. | as above |

## The line that governed this directory, and the day it was overruled

**The rule was: no generated people, anywhere on this site, ever.** Every still-life above
is deliberately free of people, hands and faces — that is what made them usable. A
generated image of adults or children reads to a parent as a photograph of *this school's*
families, which it is not, and no framing fixes that. The rule had already been enforced
twice: a painted family of eleven offered for slot 2 was refused and never copied into this
repo, and the reference poster's family illustrations were dropped for the same reason. It
was written here absolutely so it would not have to be argued a third time.

**On 2026-07-31 the owner was shown that argument again, in those terms, and overruled it.**
Three of the four H.O.P.E. popout paintings above show adults and children. They are on the
page. This is the owner's decision, taken knowingly, not an oversight and not a case of the
rule being forgotten — and it is recorded here rather than quietly absorbed, so that anyone
reading this directory later sees both the rule and the exception.

What did **not** change:

- The exception is these four popouts. Nothing else on the page gained people.
- **Slot 4 — the three staff portraits — is still photographs only.** It must be real
  adults who consent (issue #13). A painting there was never on the table and still isn't.
  The school supplied four photographs in August 2026 (#99); they are in
  `../portraits/`, and that directory's README is where their provenance lives.
- The disclosure position is unchanged: generated, mentioned to the client if asked. Issue
  #13 carries this specific reversal into the sign-off conversation, so George and Jill are
  told rather than left to notice.

## Disclosure

The hero video (`../hero/`) is also AI-generated. The owner's decision, recorded on issue
#12 with the risk stated, is that this is **mentioned to the client only if asked**. The
same treatment covers these two files unless the owner says otherwise.

A fifth generated image was offered for slot 2 on 29 July and **refused**: a painted family
of eleven — two mothers, two fathers, seven invented children. It was never copied into
this repo. It is the same refusal that removed the reference poster's family illustrations,
and it is why the rule was stated absolutely in the first place. Two days later the owner
overruled that rule for the H.O.P.E. popouts (above). Slot 2's refusal was not revisited
and no reason was given for treating the two differently, so none is invented here: the
record is simply that the same rule was applied on 29 July and set aside on 31 July.

## What is still missing

Two of the five imagery slots hold a painting: the merged slot 2 + 3
(`still-desk.png`) and slot 5 (`vista-path.png`). `still-scripture.jpg` is now
generated-but-unused, alongside `still-study.png` and `still-library.png` — it left the
page when the week and the classes merged into one section. It is still built by
`build_assets.py`, and costs the page nothing, because E no longer holds a
`{{STILL_SCRIPTURE}}` placeholder for it to be inlined into. Slot 6, the Faith band, is
deliberately **type only** — the verse, the cross mark and the gold H O P E row.

Slot 4 — the staff portraits — is filled, by photographs the school supplied (#99, and see
`../portraits/README.md`); six of the ten people still have no picture and show none.
Slot 5 is filled by a landscape, so the page still shows no picture of anywhere Pharos
actually is; the specified interior (an empty classroom before the morning, 21:9) would
replace it. And since slot 3 now holds scripture rather than either academic plate, no
image on the page pictures a class or its subjects — the timetable carries that alone.

The prototype re-encodes the used files to 1400px WebP and inlines them; see
`prototypes/src/build_assets.py`.
