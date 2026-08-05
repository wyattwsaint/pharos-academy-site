import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PUBLIC_ROUTES, absoluteUrl, publicPaths, renderSitemap } from './routes.js';

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
      expect(paths, `src/pages has a page for ${route} that is not enumerated`).toContain(route);
    }
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
        walk(full);
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
