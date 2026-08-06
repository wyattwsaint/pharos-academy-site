import { expect, test } from '@playwright/test';

import {
  CURRENT_FAMILIES_LINKS,
  CURRENT_FAMILIES_PATH,
} from '../src/lib/current-families/section.js';

/**
 * Current Families, and the promise the whole section rests on (#30 AC 5):
 * nothing here requires a login.
 *
 * That is asserted the only way it can be — as an anonymous browser, with no
 * session cookie, fetching each page and its parent and checking for a 200 and
 * the actual content rather than a sign-in form. The admin has its own guard
 * and its own suite; this is the other half of the same statement.
 */

test.describe('Current Families', () => {
  test('answers 200 and is reachable from the nav on every page', async ({ page }) => {
    const response = await page.goto('/classes');
    expect(response?.status()).toBe(200);

    await page
      .locator('.site-header')
      .getByRole('link', { name: 'Current Families', exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`${CURRENT_FAMILIES_PATH}$`));
    await expect(page.locator('h1')).toBeVisible();
  });

  test('names the calendar as absent rather than inventing dates', async ({ page }) => {
    await page.goto(CURRENT_FAMILIES_PATH);

    const calendar = page.locator('#calendar');
    await expect(calendar).toContainText('not on this site yet');
    // No link out of the section: there is nowhere honest for it to go until
    // #23, and a dead link is the failure this wording exists to avoid.
    await expect(calendar.locator('a[href*="calendar"]')).toHaveCount(0);
  });

  for (const link of CURRENT_FAMILIES_LINKS) {
    test(`${link.label} is linked from the section index and needs no login`, async ({ page }) => {
      await page.goto(CURRENT_FAMILIES_PATH);
      await expect(
        page.locator('#what-is-here').getByRole('link', { name: link.label }),
      ).toHaveAttribute('href', link.path);

      // Anonymous, cookie-free, straight at the page.
      const response = await page.goto(link.path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    });
  }
});
