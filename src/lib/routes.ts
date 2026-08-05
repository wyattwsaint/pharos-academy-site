/**
 * The enumerated public route list.
 *
 * Load-bearing in three places (spec #18 §3): whole-site revalidation, the
 * sitemap, and any future post-deploy cache warm. Anything publicly reachable
 * and worth indexing belongs here; nothing else is a legitimate second list.
 *
 * Routes that do not exist yet are simply absent — this list describes what is
 * built, not what is planned, so the sitemap can never advertise a 404.
 */

/** A publicly reachable, indexable page. */
export type PublicRoute = {
  /** Root-relative path, always leading-slash, never trailing-slash (except `/`). */
  path: string;
  /**
   * Relative priority hint for the sitemap, 0.0–1.0. The home page is 1.0;
   * everything else is a fraction of it.
   */
  priority: number;
  /** How often the page's content is expected to change. */
  changefreq: ChangeFreq;
};

export type ChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
] as const;

/** Every public path, in list order. */
export function publicPaths(): string[] {
  return PUBLIC_ROUTES.map((route) => route.path);
}

/**
 * Join `site` and a route path into an absolute URL.
 *
 * `site` may or may not carry a trailing slash; the result never has one
 * except for the origin root, which keeps exactly one.
 */
export function absoluteUrl(site: string | URL, path: string): string {
  const origin = new URL(site).origin;
  return path === '/' ? `${origin}/` : `${origin}${path}`;
}

/**
 * The sitemap XML for the enumerated route list.
 *
 * Generated rather than authored, so a route added to `PUBLIC_ROUTES` is in
 * the sitemap by construction and cannot drift out of it.
 */
export function renderSitemap(site: string | URL, routes = PUBLIC_ROUTES): string {
  const entries = routes
    .map((route) => {
      const loc = escapeXml(absoluteUrl(site, route.path));
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
