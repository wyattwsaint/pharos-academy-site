# Handoff

The page to find when something is wrong, when the site has to move, or when somebody
other than the person who built it has to change it.

George's only job is keeping this page findable. It holds **no passwords, keys or
connection strings** — it names the things and says where the printed sheet is.

> **Where the credentials are.** One printed sheet in the locked drawer of the desk in
> the Pharos Academy office, held by Jill Kilker. It lists the login for each account
> named below. Nothing in this repository holds a copy, and nothing in this repository
> ever should.

---

## For the next developer

**The code** is <https://github.com/wyattwsaint/pharos-academy-site>. Astro 7 + Tailwind 4,
deployed to Vercel through `@astrojs/vercel`. Public pages are ISR — rendered on demand
and CDN-cached for an hour. The store is Neon Postgres, reached through Drizzle.
[`README.md`](../README.md) is the working detail; [`CONTEXT.md`](../CONTEXT.md) is the
vocabulary; [`docs/adr/`](adr/) is why things are the way they are.

**Deploying is merging.** A pull request that lands on `main` deploys. There is no
separate deploy step, no button, and nothing to run afterwards. The merge train
(`.github/workflows/automerge.yml`) lands PRs one at a time.

**Migrations are applied by hand, before the deploy that needs them.** The build never
touches Neon. `vercel env pull .env.local`, then `npm run db:migrate`, then let the deploy
run. A migration whose rows carry a file — the policies do — needs `npm run db:seed` in
the same sitting. Getting this backwards deploys green and then serves 500s on every page
that reads the store. README has the long version.

**The login** is `/admin` on the live site. Accounts are rows in the store, created by
`npm run db:seed` from the `SEED_*_PASSWORD` variables below; the passwords on the printed
sheet are the ones seeded. Two people have accounts — Jill and George. There is no signup,
no email flow and no vendor: sessions are a hashed token in a cookie
([ADR-0002](adr/0002-hashed-session-token-not-signed-cookie.md)).

- **Locked out, one of them.** The other resets it from `/admin/users`.
- **Locked out, both of them.** `BREAK_GLASS_PASSWORD` in the Vercel environment signs in
  as a way back. Unset or blank it is a closed door, never an open one — so it must be
  set for the escape hatch to exist, and its value is on the printed sheet.

**Moving the hosting** is [Drill B](#drill-b--migration) below. It is a runbook, not a
paragraph, because the point of writing it down was that the exit is provable.

**The developer's own account** (`SEED_DEV_USERNAME`, default `developer`) is deleted from
`/admin/users` at handoff. If it is still listed, delete it.

---

## Every environment variable

Set in the Vercel project (Settings → Environment Variables) unless the table says
otherwise, and pulled locally with `vercel env pull .env.local`.

`src/lib/handoff-doc.test.ts` scans the source for every name read from the environment
and fails if one is missing from this table, so the list cannot quietly fall behind the
code.

### Set on Vercel — the site needs these

| Name | What it is | Absent |
| --- | --- | --- |
| `DATABASE_URL` | The Neon connection string. Written by the Neon integration | Every page that reads the store 500s; the admin cannot save |
| `POSTGRES_URL` | The same thing under the other name the integration sometimes writes. `DATABASE_URL` wins (`src/lib/db/client.ts`) | Harmless if `DATABASE_URL` is set |
| `BREAK_GLASS_PASSWORD` | The way back in when both admins are locked out | No escape hatch. A locked-out pair needs a developer with database access |
| `CRON_SECRET` | The bearer token Vercel Cron carries to `/api/cron/monthly-backup` | **That route refuses everybody.** No monthly backup email. This is the safe direction — the route mails the whole database |
| `RESEND_API_KEY` | Sends the monthly backup email through Resend | The cron answers 500 rather than succeeding quietly, so a missing key shows up red |
| `MAIL_FROM` | The address the site sends from — a verified Resend sender on the school's domain | Same 500 as above |
| `ISR_BYPASS_TOKEN` | Lets the admin re-request its own public pages past the CDN cache after a save. **Optional** — the build derives one from the commit if unset, and both halves of one build agree by construction. Vercel requires exactly 32 characters | Nothing. The derived token is used |

### Set on Vercel by Vercel

| Name | What it is |
| --- | --- |
| `VERCEL` | Present on every Vercel build and runtime. With `NODE_ENV`, it is what `src/lib/db/client.ts` calls "production" — the state in which the suite's throwaway-database path refuses to start |
| `VERCEL_GIT_COMMIT_SHA` | The commit being deployed. `astro.config.mjs` hashes it into the ISR bypass token |
| `NODE_ENV` | `production` on a deployment. See `VERCEL` |

### Set in GitHub — Settings → Secrets and variables → Actions

| Name | What it is | Absent |
| --- | --- | --- |
| `DATABASE_URL` | The same Neon string again, for the nightly `pg_dump` in `.github/workflows/db-backup.yml`. **A separate copy** — Vercel's environment is not visible to Actions | The nightly backup job fails. Ninety days of artifacts stop accumulating |
| `AUTOMERGE_TOKEN` | A token with write access, used by the merge train and by release-please. The default `GITHUB_TOKEN` cannot trigger the workflows that must run on what it pushes | PRs stop landing automatically; merging is by hand |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Lets the **Deployed accessibility** workflow past Vercel's deployment protection to run axe against the real preview URL. Read from the Vercel project's Deployment Protection settings | That workflow sees Vercel's login wall instead of the site |

### Development and test only — never set on a deployment

| Name | What it is |
| --- | --- |
| `SEED_JILL_PASSWORD` | The password `npm run db:seed` creates Jill's account with. Read once, at seed time; never defaulted or generated — an unset variable skips the account and says so |
| `SEED_GEORGE_PASSWORD` | The same, for George |
| `SEED_DEV_PASSWORD` | The same, for the developer's build-time account |
| `SEED_DEV_USERNAME` | That account's username. Defaults to `developer` |
| `SEED_DEV_NAME` | Its display name. Defaults to `Site developer` |
| `E2E_ADMIN_USERNAME` | Makes a dev server open an **ephemeral PGlite database** with this account in it, instead of connecting to Neon. Set only by the Playwright config. `src/lib/db/client.ts` **throws on startup** if it is set on a deployed environment — left to run it would serve an empty database opened by a password committed to this repo |
| `E2E_ADMIN_PASSWORD` | That account's password. Both or neither |
| `REVALIDATE_ORIGIN` | Overrides the origin a save revalidates. Exists so `playwright.revalidation.config.ts` can point it at a dead port and exercise a genuinely failed revalidation without a fault-injection hook in the app |
| `PLAYWRIGHT_BASE_URL` | Points the browser suite at a real deployment instead of starting a local dev server. How CI runs axe against the deployed page |
| `ASTRO_DEV_TOOLBAR` | `off` suppresses Astro's dev toolbar, whose injected `<h1>`s would otherwise race the accessibility assertions. Set by the Playwright config only — a person running `astro dev` still gets the toolbar |
| `CI` | Set by GitHub Actions. Turns on retries, the GitHub reporter, and `forbidOnly` |

---

## The stale-ISR verification

The delivery model rests on one claim: when the database is down, Vercel keeps serving the
**stale** ISR copy of each public page rather than an error or an empty page. That was
accepted as a risk on condition it was tested for real, not read out of the docs.

It has two halves, and they are tested differently.

### The application half — automated, and it found a defect

`npm run test:e2e:database-down` runs `e2e/database-down.spec.ts` against a dev server
whose `DATABASE_URL` points at port 9, the discard port. The connection is refused
immediately: that is a stopped database as far as the app can tell, arranged entirely from
outside, with nothing mocked and no fault-injection hook in the application.

The spec walks every entry in `PUBLIC_ROUTES` and asserts each answers **≥ 500**. That
assertion is the point. Vercel's stale-on-error only engages when the regeneration
*fails* — a page that swallows its store error and answers `200` gets its own emptiness
cached over the good copy, which is worse than an error.

Running it found exactly that. `/` answered `200` with 51 bytes of truncated HTML while
every other public page answered `500`: the homepage read announcements *inside*
`Announcements.astro`, and because the response streams, the `200` was already on the wire
when the read failed. Fixed by hoisting the read into the page frontmatter. The spec now
runs on every pull request.

**Status:** Performed on 2026-08-06. 26 of 26 public routes fail closed with the database
unreachable. One defect found and fixed.

### The platform half — a procedure, not an assertion

Whether the *CDN* then serves the stale copy is Vercel's behaviour, not the app's, and it
cannot be observed from a dev server. It needs a deployed page that has rendered at least
once, the Neon compute for that project genuinely stopped, and the page requested again.

Do it against a **scratch** Neon project and a **preview** deployment, never against the
school's:

1. In the Neon console, create a scratch project. Point a preview deployment's
   `DATABASE_URL` at it and let it build.
2. Request a public page and confirm it renders. It is now in the ISR cache.
3. In the Neon console, **Stop** that project's compute endpoint.
4. Request the page again, past the hour's `expiration` if you can wait, or with a fresh
   cache-busting query. Record what comes back: the previous copy, or an error.
5. Restart the compute and delete the scratch project.

**Status:** Not yet performed — needs a person with console access to the Vercel and Neon
dashboards. It cannot be arranged from a build agent, and it must not be arranged by
stopping the school's live compute.

---

## The post-deploy thin spot

A page that has never rendered **in the current deployment** has no stale copy to fall back
to. Every deployment starts with an empty ISR cache, so for the first request to each page
after a deploy there is nothing to serve stale — and if the database is down at that
moment, that request gets an error.

This is not fixed, and it is not claimed away. It is a **human procedure**:

> **Do not deploy during a Neon incident.** If the store is down or degraded, wait. A
> deploy is a merge to `main`, so this means: do not merge, and hold the merge train.

Check <https://neonstatus.com> before merging anything on a day the site is behaving oddly.
The window is small — one request per page, and the first request warms the cache for
everyone after it — but it is real, and it is the price of ISR. The alternative is a static
export, which puts a rebuild in front of every typo fix, and that trade was made
deliberately (spec #18 §1).

---

## Drill A — restore

Proves the nightly `pg_dump` is a backup and not a file: a dump loaded into an empty Neon
project, with the site running off it, PDFs included.

1. **Get a dump.** GitHub → Actions → **DB backup** → the most recent successful run →
   download the `db-backup-<date>` artifact and unzip it. `workflow_dispatch` produces one
   on demand if the schedule has not run yet.
2. **Make an empty target.** Neon console → new project. Copy its connection string.
   Nothing else — no migrations, no seed. The dump carries the schema.
3. **Restore.**
   `pg_restore --dbname "<scratch connection string>" --no-owner --no-privileges backup-<date>.dump`
   The client's major version must be ≥ the server's; Neon serves Postgres 17.
4. **Run the site off it.** The dev server reads `DATABASE_URL` from the real process
   environment, so set it there — `$env:DATABASE_URL = '<scratch connection string>'` in
   PowerShell, `export DATABASE_URL=...` in a POSIX shell — and **do not** leave your usual
   `.env.local` pointing at the school's Neon while you do it. Then `npm run dev` and
   walk the site: the homepage's announcements, `/staff`, `/news`, `/classes`, and — the
   part that matters — open a policy PDF and the board update PDF. Those bytes live in the
   database, so a restore that loses them is a restore that looks fine and is not.
5. **Sign in.** `/admin`, with the password from the printed sheet. The accounts are rows;
   they come back with everything else.
6. **Write the line below**, then delete the scratch Neon project.

**Status:** Not yet performed — no artifact exists to restore from. The **DB backup**
workflow landed on 2026-08-05 (#53) and its 07:00 UTC schedule has not yet produced one.
Run it from the Actions tab, then perform this drill.

---

## Drill B — migration

**The drill that matters most.** Hosting stays on the developer's Vercel Pro account, and
that decision is explicitly conditional on the exit being proven. Untested, it is an
unsupported decision — so this is rehearsed now, on a scratch copy, rather than discovered
on a day when it is urgent.

The school performs it. **No developer involvement** — that is the whole point, and a
developer touching a keyboard invalidates the result.

1. **Sign in as the school.** GitHub, as the account that will own the repository.
2. **Fork or transfer** `wyattwsaint/pharos-academy-site`. For the rehearsal, fork it — a
   transfer is one-way.
3. **Make a free Vercel account** and sign into it with that GitHub account. Free, not a
   trial of Pro.
4. **Import the repository.** Vercel detects Astro; the build command is in `vercel.json`.
   Let it fail the first build if it does — there is no database yet.
5. **Add a Neon project.** Vercel → Storage → Neon, or the Neon console directly. Free
   tier. Copy the connection string into the project's `DATABASE_URL`.
6. **Set the environment variables** the site needs — the first table above. From the
   printed sheet, not from the developer.
7. **Apply the migrations and seed**, from a checkout of the fork:
   `npm ci`, then `npm run db:migrate`, then `npm run db:seed`.
8. **Redeploy** and walk the site: every public page, a policy PDF, and a sign-in at
   `/admin` followed by one real edit that appears on the public page.
9. **Note what the free tier changes.** Vercel's free plan caps how many cron jobs a
   project may have and how precisely they fire — `vercel.json` declares one, on the 1st of
   the month, which is within that cap, but the hour it actually runs may drift. Confirm
   the job appears under the project's **Cron Jobs** tab. Whatever the answer, the
   `/admin/backup` ZIP is still there and is still the school's own copy. Record what you
   actually observe rather than what this list expects.
10. **Write the line below**, then delete the scratch Vercel project and the scratch Neon
    project. The fork can stay.

**Status:** Not yet performed — by definition this is the school signing in as itself. It
cannot be rehearsed by the developer or by an agent without defeating what it proves.

---

## Neon capacity

Neon **Free** gives **100 CU-hours of compute per month**. The site's compute endpoint at
0.25 CU burns roughly 0.25 CU-hours per wall-clock hour it is awake, so 100 CU-hours is
about **400 hours** against the **~730 hours** in a month. An endpoint that never scales to
zero exhausts the allowance with about a third of the month left.

**What that looks like when it happens.** Compute suspends until the next billing cycle.
The public site keeps working — it serves the stale ISR copy of each page, which is the
same behaviour the verification above is about — and **the admin stops saving**. Jill sees
an error on save, not a quiet failure. Nothing is lost; nothing can be changed either.

**Measure it rather than guess.** Neon console → the project → **Usage** (also
**Monitoring** → *Compute*). Read *Compute hours used this billing period* and note the day
of the cycle, so the figure can be projected to a month. Take the reading at least twice, a
week apart, once the site is live and taking real traffic — a pre-launch reading measures
the developer, not the school.

| Date | CU-hours used | Day of billing cycle | Projected month |
| --- | --- | --- | --- |
| _(first live reading)_ | | | |

**The remedy, named in advance: Neon Launch — $0.106 per CU-hour, no minimum commitment.**
If the projection crosses 100 CU-hours, move the project to Launch. At 0.25 CU awake all
month that is roughly 180 CU-hours, so on the order of **$19/month** for compute. It is a
plan change in the Neon console, not a migration: same project, same connection string, no
deploy.

Two things reduce the number before spending anything, in this order:

1. **Scale-to-zero.** Confirm the endpoint suspends when idle (Neon project settings →
   *Compute* → *Scale to zero*). An always-on endpoint is the whole 730 hours. The cost is
   a cold start on the first request after an idle period, which ISR already absorbs for
   public pages.
2. **The ISR hour.** Public pages are cached for an hour, so traffic does not reach the
   database. Shortening that expiration multiplies compute; lengthening it reduces it.

**Status:** Not yet performed — the site is not live, so there is no representative usage
to read. Take the first reading a week after launch and fill in the table above.

---

## What this document is worth

Four of the sections above say *not yet performed*. That is deliberate and it is the honest
state: three of them need a person at a console the build cannot reach, and one of them
needs the school signing in as itself, which is exactly what it exists to prove.

`src/lib/handoff-doc.test.ts` asserts that each of those sections carries a **Status** line
saying either when it was performed or why it was not. A drill can be outstanding here. It
cannot be silently missing an answer.
