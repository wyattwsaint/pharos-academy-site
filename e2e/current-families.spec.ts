import { expect, test } from '@playwright/test';

import {
  CALENDAR_PATH,
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

  test('introduces the calendar once, and says what a subscription cannot promise', async ({
    page,
  }) => {
    await page.goto(CURRENT_FAMILIES_PATH);

    // #179: one card, where there used to be a card and a band under it saying
    // the same thing. The band is gone; what it alone said is not.
    const cards = page.locator('#what-is-here');
    // Until #23 the calendar was named and deliberately not linked, because the
    // alternative was a dead link or invented dates.
    await expect(cards.locator(`a[href="${CALENDAR_PATH}"]`).first()).toBeVisible();
    // The one thing no vendor controls and neither do we (#23).
    await expect(cards).toContainText('own schedule');

    // The duplicate is what #179 removed: the page names the calendar once.
    await expect(page.locator('#calendar')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'The calendar' })).toHaveCount(1);
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
