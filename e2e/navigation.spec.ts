import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { APPLICATION_PATH } from '../src/lib/application/application.js';
import { INQUIRY_HREF, NAV_ITEMS } from '../src/lib/home/sections.js';

/**
 * The small-screen navigation menu (#139).
 *
 * Until this ticket the nav was `display: none` below 860px and nothing
 * replaced it, so the majority of visitors — parents on a phone — had a header
 * with a wordmark, one call to action and no way to reach About, Classes,
 * Admissions or Current Families short of scrolling to the footer.
 *
 * What is asserted here is the half of the menu that is cheap to break and
 * expensive to notice: the keyboard contract (Escape returns focus, Tab does
 * not leak into the page behind), the scroll lock, and the desktop nav being
 * untouched. The look is not asserted — the design language is `beacon.css`
 * and a screenshot would only claim the pixels have not moved.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const toggle = (page: Page) => page.locator('[data-nav-menu-toggle]');
const panel = (page: Page) => page.locator('[data-nav-menu-panel]');

/** Load a page on a phone. `/classes` rather than `/`, so the header ships stuck. */
async function openPhone(page: Page, path = '/classes') {
  await page.setViewportSize(PHONE);
  await page.goto(path);
}

test.describe('the small-screen menu', () => {
  test('offers a labelled toggle where the desktop nav is hidden', async ({ page }) => {
    await openPhone(page);

    await expect(page.locator('.site-nav')).toBeHidden();
    await expect(toggle(page)).toBeVisible();
    // The name a screen reader announces, not the bars a sighted visitor taps.
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
  });

  test('opens onto every desktop destination, in the same order, plus the inquiry', async ({
    page,
  }) => {
    await openPhone(page);
    await toggle(page).click();

    await expect(panel(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');

    const names = await panel(page).getByRole('link').allInnerTexts();
    expect(names.map((name) => name.trim())).toEqual([
      ...NAV_ITEMS.map((item) => item.label),
      'Ask us about Pharos',
    ]);
    await expect(panel(page).locator(`a[href="${INQUIRY_HREF}"]`)).toHaveCount(1);
  });

  test('leaves the application call to action out of it', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();

    await expect(panel(page).locator(`a[href="${APPLICATION_PATH}"]`)).toHaveCount(0);
  });

  test('opens from the keyboard and gives focus back on Escape', async ({ page }) => {
    await openPhone(page);

    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toBeFocused();

    // Space is the other key a button answers to, and a `<button>` gets it free
    // — which is the reason the toggle is one.
    await page.keyboard.press(' ');
    await expect(panel(page)).toBeVisible();
  });

  test('keeps Tab inside the open menu', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();

    const links = panel(page).getByRole('link');
    const count = await links.count();

    // Forwards off the end wraps to the toggle rather than into the page behind.
    await links.last().focus();
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();

    // Backwards off the front wraps to the last destination.
    await page.keyboard.press('Shift+Tab');
    await expect(links.nth(count - 1)).toBeFocused();
  });

  /**
   * A wheel, not `window.scrollTo`. `overflow: hidden` is scrollable *by
   * script* by definition — only a visitor's own scrolling is refused — so a
   * programmatic scroll would fail this test while the phone it is written for
   * behaved perfectly. The wheel is the input a thumb and a trackpad both
   * arrive as, and it is what the criterion is actually about.
   */
  test('holds the page behind it still', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();

    await page.mouse.move(PHONE.width / 2, PHONE.height - 120);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // And gives the page back when it closes.
    await page.keyboard.press('Escape');
    await page.mouse.wheel(0, 800);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('closes when a destination is chosen', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();

    await panel(page).getByRole('link', { name: 'Admissions', exact: true }).click();

    await expect(page).toHaveURL(/\/admissions$/);
    await expect(panel(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('leaves the desktop header as it was', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes');

    await expect(toggle(page)).toBeHidden();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('.site-nav')).toBeVisible();
    await expect(page.locator('.site-nav a')).toHaveCount(NAV_ITEMS.length);
  });

  /**
   * The closed state is already measured at 390px by `accessibility.spec.ts`,
   * which sweeps every surface at five widths. The open state is not — it only
   * exists on a phone, so it cannot ride that list, and it is the state that
   * can actually fail: a panel over the page with a trapped focus ring is where
   * a name, a contrast pair or a hidden-but-focusable link goes wrong.
   */
  test('has zero axe violations with the menu open', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
      [],
    );
  });

  test('does not overflow horizontally with the menu open', async ({ page }) => {
    await openPhone(page);
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(PHONE.width);
  });
});
