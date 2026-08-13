import { describe, expect, it } from 'vitest';

import { breadcrumbJsonLd, breadcrumbTrail } from './breadcrumbs.js';
import { NAV_ITEMS } from './home/sections.js';
import { publicPaths } from './routes.js';

/**
 * #151 AC 3 — a page below the top level says where it sits.
 *
 * The interesting test is the last one: every public route, walked, so a section
 * added without a nav label is caught here rather than in Search Console six
 * weeks later. The rest fix the shape a crawler actually reads.
 */
const SITE = 'https://example.org';

describe('the trail for a page', () => {
  it('runs from the home page down to the page itself', () => {
    expect(breadcrumbTrail('/current-families/calendar', 'Calendar')).toEqual([
      { path: '/', label: 'Home' },
      { path: '/current-families', label: 'Current Families' },
      { path: '/current-families/calendar', label: 'Calendar' },
    ]);
  });

  // The leaf is the page's own title — the same string that is the `<title>`, the
  // link-preview card and the heading eyebrow, so a renamed page renames its crumb.
  it('names the last crumb with the page’s own title', () => {
    const trail = breadcrumbTrail('/classes/algebra-1', 'Algebra 1');
    expect(trail?.at(-1)).toEqual({ path: '/classes/algebra-1', label: 'Algebra 1' });
    expect(trail?.at(-2)?.label).toBe('Classes');
  });

  /*
   * `/classes` is titled "Classes by age", because that page *is* the By Age view
   * and the title says which of the three it is. Its crumb must still read
   * "Classes", the same as it reads one level down on a class's own page: two
   * names for one URL is what a breadcrumb exists to resolve.
   */
  it('names a section the same whether it is the leaf or an ancestor', () => {
    expect(breadcrumbTrail('/classes', 'Classes by age')?.at(-1)?.label).toBe('Classes');
    expect(breadcrumbTrail('/classes/algebra-1', 'Algebra 1')?.at(-2)?.label).toBe('Classes');
  });

  it('gives a top-level page a trail of Home and itself', () => {
    expect(breadcrumbTrail('/admissions', 'Admissions')).toEqual([
      { path: '/', label: 'Home' },
      { path: '/admissions', label: 'Admissions' },
    ]);
  });

  // The home page *is* the top level. "Home" alone is a list of one that says
  // nothing, and Google drops a single-item list anyway.
  it('gives the home page no trail at all', () => {
    expect(breadcrumbTrail('/', 'Home')).toBeUndefined();
    expect(breadcrumbTrail('/?utm=x'.replace(/\?.*/, ''), 'Home')).toBeUndefined();
  });

  it('reads a trailing slash as the same page', () => {
    expect(breadcrumbTrail('/about/beliefs/', 'Statement of Faith')?.at(-1)?.path).toBe(
      '/about/beliefs',
    );
  });

  /*
   * Silence rather than a wrong hierarchy. A trail that skips a level asserts
   * something untrue about the site; a missing trail asserts nothing. The suite
   * below is what stops this becoming a quiet way to lose breadcrumbs.
   */
  it('publishes nothing rather than a trail with a level missing', () => {
    expect(breadcrumbTrail('/nowhere/at-all/deeper', 'Deeper')).toBeUndefined();
  });

  it('labels its sections the way the nav labels them', () => {
    for (const item of NAV_ITEMS) {
      const trail = breadcrumbTrail(`${item.href}/anything`, 'Anything');
      expect(trail?.at(-2), item.href).toEqual({ path: item.href, label: item.label });
    }
  });
});

describe('every public page', () => {
  it('carries a complete trail, or is the home page', () => {
    for (const path of publicPaths()) {
      const trail = breadcrumbTrail(path, 'The page');
      if (path === '/') {
        expect(trail).toBeUndefined();
        continue;
      }
      expect(trail, path).toBeDefined();
      // Contiguous: home first, the page last, and one crumb per level between.
      expect(trail?.at(0)?.path, path).toBe('/');
      expect(trail?.at(-1)?.path, path).toBe(path);
      expect(trail, path).toHaveLength(path.split('/').filter(Boolean).length + 1);
    }
  });
});

describe('the BreadcrumbList node', () => {
  const node = breadcrumbJsonLd('/current-families/policies', 'Policies', SITE) as Record<
    string,
    any
  >;

  it('numbers its items from one, in order, with absolute URLs', () => {
    expect(node['@type']).toBe('BreadcrumbList');
    expect(node.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Current Families',
        item: `${SITE}/current-families`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Policies',
        item: `${SITE}/current-families/policies`,
      },
    ]);
  });

  it('is identified by the page it describes', () => {
    expect(node['@id']).toBe(`${SITE}/current-families/policies#breadcrumbs`);
  });

  it('emits nothing for the home page', () => {
    expect(breadcrumbJsonLd('/', 'Home', SITE)).toBeUndefined();
  });
});
