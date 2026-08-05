# ADR-0001 — Astro 7, not Astro 6

**Status:** accepted
**Date:** 2026-08-04
**Context:** [#19](https://github.com/wyattwsaint/pharos-academy-site/issues/19), amends [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §1

## Context

#18 §1 and #19 both name the stack as **Astro 6 + Tailwind 4 with `@astrojs/vercel`**,
following the `legacy-roofing-site` / `brobst-cleaning-site` house pattern. Astro 6 was
current when that was written.

Scaffolding on `astro@6.4.8` with `@astrojs/vercel@10.0.8` installs clean, but
`npm audit` reports three unfixed high-severity advisories against every Astro release
at or below 7.0.9:

- GHSA-4g3v-8h47-v7g6 — reflected XSS via unescaped View Transition animation properties
- GHSA-f48w-9m4c-m7f5 — XSS via unescaped spread attribute names in `renderHTMLElement`
- GHSA-7pw4-f3q4-r2p2 — XSS via unescaped `transition:*` directive values on hydrated islands

plus vulnerable pinned `sharp` and `esbuild`. There is no patched 6.x line — npm's own
remediation is "upgrade to Astro 7, a breaking change".

## Decision

Build on **Astro 7.1.6 with `@astrojs/vercel` 11.0.4**. Tailwind 4 is unchanged; so is
every other element of the house pattern.

"Astro 6" in #18 and #19 is read as *the current Astro major*, which is the reading that
serves the stated intent — a working floor every later slice lands on. #19 exists
precisely so that later slices do not have to retrofit the foundations, and shipping a
framework with three known XSS advisories into that position defeats the ticket.

## Consequences

- The one API difference this scaffold touches: `defineConfig` is imported from
  `astro/config`, not from `astro`.
- Astro 7's dev server daemonises itself when it detects a coding-agent environment.
  Playwright's `webServer` blanks the detection variables so it stays in the foreground
  and Playwright owns its lifetime (`playwright.config.ts`).
- One high-severity advisory remains and is accepted: `path-to-regexp`, reached
  transitively through `@astrojs/vercel` → `@vercel/routing-utils`. It is build-time
  route compilation over our own route table, not a request path, and the only
  "fix" npm offers is a downgrade to `@astrojs/vercel@8`, which is a worse position.
  Revisit when `@vercel/routing-utils` ships a patched release.
- The house pattern in `legacy-roofing-site` / `brobst-cleaning-site` is now one major
  behind this repo. That is a divergence to be aware of when copying code across, not a
  reason to hold this repo back.
