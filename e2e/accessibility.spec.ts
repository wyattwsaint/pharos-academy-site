import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.2 AA is a hard target (spec #18 §"Accessibility"), and the acceptance
 * criteria are inherited from the prototype's own audit: zero axe violations
 * and no horizontal overflow at each of these widths. The prototype achieved
 * it; the build is not allowed to regress it.
 *
 * Both are checked twice — once with the page as it loads, and once with a
 * H.O.P.E. card open (#21 AC 1). The open state is the one that can actually
 * fail: the card is a light panel on the navy band, it floats over its
 * neighbours on desktop, and below 620px it spans two columns and is anchored
 * to its own side of the row. That last arrangement is precisely how a panel
 * ends up hanging off the viewport, so it is measured rather than assumed.
 */
const WIDTHS = [390, 768, 834, 1024, 1440];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Open the first H.O.P.E. card and leave it stuck open. */
async function openHopeCard(page: Page) {
  const cell = page.locator('[data-disclosure-group="hope"] [data-disclosure-cell]').first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

/** Open the first class description, which expands inside its own grid cell. */
async function openClassPanel(page: Page) {
  const cell = page.locator('[data-disclosure-group="classes"] [data-disclosure-cell]').first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

const STATES = [
  { name: 'closed', open: async (_page: Page) => {} },
  { name: 'with a H.O.P.E. card open', open: openHopeCard },
  { name: 'with a class description open', open: openClassPanel },
];

test.describe('the home page', () => {
  for (const width of WIDTHS) {
    for (const state of STATES) {
      test(`has zero axe violations at ${width}px, ${state.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await state.open(page);

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        expect(violations.map(describeViolation)).toEqual([]);
      });

      test(`does not overflow horizontally at ${width}px, ${state.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await state.open(page);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      });
    }
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
