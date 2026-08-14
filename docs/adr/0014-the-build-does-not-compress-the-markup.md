# ADR-0014 — The build collapses whitespace rather than deleting it, and the link rule is read twice

**Status:** accepted
**Date:** 2026-08-13
**Context:** [#184](https://github.com/wyattwsaint/pharos-academy-site/issues/184), builds on
[#171](https://github.com/wyattwsaint/pharos-academy-site/issues/171) and
[ADR-0011](0011-the-punctuation-house-style-is-counted-not-chosen.md)

## Context

Two screenshots from the live site, both missing the space in front of a link:

> Pharos Academy meets at**Enola First Church of God**.

> — or read**how applying works**, which …

Nothing was wrong in any file. Both paragraphs are written the way nearly every paragraph on
this site is written — a line of prose, a line break, an `<a>` on the next line — and HTML
renders that break as a space. #171 had already made that shape the rule, and
`src/lib/punctuation.test.ts` had been enforcing it since. #148's audit swept the same copy
and reported nothing, correctly.

The fault was `compressHTML`, and specifically *which* compression. Astro 7 defaults it to
`'jsx'`, not `true`, and the two are different readings of the same markup. Run the compiler
on the offending paragraph:

| `compressHTML` | what the template becomes |
| --- | --- |
| `'jsx'` (the default) | `— or read<a href="/admissions">` |
| `true` | `— or read` ⏎ `<a href="/admissions">` |
| `false` | unchanged |

`'jsx'` applies JSX's whitespace rules: whitespace at the start and end of a line beside a
tag is not markup, so it goes. `true` collapses each run to a single space and leaves the gap
where it was, which is what HTML itself does with it. The site had been shipping the first.

Two things made this worse than a typo. It is a *class* — it comes back on any paragraph a
formatter rewraps, which is why #148 could not end it and why patching the eight sites found
would not either. And it is invisible everywhere a person would look: in the file, in the
diff, and in the review. The one place it is visible is a rendered page, and nothing rendered
one.

The alternatives considered:

- **Patch each site with `{' '}`.** The escape hatch already appears twenty-odd times in this
  repo, which is the evidence that the site had been fighting this for months without naming
  it. It leaves the next rewrap broken. Rejected.
- **Teach the source rule about it.** The source rule cannot see the fault: the source is
  *correct*. There is no rule it could learn that would not also flag the hundreds of
  correctly-wrapped links around it. Rejected.
- **Turn compression off entirely (`false`).** It fixes the bug, and it was the first fix
  written here. It costs 27 KB of markup and 3.6 KB gzipped where `true` costs 3.8 KB and
  1 KB, and it buys nothing `true` does not. Rejected once the three modes were actually
  measured — which is the lesson of this ADR as much as the fix is.

## Decision

**`compressHTML: true`.** Named explicitly in `astro.config.mjs` rather than left to the
default, with the difference between `true` and `'jsx'` written beside it, because the whole
fault was that those two look like the same setting.

**The rule is read in two places, against one verdict.** `src/lib/link-gaps.ts` holds it —
what counts as a gap, and which punctuation a link may sit flush against.
`src/lib/punctuation.ts` applies it to the `.astro` files and can name the line to fix;
`e2e/link-spacing.spec.ts` applies it to every public page as a browser receives it, which is
the only place #184's fault existed. Neither reading may call a sentence faulty that the other
calls clean, and `link-gaps.test.ts` holds the two against each other case by case — because
the first draft of this change claimed that agreement in three doc comments without anything
enforcing it, and the two rules already disagreed in two cases.

**The seam is the rendered page, not the flag.** The dev server compresses exactly as the
build does, so setting `compressHTML` back to `'jsx'` fails `e2e/link-spacing.spec.ts` on
`npm run dev` and in `pr-tests.yml`, before a deployment exists to be wrong. No test asserts
the flag's value; the test asserts what a family reads.

## Consequences

**Good.**

- The class is closed rather than the two instances. A rewrapped paragraph cannot bring it
  back, and neither can a new page written the same way as every existing one.
- The rendered page is now checked across all 32 public routes. The sweep found two faults
  nobody had reported — the email and phone links on the home page and `/inquire` underlined
  a trailing space — and they are fixed here.
- The compression is kept. The fix costs 1 KB gzipped across the whole site, not 3.6 KB.

**Bad, and accepted.**

- One more page-per-route browser test, on a suite that already runs 500-odd. The sweep costs
  about fifteen seconds.
- The rendered rule does not judge a link whose neighbour is an element rather than text —
  `<strong>read</strong><a …>` has no adjacent text node. That is the same blind spot the
  source rule has, and closing it in one place without the other would break the agreement the
  two are held to.
- `compressHTML: true` is now a value this repo depends on rather than inherits. If Astro
  changes what `true` means, the browser sweep is what will say so, and it will say it as a
  spacing failure on `/about` rather than as anything about the build.
