import { SUPPORT_PATH } from './about/story.js';
import { NEWS_PATH } from './announcements/views.js';
import { CALENDAR_PATH } from './calendar/views.js';
import { CATALOGUE } from './courses/catalogue.js';
import { classPath, CLASS_VIEWS } from './courses/views.js';
import { CURRENT_FAMILIES_PATH } from './current-families/section.js';
import { STAFF_PATH } from './people/views.js';
import { POLICIES_PATH } from './policies/views.js';
import { TEACH_PATH } from './teach/teach.js';

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
  /**
   * How the page is delivered.
   *
   * `isr` for all but one of them, which is the whole delivery model (#18 §1).
   * `on-request` is for a page that takes a POST: the volunteer form's answer
   * belongs to one submission, and a cache in front of it is a cache that can
   * hand one visitor's outcome to the next. Three things read this — the
   * adapter's ISR `exclude` list, the build-output assertion, and whole-site
   * republishing, which has nothing to revalidate on a page that renders every
   * time.
   */
  delivery?: 'isr' | 'on-request';
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
  ...CLASS_VIEWS.map((view) => ({
    path: view.path,
    priority: view.id === 'by-age' ? 0.9 : 0.8,
    changefreq: 'monthly' as const,
  })),
  /*
   * One route per class, generated from the catalogue rather than listed.
   *
   * These are the addresses Jill sends when she means one class, so they have
   * to be in the sitemap and in whole-site republishing both. Generated from
   * the same constant the store is seeded from, because a hand-kept second list
   * of nineteen slugs would be a sitemap advertising a 404 within a term.
   */
  ...CATALOGUE.map((course) => ({
    path: classPath(course.slug),
    priority: 0.7,
    changefreq: 'monthly' as const,
  })),
  /*
   * The people of the school (#26).
   *
   * Here rather than only in the sitemap because this list is what whole-site
   * republishing walks: an instructor renamed in the admin has to reach the
   * staff page as well as the class pages that print the same name, and a
   * surface missing from this list is a surface that keeps the old name until
   * the hour's ISR expiry catches it.
   */
  { path: STAFF_PATH, priority: 0.6, changefreq: 'monthly' },
  /*
   * The news page (#27).
   *
   * Weekly, because it is the one page whose content changes on its own: an
   * announcement crossing six weeks changes the homepage without anybody
   * editing anything.
   *
   * The attached PDFs are deliberately **not** in this list. It is a build-time
   * constant and an attachment is a database row uploaded after the build, so
   * enumerating them here is not possible — the route that serves them renders
   * on request and revalidates on its own ETag instead.
   */
  { path: NEWS_PATH, priority: 0.6, changefreq: 'weekly' },
  /*
   * The policies page (#28).
   *
   * Monthly, because a policy changes when the school revises a document rather
   * than on any schedule. Here rather than only in the sitemap because this is
   * the list whole-site republishing walks, and a replaced PDF changes the
   * updated date printed on this page — a save that reached the file but not
   * the page would leave a parent reading last term's date beside this term's
   * document.
   *
   * The PDFs themselves are deliberately **not** in this list, for the same
   * reason an announcement's attachment is not: they are database rows uploaded
   * after the build, and the routes that serve them render on request.
   */
  { path: POLICIES_PATH, priority: 0.6, changefreq: 'monthly' },
  /*
   * How applying works (#29).
   *
   * The second-highest priority on the site, under the home page and above the
   * catalogue views: it is the page a parent who has decided reads, and the one
   * a search for "how do I apply to Pharos Academy" should land on.
   *
   * In this list rather than only in the sitemap for the usual reason, and a
   * sharper one than most: every fee on it is read from the money settings, so
   * a deposit changed in the admin has to reach this page in the same
   * republish that reaches the homepage. Two pages quoting different deposits
   * for an hour is precisely the failure #29 exists to prevent.
   */
  { path: '/admissions', priority: 0.9, changefreq: 'monthly' },
  /*
   * About (#30).
   *
   * High priority because it is the page three of the old site's addresses now
   * point at, and because "classical Christian school near Harrisburg" is a
   * category search — the page that answers it is the one that says what the
   * school is, not the one that lists classes.
   *
   * In this list rather than only in the sitemap for a reason that is not
   * cosmetic: the mission and vision printed here are read from the school
   * details row, so an edit in the admin has to reach this page in the same
   * republish that reaches the homepage and the footer.
   */
  { path: '/about', priority: 0.8, changefreq: 'monthly' },
  /*
   * Current Families — the section index (#30).
   *
   * Low priority and rarely changing: it is a signpost, and the pages under it
   * are the ones worth landing on. It is enumerated all the same because it is
   * a nav item, and because the thing it says about the calendar will stop
   * being true when #23 lands.
   */
  { path: CURRENT_FAMILIES_PATH, priority: 0.4, changefreq: 'yearly' },
  /*
   * The calendar (#23).
   *
   * `yearly`, because that is genuinely how often it changes: Jill types the
   * year once a summer and the 112 dates follow from it. It is enumerated for
   * the usual reason and a sharp one — every date on it is computed from the
   * school year row, so a corrected closure has to reach this page in the same
   * republish that reaches everything else, rather than an hour later.
   *
   * `/calendar.ics` is deliberately **not** in this list. It is a subscription
   * rather than a page: nothing links to it as a document, a search engine has
   * no use for it, and it renders on request because the year behind it is a
   * row Jill can change.
   */
  { path: CALENDAR_PATH, priority: 0.5, changefreq: 'yearly' },
  /*
   * Giving and volunteering (#30).
   *
   * Enumerated like any other page, and it is the one public route that is not
   * ISR — it renders on request because the volunteer form posts to it. It is
   * still in this list: the sitemap should carry it, and the Give link on it is
   * read from the school details row, so a changed `giveUrl` has to reach it in
   * the same republish as everywhere else.
   */
  { path: SUPPORT_PATH, priority: 0.5, changefreq: 'monthly', delivery: 'on-request' },
  /*
   * Teaching here (#30).
   *
   * Low priority and off the nav — the audience is a handful of people a year,
   * not a family — but enumerated all the same, because the email address on it
   * is read from the school details row and a changed address has to reach it.
   */
  { path: TEACH_PATH, priority: 0.3, changefreq: 'yearly' },
  /*
   * The Statement of Faith (#30).
   *
   * `yearly` because it changes when the school board changes it, which is a
   * board decision rather than an edit — and it is not in the editable set at
   * all, so no admin save can move it. It is enumerated all the same: it is one
   * of the two pages the homepage and the footer both link, the 301 from the
   * Wix `/statement-of-faith` lands on it, and a family who has been told to
   * read it before applying is a family who will search for it.
   */
  { path: '/about/beliefs', priority: 0.7, changefreq: 'yearly' },
] as const;

/** Every public path, in list order. */
export function publicPaths(): string[] {
  return PUBLIC_ROUTES.map((route) => route.path);
}

/**
 * The paths whole-site republishing should actually re-request.
 *
 * A page that renders on every request has no cached copy to replace, so asking
 * the CDN to revalidate it is a request that costs a Neon round trip and
 * changes nothing — and it would be reported to Jill as part of "republished
 * 32 pages", which is a number that should mean something.
 */
export function revalidatablePaths(): string[] {
  return PUBLIC_ROUTES.filter((route) => route.delivery !== 'on-request').map(
    (route) => route.path,
  );
}

/** The paths that must never be served from the ISR cache. */
export function onRequestPaths(): string[] {
  return PUBLIC_ROUTES.filter((route) => route.delivery === 'on-request').map(
    (route) => route.path,
  );
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
