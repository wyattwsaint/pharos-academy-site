import { expect, test, type Page } from '@playwright/test';

import { SEEDED_ANNOUNCEMENTS } from '../src/lib/announcements/announcement.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';

/**
 * The news page, in a browser (#27).
 *
 * The freshness rule itself is proved in vitest, and the homepage's half of it
 * in `admin.spec.ts`, where a date can actually be changed. What needs a
 * rendered page is the other half of the ticket: that this page is the record —
 * everything the school has posted, current or not — so that the homepage is
 * free to hide itself without any of it becoming unreachable.
 *
 * Asserted by headline rather than by date, deliberately: the admin specs move
 * the seeded dates around to drive the homepage, and a spec that broke when
 * they did would be testing the other suite's state rather than this page.
 *
 * Zero axe violations at all five widths is `accessibility.spec.ts`'s, where
 * `/news` is one line on the surface list.
 */

/**
 * A seeded announcement that is a headline and a body and nothing else.
 *
 * Named rather than found, and deliberately not the board update: that is the
 * one the seed command attaches a PDF to, so "an announcement with no file
 * shows no PDF link" would be asserted against the one row that grows a file.
 */
const PLAIN = SEEDED_ANNOUNCEMENTS.find(
  (announcement) => announcement.slug === '2026-07-01-senators-game-fundraiser-july-24',
)!;

/** The Weis fundraiser, which is unusable without its link. */
const WITH_LINK = SEEDED_ANNOUNCEMENTS.find((announcement) => announcement.linkUrl !== null)!;

/**
 * Whether this run is reading a deployment rather than a freshly seeded one.
 *
 * Against a deployment the seed is not the record: the school posts and the
 * office deletes, through the admin, which is what the admin is for. The
 * senators' game fundraiser was seeded, published and then taken down on 14
 * August, and every run since read a page that correctly no longer carried it.
 * A spec that reads the seed for the answer fails on the day the office uses
 * the site, and calls a working deletion a broken page.
 *
 * So the seed is asserted only where the seed is the truth — a local run, whose
 * database this suite created — and against a deployment the page itself says
 * what the school has announced. What is proved there is the shape of the
 * record rather than its contents: that everything the page lists is a headline
 * and a machine-readable date. Nothing asserts the page is non-empty, because
 * an empty record is a real state the page renders a sentence for — a spec that
 * demanded news would be the same mistake in the other direction.
 */
const AGAINST_A_DEPLOYMENT = !!process.env.PLAYWRIGHT_BASE_URL;

/** The slugs the page itself carries, in the order it prints them. */
async function publishedSlugs(page: Page): Promise<string[]> {
  return page
    .locator('.news-list > li')
    .evaluateAll((entries) => entries.map((entry) => entry.id).filter((id) => id !== ''));
}

test.describe('the news page', () => {
  test('lists everything the school has announced, stale or not', async ({ page }) => {
    test.skip(AGAINST_A_DEPLOYMENT, 'the seed is not the record on a deployment');
    await page.goto(NEWS_PATH);

    for (const announcement of SEEDED_ANNOUNCEMENTS) {
      await expect(
        page.getByRole('heading', { name: announcement.headline }),
        announcement.slug,
      ).toBeVisible();
    }
  });

  test('prints each one with the date the school posted it', async ({ page }) => {
    await page.goto(NEWS_PATH);

    for (const slug of await publishedSlugs(page)) {
      const entry = page.locator(`[id="${slug}"]`);
      await expect(entry, slug).toHaveCount(1);
      await expect(entry.getByRole('heading'), slug).toBeVisible();
      // A machine-readable date beside the printed one, so the record is dated
      // for anything reading the page rather than looking at it.
      await expect(entry.locator('time'), slug).toHaveAttribute(
        'datetime',
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  test('prints the body the school wrote', async ({ page }) => {
    test.skip(AGAINST_A_DEPLOYMENT, 'the seed is not the record on a deployment');
    await page.goto(NEWS_PATH);

    await expect(page.locator(`[id="${PLAIN.slug}"]`)).toContainText(PLAIN.body.slice(0, 40));
  });

  test('shows no PDF link on an announcement that has no file', async ({ page }) => {
    test.skip(AGAINST_A_DEPLOYMENT, 'the seed is not the record on a deployment');
    await page.goto(NEWS_PATH);

    const entry = page.locator(`[id="${PLAIN.slug}"]`);
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('a[href$=".pdf"]')).toHaveCount(0);
  });

  test('carries a link out under the name the school gave it', async ({ page }) => {
    test.skip(AGAINST_A_DEPLOYMENT, 'the seed is not the record on a deployment');
    await page.goto(NEWS_PATH);

    const entry = page.locator(`[id="${WITH_LINK.slug}"]`);
    const link = entry.getByRole('link', { name: WITH_LINK.linkLabel! });
    await expect(link).toHaveAttribute('href', WITH_LINK.linkUrl!);
  });

  test('is reachable from the site nav, which the homepage band is not always', async ({ page }) => {
    await page.goto('/');
    // The announcements band hides itself when nothing is current, so the nav
    // is what keeps the record reachable in a quiet month. Since #30 the nav
    // item is the section rather than the page — News is one of two things a
    // current family comes for, and the trail is two clicks rather than one.
    await page
      .locator('[data-site-header]')
      .getByRole('link', { name: 'Current Families', exact: true })
      .click();
    await page.getByRole('link', { name: 'News', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${NEWS_PATH}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
  });

  test('answers a slug with no file behind it with a 404, not an empty PDF', async ({ request }) => {
    const response = await request.get(`${NEWS_PATH}/not-an-announcement.pdf`);
    expect(response.status()).toBe(404);
  });
});
