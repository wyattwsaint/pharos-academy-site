import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isLiveDestination, redirectConfig, redirectedPaths, REDIRECTS } from './redirects.js';
import { publicPaths } from './routes.js';

/**
 * The 301 map's own tests (#30).
 *
 * The failure this guards against is specific and quiet: a redirect whose
 * destination was renamed or never built. It answers 301 either way, so nothing
 * looks broken from the outside, and the crawler retires the old address on the
 * strength of a promise that ends in a 404. Every destination is therefore
 * checked against the enumerated route list rather than eyeballed.
 */
const MIRROR_README = readFileSync(
  fileURLToPath(new URL('../../docs/mirror/README.md', import.meta.url)),
  'utf8',
);

describe('the 301 map', () => {
  it('sends every old address somewhere this site actually renders', () => {
    for (const redirect of REDIRECTS) {
      expect(isLiveDestination(redirect.to), `${redirect.from} → ${redirect.to}`).toBe(true);
    }
  });

  it('redirects each old address exactly once', () => {
    const paths = redirectedPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });

  // A redirect from a path this site also renders would shadow the page: the
  // redirect wins and the page becomes unreachable.
  it('never redirects a path this site serves', () => {
    for (const path of redirectedPaths()) {
      expect(publicPaths(), path).not.toContain(path);
    }
  });

  it('only carries addresses the live Wix site actually published', () => {
    for (const path of redirectedPaths()) {
      expect(MIRROR_README, path).toContain(`\`${path}\``);
    }
  });

  it('says why, for every entry', () => {
    for (const redirect of REDIRECTS) {
      expect(redirect.because.length, redirect.from).toBeGreaterThan(20);
    }
  });

  it('is permanent, because none of these addresses is coming back', () => {
    const config = redirectConfig();
    expect(Object.keys(config)).toEqual(redirectedPaths());
    for (const entry of Object.values(config)) {
      expect(entry.status).toBe(301);
    }
  });
});
