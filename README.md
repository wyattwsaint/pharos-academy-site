# Pharos Academy — website

Replacement for the current Wix site at <https://www.pharosacademy.net/>.

Pharos Academy is a Christian classical hybrid microschool in Enola, PA, operating on the
H.O.P.E. model (Helping Our Parents Educate).

**Status:** scaffolded. One placeholder page, served through ISR, with the test harness
and release pipeline in place. The real pages land slice by slice — see
[#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) for the build plan.

The domain vocabulary is in [`CONTEXT.md`](CONTEXT.md); decisions that constrain the
build are in [`docs/adr/`](docs/adr/).

## Stack

Astro 7 + Tailwind 4 on Vercel via `@astrojs/vercel`. Public pages are **ISR** — rendered
on demand and CDN-cached — not a static export and not plain SSR
([#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §1, §3). Astro 7
rather than the #18-specified Astro 6: see
[ADR-0001](docs/adr/0001-astro-7-not-astro-6.md).

Still to come, as their slices land: Neon + Drizzle for the store, a self-rolled admin,
Resend for notification email.

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server on <http://localhost:4321> |
| `npm run build` | Production build into `.vercel/output` |
| `npm run check` | `astro check` — types across `.ts` and `.astro` |
| `npm test` | vitest, the pure modules |
| `npm run test:e2e` | Playwright + axe. Starts a dev server unless `PLAYWRIGHT_BASE_URL` is set |
| `npm run verify:isr` | Asserts the build output really is ISR. Run after `npm run build` |

## The public route list

[`src/lib/routes.ts`](src/lib/routes.ts) holds `PUBLIC_ROUTES`, and it is the only place
public routes are enumerated. The sitemap and `llms.txt` are generated from it, the ISR
verification checks against it, and whole-site revalidation will use it. A test fails if
a page exists under `src/pages` without an entry, so the list cannot drift from what is
actually built.

## Before launch

`INDEXABLE` in [`src/lib/site.ts`](src/lib/site.ts) is `false`, because the real domain
still points at the live Wix site. It drives both `robots.txt` and the `X-Robots-Tag`
header, so flipping it to `true` is the whole of "go live" as far as crawlers are
concerned.

## CI

| Workflow | What it does |
| --- | --- |
| **PR tests** | types, vitest, build, ISR verification, Playwright + axe |
| **PR title lint** | the title becomes the squashed commit subject, so it must be a conventional commit |
| **Deployed accessibility** | re-runs the axe suite against the URL Vercel actually deployed |
| **Release** | release-please keeps a release PR open on `main` |
| **Merge train** | serial `automerge` lander — see [`.github/workflows/automerge.yml`](.github/workflows/automerge.yml) |

**Merging to `main` deploys.** There is no separate deploy step on this repo.

## The design prototype

`prototypes/` is throwaway and does not ship. It previously *was* the deployment —
`vercel.json` built `prototypes/src/build_site.py` and served it at
<https://pharos-preview-rose.vercel.app>, which is the page George and Jill signed off on
[#13](https://github.com/wyattwsaint/pharos-academy-site/issues/13). That build is now
replaced by the Astro app. It stays reproducible from the repo, and from Vercel's
deployment history at `dpl_BD52iPUT3FxFJyRm2mnQX6vyKKWa` (the rollback target recorded on
[#12](https://github.com/wyattwsaint/pharos-academy-site/issues/12)).

## Client

Jill Kilker — 717-497-0896
9 Sherwood Drive, Enola, PA 17025
