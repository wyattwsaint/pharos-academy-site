import { expect, test } from '@playwright/test';

/**
 * The structured data, as a browser and a crawler actually receive it (#30 AC 6).
 *
 * The node's shape is unit-tested; what only a request shows is that it is
 * emitted at all, that it parses as JSON after going through the template, and
 * that two pages describe the *same* school rather than two — which is what a
 * regenerated `@id` or a per-page node would silently do.
 */
const PAGES = ['/', '/about', '/admissions'];

test.describe('the school’s structured data', () => {
  for (const path of PAGES) {
    test(`${path} carries one parseable School node`, async ({ page }) => {
      await page.goto(path);

      const blocks = page.locator('script[type="application/ld+json"]');
      await expect(blocks).toHaveCount(1);

      const parsed = JSON.parse((await blocks.textContent()) ?? '');
      expect(parsed['@type']).toBe('School');
      // Read from the school details row, so what is asserted is that it is
      // populated rather than which value it holds.
      expect(String(parsed.telephone)).not.toHaveLength(0);
      expect(String(parsed.email)).toContain('@');
      expect(JSON.stringify(parsed.areaServed)).toContain('County');
    });
  }

  test('describes one school across pages, not one per page', async ({ page }) => {
    const ids: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      const text = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
      ids.push(JSON.parse(text)['@id']);
    }

    expect(new Set(ids).size).toBe(1);
  });
});
