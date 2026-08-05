import { defineConfig, devices } from '@playwright/test';

import { bypassHeaders } from './e2e/protection.js';
import { SUITE_ADMIN } from './e2e/suite-admin.js';

/**
 * `PLAYWRIGHT_BASE_URL` points the suite at a real deployment — that is how CI
 * runs axe against the *deployed* page rather than a local approximation. With
 * it unset, Playwright starts a local dev server so the suite is runnable on a
 * laptop with no deployment in front of it.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const LOCAL_URL = 'http://localhost:4321';

/** What makes a dev server open a throwaway database with that account in it. */
export const SUITE_ADMIN_ENV = {
  E2E_ADMIN_USERNAME: SUITE_ADMIN.username,
  E2E_ADMIN_PASSWORD: SUITE_ADMIN.password,
};

/**
 * The environment variables `am-i-vibing` (via `astro dev`) reads to decide it
 * is being run by a coding agent. Blanked for the dev server only — the suite
 * has to behave the same whether a person or an agent started it.
 */
const AGENT_ENV_BLANKED = Object.fromEntries(
  [
    'AGENT',
    'AI_AGENT',
    'CLAUDECODE',
    'CODEX_THREAD_ID',
    'CURSOR_TRACE_ID',
    'GEMINI_CLI',
    'OPENCODE',
    'REPLIT_MODE',
    'TERM_PROGRAM',
  ].map((name) => [name, '']),
);

export const DEV_SERVER_ENV = { ...AGENT_ENV_BLANKED, ASTRO_DEV_TOOLBAR: 'off' };

export const LOCAL_DEV_SERVER = {
  command: 'npm run dev -- --port 4321',
  url: LOCAL_URL,
  timeout: 120_000,
} as const;

/**
 * The admin specs need a server this config started, because what they sign
 * into is the throwaway database that server opened. Against a deployment
 * (`PLAYWRIGHT_BASE_URL`) there is no such account and there must not be one —
 * so those specs do not run there, and the public axe suite does.
 */
export const local = !baseURL;

export default defineConfig({
  testDir: './e2e',
  // `*.test.ts` under `e2e/` belongs to vitest (see vitest.config.ts); Playwright
  // takes only the specs, so neither runner picks up the other's files.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: baseURL ?? LOCAL_URL,
    extraHTTPHeaders: bypassHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
    trace: 'on-first-retry',
  },
  projects: [
    {
      // The forced-failure spec needs a server configured to fail, so it runs
      // from its own config (`playwright.revalidation.config.ts`) rather than
      // here — Astro 7 allows only one dev server per project directory, so the
      // two cannot stand up side by side and run sequentially instead.
      name: 'public',
      testIgnore: '**/admin*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(local
      ? [
          {
            name: 'admin',
            testMatch: '**/admin.spec.ts',
            use: { ...devices['Desktop Chrome'], baseURL: LOCAL_URL },
          },
        ]
      : []),
  ],
  webServer: local
    ? {
        ...LOCAL_DEV_SERVER,
        reuseExistingServer: !process.env.CI,
        // Astro 7 detects an agent environment and daemonises the dev server,
        // which makes Playwright see the command exit immediately and give up.
        // Blanking the detection variables keeps it in the foreground, so
        // Playwright owns its lifetime and shuts it down after the run.
        env: { ...DEV_SERVER_ENV, ...SUITE_ADMIN_ENV },
      }
    : undefined,
});
