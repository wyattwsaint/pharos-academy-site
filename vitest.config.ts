import { defineConfig } from 'vitest/config';

// vitest covers the pure modules; anything that needs a browser is Playwright's
// job (`npm run test:e2e`), so `e2e/` is excluded here rather than being run
// twice under the wrong runner.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'prototypes/**'],
    environment: 'node',
  },
});
