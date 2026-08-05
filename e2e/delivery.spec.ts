import { expect, test } from '@playwright/test';

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

// Pre-launch the real domain still points at the live Wix site; a placeholder
// competing with it in search results is worse than no placeholder. When
// `INDEXABLE` flips at launch, this expectation flips with it.
test('is not indexable before launch', async ({ request }) => {
  const page = await request.get('/');
  expect(page.headers()['x-robots-tag']).toContain('noindex');

  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
});
