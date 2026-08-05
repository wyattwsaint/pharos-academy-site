// @ts-check
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import { SITE_URL } from './src/lib/site.js';

// Public pages are ISR, not static and not SSR (spec #18 §1). Static puts a
// rebuild in front of every typo fix; plain SSR makes real parents absorb a
// Neon cold start on exactly the pages meant to sell the school. The
// `expiration` is the backstop for #18 §3's failure mode — a save that did not
// revalidate self-heals within the hour instead of looking, to Jill, exactly
// like an edit that vanished.
export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: vercel({
    isr: {
      expiration: 60 * 60,
    },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
