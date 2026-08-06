import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CATALOGUE } from './courses/catalogue.js';
import { SUPPORT_PATH } from './about/story.js';
import {
  PUBLIC_ROUTES,
  absoluteUrl,
  onRequestPaths,
  publicPaths,
  renderSitemap,
  revalidatablePaths,
} from './routes.js';

const SITE = 'https://www.pharosacademy.net';
const PAGES_DIR = fileURLToPath(new URL('../pages', import.meta.url));

describe('the public route list', () => {
  it('contains the home page', () => {
    expect(publicPaths()).toContain('/');
  });

  it('has no duplicate paths', () => {
    const paths = publicPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('states every path root-relative, without a trailing slash', () => {
    for (const path of publicPaths()) {
      expect(path.startsWith('/')).toBe(true);
      if (path !== '/') expect(path.endsWith('/')).toBe(false);
    }
  });

  it('keeps every priority within the sitemap range', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.priority).toBeGreaterThanOrEqual(0);
      expect(route.priority).toBeLessThanOrEqual(1);
    }
  });

  // The whole point of one enumerated list is that it cannot drift from what
  // is actually built. A page file with no entry is a page the sitemap, the
  // revalidation sweep and any cache warm would all silently miss.
  it('accounts for every rendered page under src/pages', () => {
    const paths = new Set(publicPaths());
    for (const route of pageRoutes()) {
      if (route.includes('[')) {
        // A dynamic page is accounted for by the routes it actually renders —
        // `/classes/[slug]` by the nineteen class paths generated from the
        // catalogue. What must not happen is a dynamic page with *no*
        // enumerated route behind it, which is a whole page family missing
        // from the sitemap and from republishing.
        const pattern = new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+')}$`);
        expect(
          publicPaths().some((path) => pattern.test(path)),
          `src/pages has ${route} but no enumerated route matches it`,
        ).toBe(true);
        continue;
      }
      expect(paths, `src/pages has a page for ${route} that is not enumerated`).toContain(route);
    }
  });

  // The admin is not public and must never be revalidated, sitemapped or warmed
  // as though it were. Its pages are excluded from the walk above by path; this
  // asserts the exclusion is not silently hiding a real public page.
  it('enumerates an address for every class, and the three ways of listing them', () => {
    // The class pages are the links Jill sends when she means one class (#22),
    // so they belong in the sitemap and in whole-site republishing both.
    const paths = new Set(publicPaths());
    expect(paths).toContain('/classes');
    expect(paths).toContain('/classes/by-day');
    expect(paths).toContain('/classes/descriptions');
    for (const course of CATALOGUE) {
      expect(paths, course.title).toContain(`/classes/${course.slug}`);
    }
  });

  it('never enumerates an admin path', () => {
    for (const path of publicPaths()) {
      expect(path.startsWith('/admin')).toBe(false);
    }
  });
});

describe('how each route is delivered', () => {
  /*
   * ISR is the delivery model (#18 §1) and the exception has to earn itself.
   * `/about/support` is the one page that takes a POST — the volunteer form —
   * and a cache in front of it can hand one visitor's outcome to the next.
   */
  it('renders on request only where a page takes a POST', () => {
    expect(onRequestPaths()).toEqual([SUPPORT_PATH]);
  });

  // The sitemap still carries it: how a page is delivered is not whether it
  // should be found.
  it('keeps an on-request page in the sitemap all the same', () => {
    expect(publicPaths()).toContain(SUPPORT_PATH);
    expect(renderSitemap('https://example.org')).toContain(SUPPORT_PATH);
  });

  // …and whole-site republishing skips it, because there is no cached copy to
  // replace and the count Jill is shown should mean something.
  it('leaves an on-request page out of what republishing re-requests', () => {
    expect(revalidatablePaths()).not.toContain(SUPPORT_PATH);
    expect(revalidatablePaths().length).toBe(publicPaths().length - 1);
  });
});

describe('absoluteUrl', () => {
  it('joins the origin and the path', () => {
    expect(absoluteUrl(SITE, '/about')).toBe(`${SITE}/about`);
  });

  it('renders the root as exactly one trailing slash', () => {
    expect(absoluteUrl(SITE, '/')).toBe(`${SITE}/`);
    expect(absoluteUrl(`${SITE}/`, '/')).toBe(`${SITE}/`);
  });

  it('ignores a path already on the site URL', () => {
    expect(absoluteUrl(`${SITE}/ignored`, '/about')).toBe(`${SITE}/about`);
  });
});

describe('the sitemap', () => {
  it('is generated from the route list, not authored', () => {
    const xml = renderSitemap(SITE);
    for (const path of publicPaths()) {
      expect(xml).toContain(`<loc>${absoluteUrl(SITE, path)}</loc>`);
    }
    expect(countOccurrences(xml, '<url>')).toBe(PUBLIC_ROUTES.length);
  });

  it('is a well-formed urlset', () => {
    const xml = renderSitemap(SITE);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('escapes XML-significant characters in a URL', () => {
    const xml = renderSitemap(SITE, [
      { path: '/a&b', priority: 0.5, changefreq: 'weekly' },
    ]);
    expect(xml).toContain('<loc>https://www.pharosacademy.net/a&amp;b</loc>');
    expect(xml).not.toContain('/a&b<');
  });

  it('writes priority to one decimal place', () => {
    const xml = renderSitemap(SITE, [{ path: '/', priority: 1, changefreq: 'weekly' }]);
    expect(xml).toContain('<priority>1.0</priority>');
  });
});

/** Every route `src/pages` actually renders, derived from the filesystem. */
function pageRoutes(): string[] {
  const routes: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `src/pages/admin` is the admin, which is deliberately not a public
        // route: noindex, guarded, and absent from the sitemap by construction.
        if (entry !== 'admin') walk(full);
        continue;
      }
      // Endpoints (robots.txt.ts, sitemap.xml.ts) are not pages and are not
      // indexable content; only `.astro` files become routes we enumerate.
      if (!entry.endsWith('.astro')) continue;
      const rel = relative(PAGES_DIR, full).replaceAll('\\', '/').replace(/\.astro$/, '');
      routes.push(rel === 'index' ? '/' : `/${rel.replace(/\/index$/, '')}`);
    }
  };

  walk(PAGES_DIR);
  return routes;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
