// @ts-check
import { createHash } from 'node:crypto';

import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import { redirectConfig } from './src/lib/redirects.js';
import { onRequestPaths } from './src/lib/routes.js';
import { SITE_URL } from './src/lib/site.js';

/**
 * The token that lets the admin re-request its own public pages past the cache
 * (#18 §3).
 *
 * Derived from the commit being deployed rather than read from a Vercel
 * environment variable, because the token only has to agree *within one
 * deployment* — the adapter bakes it into the prerender config and the same
 * value is compiled into the server bundle below, so both sides of one build
 * always match, and no secret has to be provisioned by hand for revalidation to
 * work. `ISR_BYPASS_TOKEN` overrides it if a shared value is ever wanted.
 *
 * Vercel requires exactly 32 characters.
 */
const bypassToken =
  process.env.ISR_BYPASS_TOKEN ??
  createHash('sha256')
    .update(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-development')
    .digest('hex')
    .slice(0, 32);

// Public pages are ISR, not static and not SSR (spec #18 §1). Static puts a
// rebuild in front of every typo fix; plain SSR makes real parents absorb a
// Neon cold start on exactly the pages meant to sell the school. The
// `expiration` is the backstop for #18 §3's failure mode — a save that did not
// revalidate self-heals within the hour instead of looking, to Jill, exactly
// like an edit that vanished.
export default defineConfig({
  site: SITE_URL,
  output: 'server',
  // `true`, not Astro 7's default of `'jsx'`, which ate the space in front of
  // links (#184).
  //
  // The two are not the same compression. `'jsx'` applies JSX's whitespace
  // rules, which *delete* the line break between a line of prose and the tag on
  // the next line rather than collapsing it. "Pharos Academy meets at" followed
  // by `<a>Enola First Church of God</a>` on the next line went to the live site
  // as `meets at<a …>`, and a parent read "meets atEnola First Church of God".
  // That shape — prose, a line break, a link — is how the whole site is written
  // and how a formatter rewraps it, so it is a fault that comes back every time
  // a paragraph is re-flowed; #148's audit could not end it, because the source
  // was never wrong. `true` collapses each run of whitespace to one space and
  // leaves the gap where it was, which is what HTML itself does.
  //
  // What it costs is the difference between the two, not the whole of the
  // compression: 3.8 KB of markup across the entire server bundle, 1 KB of it
  // after gzip. Turning compression off altogether would have cost 27 KB and
  // 3.6 KB, and would have fixed nothing this does not.
  //
  // Named explicitly rather than left to the default, because the whole fault
  // was that `true` and `'jsx'` look like the same setting. Set it back and
  // `e2e/link-spacing.spec.ts` fails on /about — the dev server compresses the
  // same way the build does, so that happens before a deployment exists to be
  // wrong. See docs/adr/0014.
  compressHTML: true,
  // The 301 map from the Wix site (#30). Declared from one module rather than
  // written out here, so the tests can hold every destination against the
  // enumerated route list — a redirect to a page that does not exist answers
  // 301 and looks fine from the outside.
  redirects: redirectConfig(),
  adapter: vercel({
    // Vercel Web Analytics. The adapter injects the loader that posts to
    // `/_vercel/insights`, which only exists once Web Analytics is turned on for
    // the project in the Vercel dashboard; until then the beacon 404s harmlessly.
    webAnalytics: { enabled: true },
    isr: {
      expiration: 60 * 60,
      bypassToken,
      // The whole admin, and the monthly cron (#33).
      //
      // The admin is excluded wholesale rather than address by address, because
      // the exclusion is not really about caching: an included path is *routed*
      // to the adapter's `_isr` function, and a POST that arrives there answers
      // 303 with no `Location` and no `Set-Cookie`, then dies —
      // `FUNCTION_INVOCATION_FAILED` printed after the word "Redirecting". Every
      // admin screen is a form, so ISR in front of any of them is a screen that
      // cannot be saved and a login that cannot be signed into. The earlier
      // reading here — that a response carrying `Set-Cookie` escapes the cache
      // on its own — was true of the cache and irrelevant to the routing.
      //
      // A cron is a GET whose *effect* is the point: a cached 200 is a month
      // with no email and a green run to say so. Excluded as a family rather
      // than one address at a time, because there are two of them now — the
      // backup and the nightly calendar read (#153) — and a third added without
      // its line here would fail in exactly that silent way.
      // …and the one public page that takes a POST (#30). The volunteer form's
      // answer belongs to a single submission; a cache in front of it is a
      // cache that can hand one visitor's outcome to the next. Read from the
      // route list rather than written out, so the page and the exclusion
      // cannot disagree.
      exclude: [/^\/api\/cron\/.*$/, /^\/admin(\/.*)?$/, ...onRequestPaths()],
    },
  }),
  // The dev toolbar injects its own `<h1>`s ("Audit", "Settings", …) into the
  // dev server's DOM, which no deployed page has. Left on, it races the browser
  // suite: "the school is the single h1" sees five. Off only when the suite
  // starts the server (see playwright.config.ts) — a person running `astro dev`
  // still gets the toolbar.
  devToolbar: {
    enabled: process.env.ASTRO_DEV_TOOLBAR !== 'off',
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // On the empty-lists run (#197) the public pages *are* meant to fail:
      // with no catalog and no staff they refuse rather than print empty
      // surfaces to a parent, which is the guard `listCourses` and `listPeople`
      // exist to be. The dev server pushes those failures to every connected
      // page as Vite's error overlay, so a background request for the sitemap
      // or a prefetched public page puts an overlay over the admin screen under
      // test — measured, not assumed: the suite's clicks on Sign in were
      // intercepted by `<vite-error-overlay>` until this was turned off.
      //
      // It suppresses the overlay, not the errors: the dev server still logs
      // them, and the specs still assert what the admin screens render. Only
      // when that flag is set — every other dev server keeps the overlay a
      // developer wants.
      hmr: process.env.E2E_EMPTY_LISTS ? { overlay: false } : undefined,
    },
    // The other half of the pair above. Read only from server-only modules
    // (`src/lib/admin/isr-token.ts`) so it never reaches a browser bundle.
    define: {
      __ISR_BYPASS_TOKEN__: JSON.stringify(bypassToken),
    },
  },
});
