# House style

How the site sets its words. Spelling is settled in `CONTEXT.md` under
**enrolment unit** and enforced by `src/lib/house-style.test.ts`: prose is
American, and `enrolment` and `cheque` survive only as column names, enum values
and type names. This file is the rest of it — the marks, the spacing and the
capitals — settled by #148 and encoded in `src/lib/punctuation.ts`.

Nothing here was invented. Each rule is what the site already does in most
places, counted across every page and every sentence in the repo; the audit is
the list of the places that disagree. That the style is counted rather than
chosen, and that the audit reports rather than rewrites, is
[ADR-0011](adr/0011-the-punctuation-house-style-is-counted-not-chosen.md).

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

## Spacing around links

**A link is a word in its sentence.** One space before it, one after it, and
nothing underlined that is not the link. Two ways that goes wrong, and both are
mechanical:

- The gap is **missing** — `the<a href="/classes">classes page</a>and` — and the
  sentence reads as one long word.
- The gap is **inside the anchor** — `<a href="/classes">classes page </a>and`
  — which renders as a gap, so nothing looks wrong in a diff, but the underline
  runs a space past the last letter of the link.

What is measured is the gap a browser **renders**, not the one the source shows.
HTML collapses a newline and its indentation into a single space, so a link
wrapped across lines is correct, and a link alone on its own line — every nav
item and every button-styled call to action — has no gap to get wrong, because
whitespace at the edge of a line is dropped.

Where two spaces collapse, the first one survives, and that decides who owns it:
before a link the outer space wins and the underline is clean; after a link the
inner one wins and the underline extends. That asymmetry is why a trailing space
inside an anchor is a finding and a leading one usually is not.

A link set flush against punctuation is correct and is not a finding:
`<a href="/admissions">apply</a>.`, `(<a href="/policies">policies</a>)`,
`<a href="/about">Pharos</a>’s`. A space *before* that punctuation is a finding,
reported by the spacing rule above rather than this one.

This is the one rule in this file that is **enforced rather than reported**:
`src/lib/punctuation.test.ts` fails the build on a link the site has run into
its neighbour. The reason it earns that and a heading's capitals do not is that
there is no version of the school's voice that wants "thepolicies page" — it is
a typo, and #171 corrected the one the site had.

### When the source is right and the page is not

#184 found the same fault with nothing wrong in any file. Astro's `compressHTML`
defaults to `'jsx'`, which does not collapse the newline between a line of prose
and the `<a>` on the next line — it deletes it, and the live site read "Pharos
Academy meets at**Enola First Church of God**". Reading source could not have
caught it, and rewrapping any paragraph would have brought it back.

So the rule is now read in two places against one verdict
(`src/lib/link-gaps.ts`): `punctuation.ts` reads the `.astro` files and names the
line to fix, and `e2e/link-spacing.spec.ts` reads every public page as a browser
receives it. `compressHTML` is set to `true`, which collapses whitespace the way
HTML does and leaves the gap where it was. See
[ADR-0014](adr/0014-the-build-does-not-compress-the-markup.md).

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

**A name is not a heading.** This rule is not applied to copy stored in the
database, because every heading the site renders from a row is the name of a
thing — a course, a policy, an event, a board update — and a name keeps the case
the school gave it. *Basic Spanish Conversation for Beginners* is what that
course is called.

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
the site owner has said yes to them. Spacing around links is the exception, and
the section above says why: it is applied, and a test keeps it applied.

The report is a snapshot, regenerated by hand. No test keeps it current, because
half of what it covers lives in a database CI has no credentials for; what a
test *does* keep honest is the reading behind it, in `src/lib/punctuation.test.ts`.
