import { NAV_ITEMS } from './home/sections.js';
import { absoluteUrl } from './routes.js';

/**
 * Where a page sits, said in the markup (#151).
 *
 * The site's nav is four items wide and two levels deep, and the second level is
 * where nearly everything lives: the Statement of Faith is under About, the
 * calendar and the policies are under Current Families, every class is under
 * Classes. A crawler that cannot see that shows all of them as siblings of
 * the homepage, which is how a search result for the handbook arrives with no
 * indication that it belongs to the school's Current Families section at all.
 *
 * **The trail is derived from the address, not authored.** A page's real position
 * is the path it is served at, so that is what this reads; the alternative is a
 * hand-kept trail per page, which is the same class of second copy as the typed
 * address the school details row exists to prevent. The page's own `title` — the
 * one string that is already the `<title>`, the link-preview card and the
 * heading eyebrow — is the last crumb, so a renamed page renames its own crumb.
 *
 * Labels for the levels *above* the leaf come from `NAV_ITEMS`, which is the
 * list a visitor is actually shown. A crumb reading something other than the nav
 * item a family clicked would be a third name for the same section.
 */

/**
 * The label for a section path, as the nav shows it, plus the root.
 *
 * "Home" is the school's front door and is not a nav item — the brand mark is
 * the link, and it has no text. It is named here because a breadcrumb whose
 * first crumb is unnamed is a breadcrumb Google drops entirely.
 */
const SECTION_LABELS: Record<string, string> = {
  '/': 'Home',
  ...Object.fromEntries(NAV_ITEMS.map((item) => [item.href, item.label])),
};

/** One crumb: what it is called, and the page it points at. */
export type Crumb = { path: string; label: string };

/**
 * The trail for a path, ending at the page itself — or none.
 *
 * `undefined` in two cases, both deliberate. The homepage has no trail: it *is*
 * the top level, and `Home` alone is a list of one that says nothing. And a page
 * whose section has no label gets **no trail rather than a partial one**: a
 * breadcrumb that skips a level is a wrong statement about the hierarchy, where
 * a missing breadcrumb is merely silence. `breadcrumbs.test.ts` walks every
 * public route and fails if any of them is silent, so a new section added
 * without a nav item is caught there rather than discovered in Search Console.
 */
export function breadcrumbTrail(pathname: string, title: string): Crumb[] | undefined {
  const path = canonicalPath(pathname);
  if (path === '/') return undefined;

  const segments = path.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ path: '/', label: 'Home' }];

  // Every level above the leaf, in order, each named as the nav names it.
  for (let depth = 1; depth < segments.length; depth += 1) {
    const ancestor = `/${segments.slice(0, depth).join('/')}`;
    const label = SECTION_LABELS[ancestor];
    if (!label) return undefined;
    crumbs.push({ path: ancestor, label });
  }

  /*
   * The page's own crumb — the nav's word for it where the nav has one.
   *
   * `/classes` is titled "Classes by age", because that page *is* the By Age view
   * and the title says which of the three it is. As a crumb it must read
   * "Classes", the same as it reads one level down on a class's own page: two
   * names for one URL is precisely the drift a breadcrumb exists to resolve.
   */
  crumbs.push({ path, label: SECTION_LABELS[path] ?? title });
  return crumbs;
}

/** One trailing slash, gone. `/about/` and `/about` are the same page and one URL. */
function canonicalPath(pathname: string): string {
  return pathname.replace(/(?!^)\/+$/, '');
}

/**
 * The `BreadcrumbList` node, or nothing at all.
 *
 * Positions are 1-based and contiguous, which is the whole of what makes the
 * list machine-readable: `ListItem` order is carried by `position` and not by
 * array order, so a gap is a hierarchy a crawler reads differently from the one
 * the site has.
 *
 * The last crumb carries a URL like every other. It may name the page it is on,
 * which some guides discourage; it is here because the alternative — a final
 * crumb with a name and no `item` — is the shape most likely to be reported as
 * an error, and a self-referential URL that matches the canonical is not
 * ambiguous.
 */
export function breadcrumbJsonLd(pathname: string, title: string, site: string | URL) {
  const trail = breadcrumbTrail(pathname, title);
  if (!trail) return undefined;

  return {
    '@type': 'BreadcrumbList',
    // The page's own URL, which the trail already ends at rather than a second
    // normalisation of the same path.
    '@id': `${absoluteUrl(site, trail[trail.length - 1]!.path)}#breadcrumbs`,
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(site, crumb.path),
    })),
  };
}
