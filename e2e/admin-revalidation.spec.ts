import { expect, test } from '@playwright/test';

import { signIn } from './suite-admin.js';

/**
 * The failure #20 asks to be verified by forcing it.
 *
 * > a retryable message when revalidation fails (verify by forcing a failure)
 *
 * This project's server is started with `REVALIDATE_ORIGIN` pointed at a port
 * nothing is listening on (`playwright.config.ts`), so the save writes and the
 * revalidation genuinely cannot reach anything. No mock, no fault-injection
 * hook in the app — the connection really is refused.
 *
 * The distinction being defended is the one that matters most to whether Jill
 * keeps trusting the admin: a save that did not reach the live site must not
 * look like a save that did, and must not look like an edit that vanished
 * either.
 */
test.describe('when the live site cannot be reached', () => {
  // There is one school-details row and every test here saves it. A save posts
  // the whole form, so in parallel these tests overwrite each other's fields —
  // serial is what makes each assertion about its own edit.
  test.describe.configure({ mode: 'serial' });

  test('says the edit is saved but not yet live, and offers Retry', async ({ page }) => {
    await signIn(page);

    await page.getByLabel('Phone').fill('717-497-4321');
    await page.getByRole('button', { name: 'Save' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'false');
    await expect(banner).toContainText("Saved, but the live site hasn't updated yet");

    // Retry, not "try again later": the recovery is a button, on the banner.
    await expect(banner.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('kept the edit — "not live yet" never means "not saved"', async ({ page }) => {
    await signIn(page);

    await page.getByLabel('Email').fill('office@pharosacademy.net');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');

    await page.goto('/admin/school-details');
    await expect(page.getByLabel('Email')).toHaveValue('office@pharosacademy.net');
  });

  test('Retry reports the same failure rather than quietly succeeding', async ({ page }) => {
    await signIn(page);

    await page.getByLabel('Phone').fill('717-497-5678');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Retry' }).click();

    // Carried in the URL so a refresh does not silently re-fire the republish.
    await expect(page).toHaveURL(/\/admin\/school-details\?republished=stale$/);
    await expect(page.getByTestId('save-banner')).toContainText("didn't reach the live site");
  });
});
