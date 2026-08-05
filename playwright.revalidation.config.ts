import { defineConfig, devices } from '@playwright/test';

import { DEV_SERVER_ENV, LOCAL_DEV_SERVER, SUITE_ADMIN_ENV, local } from './playwright.config.js';

/**
 * One spec, one server, one job: prove #20's failed-revalidation message by
 * *forcing a real failure*.
 *
 * > a retryable message when revalidation fails (verify by forcing a failure)
 *
 * `REVALIDATE_ORIGIN` points the save's revalidation at a port nothing is
 * listening on — 9 is the discard port, so connections there are refused
 * immediately. Nothing is mocked and the app grows no fault-injection hook: the
 * save really does write, and the live site really is unreachable.
 *
 * Separate from `playwright.config.ts` because Astro 7 allows one dev server
 * per project directory, so the healthy server and this one cannot run side by
 * side. `npm run test:e2e:revalidation` runs this after the main suite.
 *
 * Runs locally only. Against a real deployment there is no throwaway database
 * to sign into, and pointing a deployed admin at a dead origin would be
 * breaking the live site to watch it break.
 */
const DEAD_ORIGIN = 'http://127.0.0.1:9';

if (!local) {
  throw new Error(
    'playwright.revalidation.config.ts forces a revalidation failure against a local dev server. PLAYWRIGHT_BASE_URL is set, so there is a real deployment in play — refusing to run.',
  );
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/admin-revalidation.spec.ts',
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
    // Never reused: a server left running by the main suite revalidates a live
    // origin, which is the opposite of what this config exists to arrange.
    reuseExistingServer: false,
    env: { ...DEV_SERVER_ENV, ...SUITE_ADMIN_ENV, REVALIDATE_ORIGIN: DEAD_ORIGIN },
  },
});
