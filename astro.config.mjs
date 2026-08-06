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
  // The 301 map from the Wix site (#30). Declared from one module rather than
  // written out here, so the tests can hold every destination against the
  // enumerated route list — a redirect to a page that does not exist answers
  // 301 and looks fine from the outside.
  redirects: redirectConfig(),
  adapter: vercel({
    isr: {
      expiration: 60 * 60,
      bypassToken,
      // Two addresses that must never be answered from a cache (#33). The
      // backup download would hand back last hour's content while claiming to
      // be a backup taken now, and the monthly cron is a GET whose *effect* is
      // the point — a cached 200 is a month with no email and a green run to
      // say so. Every other admin address escapes the cache by accident, since
      // the guard re-stamps the session cookie and Vercel does not cache a
      // response carrying `Set-Cookie`; these two are too important to leave
      // resting on an accident, and the cron carries no cookie at all.
      // …and the one public page that takes a POST (#30). The volunteer form's
      // answer belongs to a single submission; a cache in front of it is a
      // cache that can hand one visitor's outcome to the next. Read from the
      // route list rather than written out, so the page and the exclusion
      // cannot disagree.
      exclude: ['/admin/backup.zip', '/api/cron/monthly-backup', ...onRequestPaths()],
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
    // The other half of the pair above. Read only from server-only modules
    // (`src/lib/admin/isr-token.ts`) so it never reaches a browser bundle.
    define: {
      __ISR_BYPASS_TOKEN__: JSON.stringify(bypassToken),
    },
  },
});
