import { expect, test } from '@playwright/test';

import { SUPPORT_PATH } from '../src/lib/about/story.js';
import { TEACH_PATH, TEACHER_CONTRACT } from '../src/lib/teach/teach.js';
import { INTERESTS } from '../src/lib/volunteer/volunteer.js';

/**
 * Giving, volunteering and teaching, over real HTTP (#30 AC 3).
 *
 * The volunteer form's rules are unit-tested in
 * `src/lib/volunteer/volunteer.test.ts`; what a browser adds is the thing that
 * actually breaks in production — a POST that reaches nothing, a validation
 * failure that loses what somebody typed, and above all a form that prints a
 * thank-you it cannot back up.
 *
 * The suite runs with no `RESEND_API_KEY`, so a valid submission here takes the
 * **no mailer** path. That is exactly the case worth asserting: the page must
 * say it did not send and hand back an address, and it must never say thank
 * you. A test environment that silently mails would be the worse setup.
 */

test.describe('the support page', () => {
  test('answers 200 and carries the school’s Give link', async ({ page }) => {
    const response = await page.goto(SUPPORT_PATH);

    expect(response?.status()).toBe(200);
    const give = page.locator('#giving').getByRole('link', { name: /Give to Pharos Academy/ });
    // Read from the school details row, so it is whatever the school set —
    // asserted as a real absolute URL rather than a specific one.
    await expect(give).toHaveAttribute('href', /^https?:\/\//);
  });

  test('offers all five areas the school asks for help in', async ({ page }) => {
    await page.goto(SUPPORT_PATH);

    for (const interest of INTERESTS) {
      await expect(page.locator(`input[name="interests"][value="${interest.id}"]`)).toBeAttached();
      await expect(page.locator('#volunteer')).toContainText(interest.label);
    }
  });

  test('refuses an incomplete submission and gives back what was typed', async ({ page }) => {
    await page.goto(SUPPORT_PATH);

    await page.fill('#volunteer-name', 'Ruth Marsh');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#volunteer-name')).toHaveValue('Ruth Marsh');
    await expect(page.locator('#volunteer-email-error')).toBeVisible();
    await expect(page.locator('#volunteer-interests-error')).toBeVisible();
  });

  test('never says a submission was sent when no mailer is configured', async ({ page }) => {
    await page.goto(SUPPORT_PATH);

    await page.fill('#volunteer-name', 'Ruth Marsh');
    await page.fill('#volunteer-email', 'ruth@example.com');
    await page.check('input[name="interests"][value="prayer-warriors"]');
    await page.click('button[type="submit"]');

    const outcome = page.locator('.notice');
    await expect(outcome).toBeVisible();
    await expect(outcome).toHaveAttribute('data-outcome', 'failed');
    await expect(outcome).not.toContainText('Thank you');
    // …and it says where to write instead, which is the whole point of failing
    // loudly rather than quietly.
    await expect(outcome).toContainText('@');
  });
});

test.describe('teaching here', () => {
  test('is linked from the footer rather than the nav', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.site-header').getByRole('link', { name: /Teach/ })).toHaveCount(0);
    await expect(
      page.locator('.site-footer').getByRole('link', { name: 'Teach at Pharos' }),
    ).toHaveAttribute('href', TEACH_PATH);
  });

  test('serves the contract as a real PDF', async ({ page, request }) => {
    await page.goto(TEACH_PATH);
    await expect(page.getByRole('link', { name: TEACHER_CONTRACT.label })).toHaveAttribute(
      'href',
      TEACHER_CONTRACT.path,
    );

    const response = await request.get(TEACHER_CONTRACT.path);
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
