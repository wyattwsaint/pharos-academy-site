import { expect, test } from '@playwright/test';

import { BELIEFS_PATH } from '../src/lib/about/beliefs.js';
import { ABOUT_PATH, CORE_VALUES, METHOD, PHAROS_MEANING } from '../src/lib/about/story.js';

/**
 * About, over real HTTP (#30).
 *
 * The transcription is proved against the mirror in
 * `src/lib/about/story.test.ts`; what only a request can show is that the
 * school's paragraphs actually reach the page, that the sections the 301 map
 * aims fragments at exist under those exact ids, and that About is reachable
 * from the nav — which is AC 1's wording, "reachable from the nav or its
 * parent".
 *
 * Zero axe violations at all five widths is `accessibility.spec.ts`'s, where
 * `/about` is one line on the surface list.
 */

test.describe('About', () => {
  test('answers 200 and says what the school is', async ({ page }) => {
    const response = await page.goto(ABOUT_PATH);

    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('Pharos Academy');
  });

  test('prints the mission and vision the school details hold', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    // Not the text of them — that is a row somebody edits, and asserting it
    // here would make an admin save a test failure. What is asserted is that
    // both are rendered and neither is empty, which is the failure that
    // actually happens: a page that reads a column that was never joined.
    const statements = page.locator('.statement p:not(.label)');
    await expect(statements).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      expect(((await statements.nth(index).textContent()) ?? '').trim().length).toBeGreaterThan(20);
    }
  });

  test('carries the six marks of the method and the eight core values', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    await expect(page.locator('#method .mark')).toHaveCount(METHOD.length);
    await expect(page.locator('#values .mark')).toHaveCount(CORE_VALUES.length);

    // One of each, whole — the school's sentence, not a trimmed version of it.
    await expect(page.locator('#method .mark').first()).toContainText(METHOD[0]!.text);
    await expect(page.locator('#values .mark').first()).toContainText(CORE_VALUES[0]!.text);
  });

  test('carries the essay on the name in full', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    const paragraphs = page.locator('#name .essay p');
    await expect(paragraphs).toHaveCount(PHAROS_MEANING.length);
    for (const [index, paragraph] of PHAROS_MEANING.entries()) {
      await expect(paragraphs.nth(index)).toContainText(paragraph);
    }
  });

  test('has the two sections the 301 map aims fragments at', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    await expect(page.locator('#location')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
  });

  test('names the host church and links it', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    const link = page.locator('#location').getByRole('link', { name: 'Enola First Church of God' });
    await expect(link).toHaveAttribute('href', /enolacog\.com/);
  });

  test('sends a family to the full Statement of Faith rather than the summary', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    const link = page.locator('#values').getByRole('link', { name: /Statement of Faith/ });
    await expect(link).toHaveAttribute('href', BELIEFS_PATH);
  });

  test('is reachable from the nav, on every page', async ({ page }) => {
    await page.goto('/classes');

    const link = page.locator('.site-header').getByRole('link', { name: 'About', exact: true });
    await expect(link).toHaveAttribute('href', ABOUT_PATH);
  });
});
