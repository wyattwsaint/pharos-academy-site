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

  test('sends the calendar section to the calendar, and says what a subscription cannot promise', async ({
    page,
  }) => {
    await page.goto(CURRENT_FAMILIES_PATH);

    const calendar = page.locator('#calendar');
    // Until #23 this section said the dates were not here yet, and linked
    // nowhere, because the alternative was a dead link or invented dates.
    await expect(calendar.locator(`a[href="${CALENDAR_PATH}"]`).first()).toBeVisible();
    // The one thing no vendor controls and neither do we (#23).
    await expect(calendar).toContainText('own schedule');
  });

  // #298. Two things at once: WhatsApp is the channel, and it is a section of
  // its own rather than a sentence under the calendar — which is where the line
  // it replaced lived, and why that line drifted out of step with the school.
  test('says how the school reaches families, in a section of its own', async ({ page }) => {
    await page.goto(CURRENT_FAMILIES_PATH);

    const reaching = page.locator('#reaching-you');
    await expect(
      reaching.getByRole('heading', { name: 'How the School Reaches You', exact: true }),
    ).toBeVisible();
    await expect(reaching).toContainText('WhatsApp');
    // The invitation is the school's to send (#298).
    await expect(page.locator('a[href*="whatsapp"]')).toHaveCount(0);
  });

  // One channel for one event. Until #298 the calendar section promised a text
  // message, which is the reliable way for a parent to miss the announcement.
  test('names no second channel for a short-notice change', async ({ page }) => {
    await page.goto(CURRENT_FAMILIES_PATH);

    await expect(page.locator('#calendar')).toContainText('WhatsApp');
    await expect(page.locator('#calendar')).not.toContainText('text you');
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
