import { expect, test } from '@playwright/test';

import { APPLICATION_PATH } from '../src/lib/application/application.js';

/**
 * The Admissions page, as a family reads it (#29 AC 6).
 *
 * What is asserted here is the *shape* of the page rather than the value of any
 * fee. The admin suite runs against the same database and moves those numbers
 * around on purpose, so a spec pinned to "$100" would be a spec that fails for
 * a reason that has nothing to do with this page. That the figures follow the
 * settings is proved where it can be proved without a race — in
 * `src/lib/admissions/admissions.test.ts`, and end to end in the money spec,
 * which owns the row it is changing.
 *
 * The axe and overflow measurements are in `accessibility.spec.ts`, at all five
 * widths, along with every other public surface.
 */

test.describe('the admissions page', () => {
  test('answers a family’s questions in the order they ask them', async ({ page }) => {
    await page.goto('/admissions');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Applying Works');

    // Five bands since #107 retired "What applying involves", plus the header
    // and the closing one.
    await expect(page.locator('section[data-section]')).toHaveCount(6);

    for (const heading of [
      'Families We Serve',
      'What Makes Us Different',
      'Prices for Partner Families',
      'Is Pharos the Right Fit for your Family?',
      'Become a Pharos Family',
    ]) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('marks the H.O.P.E. expansion as emphasis rather than as bold type', async ({ page }) => {
    await page.goto('/admissions');

    // The client marked the phrase, so a screen reader has to hear it marked
    // too — `<strong>`, not a class that only paints (#107 AC 3).
    await expect(
      page.locator('#different strong', { hasText: 'Helping Our Parents Educate' }),
    ).toBeVisible();
  });

  test('quotes every fee as a real figure rather than a gap', async ({ page }) => {
    await page.goto('/admissions');

    const amounts = page.locator('#cost .costs b');
    await expect(amounts).toHaveCount(3);
    for (const amount of await amounts.allTextContents()) {
      expect(amount).toMatch(/^\$\d+$/);
    }
  });

  test('names no payment dates, which the school asked for in #108', async ({ page }) => {
    await page.goto('/admissions');

    // The dates went off the page entirely rather than moving to Apply, so the
    // assertion is their absence: no long-form date, and no sentence around it.
    const cost = await page.locator('#cost').textContent();
    expect(cost).not.toContain('quarterly payments');
    expect(cost?.match(/\d{1,2} [A-Z][a-z]+ \d{4}/g) ?? []).toHaveLength(0);
  });

  test('keeps the school’s policies reachable from the agreements section', async ({ page }) => {
    await page.goto('/admissions');

    await page.locator('#documents').getByRole('link', { name: 'All of our policies' }).click();

    await expect(page).toHaveURL(/\/current-families\/policies$/);
  });

  test('links the documents a family signs to the documents themselves', async ({ page }) => {
    await page.goto('/admissions');

    const links = page.locator('#documents .signed a');
    await expect(links.first()).toBeVisible();
    for (const href of await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href')),
    )) {
      expect(href).toMatch(/^\/policies\//);
    }
  });

  test('ends in a Start your application button that goes somewhere', async ({ page }) => {
    await page.goto('/admissions');

    const start = page.getByRole('link', { name: 'Start your application' });
    await expect(start).toBeVisible();

    // It is the last thing on the page, which is the point of the page.
    const startSection = page.locator('section[data-section]').last();
    await expect(startSection).toHaveAttribute('data-section', 'admissions-start');
    await expect(startSection.getByRole('link', { name: 'Start your application' })).toBeVisible();

    // Until #31 this landed on `/#inquiry`, because the application flow did
    // not exist yet and a conversation was where it began. #31 built the flow,
    // so the button now reaches the application itself.
    await start.click();
    await expect(page).toHaveURL(new RegExp(`${APPLICATION_PATH}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('is reachable from the header on every page', async ({ page }) => {
    await page.goto('/classes');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admissions' }).click();

    await expect(page).toHaveURL(/\/admissions$/);
  });

  test('is in the sitemap and in llms.txt', async ({ request }) => {
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/admissions');
    expect(await (await request.get('/llms.txt')).text()).toContain('/admissions');
  });
});
