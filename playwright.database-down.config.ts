import { defineConfig, devices } from '@playwright/test';

import { DEV_SERVER_ENV, LOCAL_DEV_SERVER, local } from './playwright.config.js';

/**
 * One spec, one server, one job: stop the database for real and watch what the
 * public pages do (#34).
 *
 * `DATABASE_URL` points at port 9 — the discard port — so the Neon HTTP
 * driver's connection is refused immediately. That is a stopped database as far
 * as the app can tell, and it is arranged from the outside: nothing is mocked
 * and the app grows no fault-injection hook.
 *
 * Deliberately **without** `SUITE_ADMIN_ENV`. `E2E_ADMIN_USERNAME` opens an
 * ephemeral PGlite database and wins over `DATABASE_URL` (`src/lib/db/client.ts`),
 * which would hand this config a perfectly healthy store and a green run
 * proving nothing.
 *
 * Separate from `playwright.config.ts` because Astro 7 allows one dev server
 * per project directory, so the healthy server and this one cannot run side by
 * side. `npm run test:e2e:database-down` runs this after the main suite.
 *
 * Runs locally only. Against a real deployment there is no unreachable database
 * to point at, and arranging one would mean stopping the school's Neon compute
 * to watch the live site break.
 */
const STOPPED_DATABASE = 'postgresql://nobody:nothing@127.0.0.1:9/pharos';

if (!local) {
  throw new Error(
    'playwright.database-down.config.ts stops the database under a local dev server. PLAYWRIGHT_BASE_URL is set, so there is a real deployment in play — refusing to run.',
  );
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/database-down.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: LOCAL_DEV_SERVER.url,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    ...LOCAL_DEV_SERVER,
    // Readiness is probed on `robots.txt` rather than on `/`, because this
    // config's whole point is that `/` answers 500 here. Playwright treats a
    // 5xx as "not up yet" and would wait out its timeout against a server that
    // is working exactly as intended. `robots.txt` reads no store, so it is
    // still 200 with the database stopped.
    url: `${LOCAL_DEV_SERVER.url}/robots.txt`,
    // Never reused: a server left running by the main suite has a working
    // database, which is the opposite of what this config exists to arrange.
    reuseExistingServer: false,
    env: { ...DEV_SERVER_ENV, DATABASE_URL: STOPPED_DATABASE },
  },
});
