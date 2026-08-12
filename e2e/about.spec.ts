import { expect, test } from '@playwright/test';

import { BELIEFS_PATH } from '../src/lib/about/beliefs.js';
import {
  ABOUT_PATH,
  CORE_VALUES,
  METHOD,
  PHAROS_DRAWING,
  PHAROS_MEANING,
} from '../src/lib/about/story.js';

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

  // The drawing's licence condition is the credit, so "the image loaded" is
  // only half of what has to hold: the credit and the licence are asserted as
  // *visible* text, and the alt text is asserted to describe the lighthouse
  // rather than repeat the attribution — a screen-reader user wants the
  // picture, and the credit is on the page for everyone already.
  test('prints Thiersch’s drawing beside the essay, credited', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    const figure = page.locator('#name figure');
    const image = figure.locator('img');
    await expect(image).toHaveAttribute('alt', PHAROS_DRAWING.alt);
    await expect(image).toHaveAttribute('src', PHAROS_DRAWING.src);

    // Really served, and really an image — a 404 from `public/` still renders
    // an <img> element, and this test is the one that would otherwise pass on
    // a broken file.
    const response = await page.request.get(PHAROS_DRAWING.src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');

    const caption = figure.locator('figcaption');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('H. Thiersch');
    await expect(caption).toContainText('Public Domain');
  });

  test('opens by calling the school Christian classical, in that order', async ({ page }) => {
    await page.goto(ABOUT_PATH);

    await expect(page.locator('[data-section="about-header"] .sub')).toContainText(
      'A Christian, classical hybrid microschool',
    );
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
