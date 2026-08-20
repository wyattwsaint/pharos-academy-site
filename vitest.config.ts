import { defineConfig } from 'vitest/config';

// vitest covers the pure modules — the site's own, plus the pure helpers the
// browser suite leans on. Anything that needs a browser is Playwright's job
// (`npm run test:e2e`), which is why the split is by filename: `*.test.ts` is
// vitest's, `*.spec.ts` is Playwright's, and neither runner claims the other's.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'prototypes/**'],
    environment: 'node',
    // Each database-backed file spins up its own throwaway Postgres in
    // `beforeEach`, and pglite's start is the slow part. Vitest's 10s default
    // is enough for one file and not for a machine running the whole suite at
    // once: the pre-commit gate failed a different eight to fifty tests every
    // run, all of them the same "Hook timed out" on `createEphemeralDatabase`,
    // and all of them green when run with fewer workers. A gate that fails at
    // random teaches the office to bypass it.
    hookTimeout: 30_000,
  },
});
