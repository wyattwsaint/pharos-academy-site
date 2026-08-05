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
  },
});
