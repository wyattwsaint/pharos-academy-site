import { expect, test } from '@playwright/test';

import { BELIEFS_ARTICLES, BELIEFS_NOTES, BELIEFS_PATH } from '../src/lib/about/beliefs.js';
import { REDIRECTS } from '../src/lib/redirects.js';

/**
 * The Statement of Faith as a page, and the 301 map, over real HTTP (#30).
 *
 * The transcription itself is proved in `src/lib/about/beliefs.test.ts` against
 * the mirror — that is a provenance test and it needs no browser. What only a
 * request can show is that the doctrine actually reaches the page rather than
 * being rendered into a collapsed panel or lost in a template, and that every
 * old Wix address answers 301 and lands somewhere that answers 200.
 *
 * Zero axe violations at all five widths is `accessibility.spec.ts`'s, where
 * `/about/beliefs` is one line on the surface list.
 */

test.describe('the Statement of Faith', () => {
  test('is a web page, not a download', async ({ page }) => {
    const response = await page.goto(BELIEFS_PATH);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page.locator('h1')).toContainText('Statement of Faith');
  });

  test('prints all eleven articles in full', async ({ page }) => {
    await page.goto(BELIEFS_PATH);

    const articles = page.locator('.articles > li');
    await expect(articles).toHaveCount(BELIEFS_ARTICLES.length);

    // Every article, whole — not truncated, not summarised, not behind a
    // "read more". A family is asked to agree to this text before applying.
    for (const [index, article] of BELIEFS_ARTICLES.entries()) {
      await expect(articles.nth(index)).toHaveText(new RegExp(escapeRegExp(article)));
    }
  });

  test('carries the permissions the text is reproduced under', async ({ page }) => {
    await page.goto(BELIEFS_PATH);

    for (const note of BELIEFS_NOTES) {
      await expect(page.getByText(note.slice(0, 60), { exact: false })).toBeVisible();
    }
  });

  test('is linked from the footer, which is on every page', async ({ page }) => {
    await page.goto('/classes');

    const link = page.locator('.site-footer').getByRole('link', { name: 'Statement of Faith' });
    await expect(link).toHaveAttribute('href', BELIEFS_PATH);
  });
});

test.describe('the 301 map', () => {
  for (const redirect of REDIRECTS) {
    test(`${redirect.from} lands on ${redirect.to}`, async ({ page }) => {
      const response = await page.goto(redirect.from);

      // The landing page answers 200 — the point of the map is that no old
      // address 404s, and a 301 into a 404 satisfies only half of that.
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(redirect.to);

      // …and it got there permanently. A 302 leaves the old address in the
      // index competing with the new one.
      const hops = response?.request().redirectedFrom();
      expect(hops, `${redirect.from} was not redirected at all`).not.toBeNull();
      expect((await hops!.response())?.status()).toBe(301);
    });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
