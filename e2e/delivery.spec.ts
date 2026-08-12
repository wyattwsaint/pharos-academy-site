import { expect, test } from '@playwright/test';

import { INDEXABLE } from '../src/lib/site.js';

/**
 * The floor #19 exists to lay: the page is served, the three machine-readable
 * artefacts are served, and the sitemap agrees with the enumerated route list
 * rather than being authored beside it.
 */

test('serves robots.txt, advertising the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');

  const body = await response.text();
  expect(body).toContain('User-agent: *');
  expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
});

test('serves a sitemap listing the home page', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');

  const body = await response.text();
  expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  expect(body).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
});

test('serves llms.txt describing the school', async ({ request }) => {
  const response = await request.get('/llms.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');

  const body = await response.text();
  expect(body).toContain('# Pharos Academy');
  expect(body).toContain('## Pages');
});

// Pre-launch the real domain still pointed at the live Wix site; a placeholder
// competing with it in search results was worse than no placeholder. The
// comment here used to promise that this expectation would flip with
// `INDEXABLE` — it did not, so flipping the switch left the assertion behind
// and every branch red. It reads the switch now, so neither direction can be
// flipped without this agreeing.
test('crawls exactly as the launch switch says', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain(INDEXABLE ? 'Allow: /' : 'Disallow: /');

  // Only the closed direction is assertable here. Vercel stamps its own
  // `X-Robots-Tag: noindex` on every *preview* deployment, which is where this
  // suite runs in CI — so an absent header proves nothing and a present one
  // may be the platform's rather than the middleware's. `robots.txt` above is
  // the app's own answer either way.
  if (!INDEXABLE) {
    expect((await request.get('/')).headers()['x-robots-tag']).toContain('noindex');
  }
});

/**
 * The card, as a scraper actually finds it (#147).
 *
 * `social-preview.test.ts` pins the tag list; this pins that the list reaches
 * the rendered `<head>` of a real page, with the page's own title in it and an
 * image that is genuinely fetchable at the URL the tag gives. The unit test
 * cannot see either of those: a layout that dropped the tags, or a card
 * pointing at a 404, both pass it.
 *
 * About rather than the homepage, deliberately — the homepage would pass a
 * site-wide default, which is the failure this ticket names.
 */
test('previews a shared link with the page’s own title and a real image', async ({ page, request }) => {
  await page.goto('/about');

  const content = async (selector: string) => page.locator(selector).getAttribute('content');

  expect(await content('meta[property="og:title"]')).toBe('About — Pharos Academy');
  expect(await content('meta[property="og:title"]')).toBe(await page.title());
  expect(await content('meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(await content('meta[property="og:type"]')).toBe('website');
  expect(await content('meta[property="og:url"]')).toMatch(/^https?:\/\/[^/]+\/about$/);
  expect((await content('meta[property="og:description"]'))?.length).toBeGreaterThan(0);
  expect(await content('meta[property="og:description"]')).toBe(
    await content('meta[name="description"]'),
  );

  // Absolute in the tag — no scraper resolves a relative one — but fetched by
  // path, so this proves *this* deployment carries the file rather than proving
  // production still does.
  const image = await content('meta[property="og:image"]');
  expect(image).toMatch(/^https?:\/\//);
  const fetched = await request.get(new URL(image!).pathname);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()['content-type']).toContain('image/jpeg');
});

// The one part that does not follow the switch. The header is
// `admin.spec.ts`'s ("keeps the admin out of search results"); this is the
// courtesy line in `robots.txt`, which lives here with the rest of the file.
test('disallows the admin in robots.txt in either state', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /admin');
});
