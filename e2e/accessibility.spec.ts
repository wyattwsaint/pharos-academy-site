import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * WCAG 2.2 AA is a hard target (spec #18 §"Accessibility"), and the acceptance
 * criteria are inherited from the prototype's own audit: zero axe violations
 * and no horizontal overflow at each of these widths. The prototype achieved
 * it; the build is not allowed to regress it.
 */
const WIDTHS = [390, 768, 834, 1024, 1440];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the home page', () => {
  for (const width of WIDTHS) {
    test(`has zero axe violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

      expect(violations.map(describeViolation)).toEqual([]);
    });

    test(`does not overflow horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  test('sets the school as the single h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Pharos Academy');
  });
});

/** A violation rendered so a CI failure names the rule and the element. */
function describeViolation(violation: {
  id: string;
  impact?: string | null;
  nodes: { target: unknown[] }[];
}) {
  return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
    .map((node) => node.target.join(' '))
    .join(', ')}`;
}
