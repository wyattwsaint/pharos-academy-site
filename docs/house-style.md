# House style

How the site sets its words. Spelling is settled in `CONTEXT.md` under
**enrolment unit** and enforced by `src/lib/house-style.test.ts`: prose is
American, and `enrolment` and `cheque` survive only as column names, enum values
and type names. This file is the rest of it — the marks, the spacing and the
capitals — settled by #148 and encoded in `src/lib/punctuation.ts`.

Nothing here was invented. Each rule is what the site already does in most
places, counted across every page and every sentence in the repo; the audit is
the list of the places that disagree.

## Quotation marks and apostrophes

Typographic, not straight: “these”, ‘these’, and ’ for an apostrophe.

The site was already 67 curly apostrophes to 41 straight, and 88 curly quotes to
29 straight, before anything was decided. The straight ones are the accident.

A straight double quote after a number is an **inch mark**, not a quotation mark
— `18"x12" sketch pad`. Its typographic form is the double prime ″, and whether
a materials list wants primes at all is the school's call, not a mechanical fix.

## Dashes

- **Em dash, spaced** — like this — for a break in a sentence. The site sets 262
  of them and it is the strongest convention it has.
- **En dash, unspaced** for a range of numbers: 2026–2027, ages 10–13, Acts
  18:24–28.
- **Hyphen** only inside a compound word: high-school credit, byte-for-byte.
- Never `--`, and never a spaced hyphen standing in for a dash.

A phone number is not a range: `717-555-0143` keeps its hyphens.

## Spacing

- One space after `.`, `,`, `;`, `:`, `?` and `!`. Never a space before one.
- One space between words and one between sentences. Never two.
- A run of three or more spaces is usually a **layout**, not a typo — the
  export's README lines its filenames up in a column — so it is a judgement
  call rather than a mechanical fix.
- A no-break space is sometimes deliberate glue and sometimes a paste from a
  word processor. It is always reported and never assumed.

## Ellipses

The single character `…`. Never three dots, and never dots spaced apart.

## Capitalisation of headings

**Sentence case.** "Our mission and vision", "What you agree to", "Where we
meet" — this is what every page does except Admissions and the staff page.

Proper nouns keep their capitals, and so do the names of documents: the
*Statement of Faith and Practice* is a document, not a heading in title case,
and renaming it would rename the paper the school hands out.

A heading of two sentences is sentence case twice over: "Mornings here.
Afternoons yours."

## What this style does not reach

**Transcribed copy.** Four places hold the school's own documents word for word
— `src/lib/about/beliefs.ts`, `src/lib/about/story.ts`,
`src/lib/courses/catalogue.ts` and the `courses` table behind them — and each
has a test beside it that fails on any drift from the capture in `docs/mirror/`.
`story.ts` says so in as many words: the test fails on "a tidied dash or a
corrected space". A finding there is still a finding, but the school changes its
document and the transcription follows it. It is never corrected here.

**A family's own writing.** The text on an application or an inquiry is the
family's, and no style applies to it.

## Applying it

`npm run audit:punctuation` rewrites [docs/punctuation-audit.md](punctuation-audit.md):
every place the site departs from this file, grouped by class of issue, with
what it says now and what the style asks for. It reports and never rewrites —
prose on a school's site is the school's voice, and the corrections land once
the site owner has said yes to them.
