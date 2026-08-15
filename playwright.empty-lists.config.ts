import { defineConfig, devices } from '@playwright/test';

import { DEV_SERVER_ENV, LOCAL_DEV_SERVER, SUITE_ADMIN_ENV, local } from './playwright.config.js';

/**
 * One spec, one server, one job: a throwaway database with the four seeded
 * lists emptied, so the empty states of People, Classes, Announcements and
 * Policies are reachable at all (#197).
 *
 * The migrations seed a full catalogue, staff list, announcement history and
 * policy set, so against the ordinary suite database the four lists are never
 * empty and their empty states would ship untested. Policies and Announcements
 * have grown deletes since (#260, #258) and the rest will; emptying four seeded
 * lists a press at a time, republishing the whole site on each one, is not a
 * cheaper way to reach the same screen. `E2E_EMPTY_LISTS` makes the suite
 * server delete
 * the seeded content after migrating (`src/lib/db/client.ts`), which only
 * happens in suite mode, and suite mode already refuses to run on a deployment.
 *
 * Separate from `playwright.config.ts` because Astro 7 allows one dev server
 * per project directory, so the fully-seeded server and this one cannot run
 * side by side. `npm run test:e2e:empty-lists` runs this after the main suite,
 * as the revalidation and database-down configs do.
 */
if (!local) {
  throw new Error(
    'playwright.empty-lists.config.ts empties a throwaway database under a local dev server. PLAYWRIGHT_BASE_URL is set, so there is a real deployment in play — refusing to run.',
  );
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/admin-empty-lists.spec.ts',
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
    // Readiness is probed on `robots.txt`, as the stopped-database config does
    // and for the same reason: with no catalogue and no staff, `/` answers 500
    // on purpose — the public pages refuse an unseeded database rather than
    // print empty surfaces to a parent. Playwright reads a 5xx as "not up yet"
    // and would wait out its timeout against a server working as intended.
    // `robots.txt` reads no store, so it is 200 either way.
    url: `${LOCAL_DEV_SERVER.url}/robots.txt`,
    // Never reused: a server left running by the main suite has the seeded
    // lists, which is the opposite of what this config exists to arrange.
    reuseExistingServer: false,
    env: { ...DEV_SERVER_ENV, ...SUITE_ADMIN_ENV, E2E_EMPTY_LISTS: '1' },
  },
});
