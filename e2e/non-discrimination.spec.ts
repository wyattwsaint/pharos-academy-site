import { expect, test, type Page } from '@playwright/test';

import { STAFF_PATH } from '../src/lib/people/views.js';
import { NON_DISCRIMINATION_NOTICE } from '../src/lib/site.js';

/**
 * The notice of non-discrimination (#324).
 *
 * The wording is pinned in `site.test.ts`. What needs a browser is the half a
 * unit test cannot see: that the notice is actually *on* the page and actually
 * visible, at a size and a contrast a visitor would notice. The IRS
 * requirement is satisfied by the rendering, not by the string existing, so a
 * footer refactor that drops this block is a compliance failure — this is what
 * makes it a red test rather than a quiet one.
 *
 * Its own file rather than a block in `homepage.spec.ts`: the requirement names
 * the home page, but the answer to it is on every page, and half of what is
 * asserted here is asserted somewhere else.
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const notice = (page: Page) => page.locator('.site-footer-notice');

test.describe('the notice of non-discrimination', () => {
  test('renders in full on the home page, with no interaction', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    await expect(notice(page)).toBeVisible();
    await expect(notice(page).locator('h2')).toHaveText(NON_DISCRIMINATION_NOTICE.heading);
    // The whole paragraph, not a prefix of it: "reasonably expected to be
    // noticed" rules out a truncation with a "read more" behind it.
    await expect(notice(page).locator('p')).toHaveText(NON_DISCRIMINATION_NOTICE.body);
  });

  test('is set at the footer’s reading size, not in the small print', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const size = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    // Two claims, because clearing the copyright line by a tenth of a pixel
    // would satisfy the weaker one while failing the ticket. The footer's own
    // body size is the target; the copyright line is only the floor.
    const footer = await size(page.locator('footer.site-footer'));
    const body = await size(notice(page).locator('p'));
    expect(body).toBeGreaterThanOrEqual(footer);
    expect(body).toBeGreaterThan(await size(page.locator('footer .site-footer-copyright')));
  });

  test('is on every page, not only the one the IRS names', async ({ page }) => {
    await page.goto(STAFF_PATH);
    await expect(notice(page)).toBeVisible();
  });

  test('does not crowd the address and contact columns on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');

    await expect(notice(page)).toBeVisible();
    // The footer still reads as a footer: the columns are above the notice and
    // still on the page, and nothing has pushed the document sideways.
    await expect(page.locator('.site-footer-cols address')).toBeVisible();
    const columns = (await page.locator('.site-footer-cols').boundingBox())!;
    const block = (await notice(page).boundingBox())!;
    expect(block.y).toBeGreaterThan(columns.y);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
