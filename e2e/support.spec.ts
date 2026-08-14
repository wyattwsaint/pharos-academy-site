import { expect, test } from '@playwright/test';

import { SUPPORT_PATH } from '../src/lib/about/story.js';
import { SEEDED_SCHOOL_DETAILS } from '../src/lib/db/migrations.js';
import { PEOPLE } from '../src/lib/people/person.js';
import { leadershipContact, TEACH_PATH, TEACHER_CONTRACT } from '../src/lib/teach/teach.js';
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
 * The local suite runs with no mail credentials, so a valid submission there
 * takes the **no mailer** path. That is exactly the case worth asserting: the
 * page must say it did not send and hand back an address, and it must never say
 * thank you. A test environment that silently mails would be the worse setup.
 */

/**
 * Whether this run is allowed to submit anything — the rule
 * `inquiry.spec.ts` and `application.spec.ts` already carry, and the one this
 * file was missing.
 *
 * `PLAYWRIGHT_BASE_URL` points the suite at a real deployment, and
 * `deployed-accessibility.yml` sets it for **production** as well as for
 * previews. A deployment has a mailer, so a valid submission there is a real
 * volunteer email to the school about somebody who does not exist — and the
 * no-mailer sentence this file asserts is one the deployment cannot produce, so
 * the test was failing every merge for saying the truth about the wrong server.
 *
 * A *refused* submission mails nothing and stores nothing, so it keeps running
 * against the deployment, where it is worth far more.
 */
const MAY_SUBMIT = !process.env.PLAYWRIGHT_BASE_URL;

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
    test.skip(!MAY_SUBMIT, 'a real send emails the school about a volunteer who does not exist');
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

  // The page names the Head of School rather than talking about itself (#105).
  // Both halves are read off the seeded database rather than typed here, so
  // this asserts the sentence the page renders, not a second copy of it.
  test('says who to write to, and no longer describes its own place in the site', async ({
    page,
  }) => {
    const head = leadershipContact(PEOPLE);
    const email = SEEDED_SCHOOL_DETAILS.email;
    await page.goto(TEACH_PATH);

    const contact = page.locator('[data-section="teach-contact"]');
    await expect(contact).toContainText(`our ${head?.role}, ${head?.name}, at ${email}`);
    await expect(contact.getByRole('link', { name: email })).toHaveAttribute(
      'href',
      `mailto:${email}`,
    );
    await expect(page.locator('main')).not.toContainText('This page is at');
  });
});
