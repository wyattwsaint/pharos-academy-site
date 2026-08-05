import { defineConfig, devices } from '@playwright/test';

import { bypassHeaders } from './e2e/protection.js';

/**
 * `PLAYWRIGHT_BASE_URL` points the suite at a real deployment — that is how CI
 * runs axe against the *deployed* page rather than a local approximation. With
 * it unset, Playwright starts a local dev server so the suite is runnable on a
 * laptop with no deployment in front of it.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const LOCAL_URL = 'http://localhost:4321';

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: baseURL
    ? undefined
    : {
        command: 'npm run dev -- --port 4321',
        url: LOCAL_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Astro 7 detects an agent environment and daemonises the dev server,
        // which makes Playwright see the command exit immediately and give up.
        // Blanking the detection variables keeps it in the foreground, so
        // Playwright owns its lifetime and shuts it down after the run.
        env: AGENT_ENV_BLANKED,
      },
});
