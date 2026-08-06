import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  isLiveDestination,
  redirectConfig,
  redirectedPaths,
  REDIRECTS,
  STILL_OWED,
} from './redirects.js';
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

  // A fragment is allowed and a query string is not: the first lands somebody
  // on the section their old bookmark was about, the second would be a route
  // that quietly does not exist.
  it('accepts a destination’s fragment but still checks the page under it', () => {
    expect(isLiveDestination('/about#location')).toBe(true);
    expect(isLiveDestination('/nowhere#location')).toBe(false);
    expect(isLiveDestination('/about?tab=location')).toBe(false);
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

  it('only carries Wix addresses the live site actually published', () => {
    for (const redirect of REDIRECTS.filter((entry) => entry.origin === 'wix')) {
      expect(MIRROR_README, redirect.from).toContain(`\`${redirect.from}\``);
    }
  });

  // The other kind: an address this build shipped and then moved when #9's
  // tree was applied. It cannot be in the mirror, and asserting that is what
  // stops the escape hatch being used to smuggle in a Wix path nobody checked.
  it('marks a moved address of our own as ours, and it is one', () => {
    const ours = REDIRECTS.filter((entry) => entry.origin === 'this-site');
    expect(ours.length).toBeGreaterThan(0);
    for (const redirect of ours) {
      expect(MIRROR_README, redirect.from).not.toContain(`\`${redirect.from}\``);
    }
  });

  /*
   * #30 AC 4, read straight off the mirror's own table rather than off a list
   * somebody kept in step with it.
   *
   * The table is the record of what the Wix site published — nineteen numbered
   * rows — and every one of them has to end somewhere that renders: either this
   * site serves the same path, or the map redirects it. A row that is neither
   * is an address that 404s the day the DNS moves, and that is the whole
   * failure this ticket exists to prevent.
   */
  it('leaves none of the nineteen published URLs without a home', () => {
    const served = new Set(publicPaths());
    const redirected = new Set(redirectedPaths());
    const owed = new Set(STILL_OWED);

    expect(publishedUrls()).toHaveLength(19);
    for (const path of publishedUrls()) {
      if (owed.has(path)) continue;
      expect(served.has(path) || redirected.has(path), `${path} goes nowhere`).toBe(true);
    }
  });

  // The escape hatch, kept honest two ways: an owed address has to be one the
  // Wix site really published, and it must not already have a home — an entry
  // left behind after its page was built would hide the next real gap.
  it('owes only published addresses, and only ones that really have nowhere to go', () => {
    const published = new Set(publishedUrls());
    const homed = new Set([...publicPaths(), ...redirectedPaths()]);
    for (const path of STILL_OWED) {
      expect(published.has(path), `${path} was never published`).toBe(true);
      expect(homed.has(path), `${path} has a home and is still listed as owed`).toBe(false);
    }
  });

  /** The nineteen, read off the mirror's own numbered table. */
  function publishedUrls(): string[] {
    return [...MIRROR_README.matchAll(/^\| \d+ \| `([^`]+)` \|/gm)].map((match) => match[1]!);
  }

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
