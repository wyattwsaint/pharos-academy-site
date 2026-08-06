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
| `npm run db:migrate` | Applies every unapplied migration to the database in `DATABASE_URL` |
| `npm run db:seed` | Creates the named admin accounts from `SEED_*_PASSWORD`, and attaches the board update's and the policies' PDFs from `docs/mirror/` |

## Environment

Set on Vercel, and pulled locally with `vercel env pull .env.local`.

| | |
| --- | --- |
| `DATABASE_URL` | Neon. Also `POSTGRES_URL`, whichever the integration wrote |
| `ISR_BYPASS_TOKEN` | Lets a revalidation request past the CDN cache. Compiled in by the build unless set |
| `BREAK_GLASS_PASSWORD` | The way back in when both admins are locked out ([#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §4) |
| `SEED_*_PASSWORD` | Read by `npm run db:seed` when it creates the named accounts |
| `RESEND_API_KEY` | Sends the monthly backup email. Absent, the cron answers 500 rather than succeeding quietly |
| `MAIL_FROM` | The address the site sends from — a verified Resend sender on the school's domain |
| `CRON_SECRET` | The bearer token Vercel Cron carries. **Unset, `/api/cron/monthly-backup` refuses everybody**, which is the safe direction: that route mails the whole database |

## Backup

Two layers, because they answer different questions
([#33](https://github.com/wyattwsaint/pharos-academy-site/issues/33)).

**The operator layer** is [`.github/workflows/db-backup.yml`](.github/workflows/db-backup.yml) — a
nightly `pg_dump` kept as a 90-day Actions artifact, with a sanity check that fails the job on a
suspiciously small dump *before* the upload, so a bad dump never joins the list somebody restores
from in a hurry. Neon Free retains six hours of history, so this artifact is the real
point-in-time story, not a convenience. `workflow_dispatch` runs it by hand, and its
`force_small_dump` input drives the sanity check red on purpose — the restore drill.

**The school-held layer** is `/admin/backup`: one ZIP of all content as JSON and every PDF as a
file, readable without Postgres, and **the same ZIP mailed to the school on the 1st of every
month** by `/api/cron/monthly-backup`. The recipient is the email on `/admin/school-details`, read
at send time. The monthly send exists because a manual button is a backup nobody clicks.

## Migrations are applied by hand, before the deploy that needs them

The build never touches Neon ([`scripts/db.mjs`](scripts/db.mjs) says why), so a branch that
adds a migration does not apply it. Neon is one database shared by every deployment, and
the deployed pages read it directly — so a PR whose code expects a column Neon does not
have yet deploys green and then serves 500s, and **Deployed accessibility** goes red on
every page that reads the store while `npm run check`, vitest and the PR's own Playwright
run stay green, because those run on PGlite with the migrations already applied.

So: `vercel env pull .env.local`, then `npm run db:migrate`, then let the deploy run.

A migration that adds rows meant to carry a file — the policies do — needs `npm run db:seed`
in the same sitting. The bytes live in `docs/mirror/`, not in the migration, so until the seed
runs those rows have no document and every address under them answers 404 while the page that
lists them renders empty. `db:seed` exits non-zero when no admin account exists yet, which says
nothing about whether the files attached; read its per-row lines, not its exit code.

Migrations are append-only and each statement is independently safe to re-run, so applying
one early is safe — but it is a one-way door for the deployment already live, which will
be reading the old shape until the PR lands. That is fine only while the site is
pre-launch (see **Before launch** below).

## The pre-commit gate

[`.githooks/pre-commit`](.githooks/pre-commit) runs `npm run check` and `npm test` before
every commit that touches source. `npm install` installs it (the `prepare` script sets
`core.hooksPath`); by hand it is `git config core.hooksPath .githooks`.

It is deliberately narrower than CI — no build, no ISR assertion, no Playwright, since
those need a build or a browser. A gate slow enough to be bypassed is not a gate.
Docs- and workflow-only commits skip it. `git commit --no-verify` bypasses it.

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
