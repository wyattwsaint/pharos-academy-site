import { expect, test } from '@playwright/test';

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

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How applying works');

    await expect(page.locator('section[data-section]')).toHaveCount(7);

    for (const heading of [
      'Who it is for',
      'The mornings',
      'What applying involves',
      'What it costs to apply',
      'What you sign',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('quotes every fee as a real figure rather than a gap', async ({ page }) => {
    await page.goto('/admissions');

    const amounts = page.locator('#cost .costs b');
    await expect(amounts).toHaveCount(3);
    for (const amount of await amounts.allTextContents()) {
      expect(amount).toMatch(/^\$\d+$/);
    }
  });

  test('names the four quarterly payment dates', async ({ page }) => {
    await page.goto('/admissions');

    const sentence = await page.locator('#cost').textContent();
    expect(sentence).toContain('four quarterly payments');
    // Four real dates, in the school's own long form.
    expect(sentence?.match(/\d{1,2} [A-Z][a-z]+ \d{4}/g) ?? []).toHaveLength(4);
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

    // And it does not lead to a 404 while the application flow is still a
    // later ticket — today it is the conversation that flow begins from.
    await start.click();
    await expect(page).toHaveURL(/\/#inquiry$/);
    await expect(page.locator('#inquiry')).toBeVisible();
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
