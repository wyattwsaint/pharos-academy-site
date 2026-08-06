import { expect, test } from '@playwright/test';

import { CALENDAR_FEED_PATH } from '../src/lib/calendar/views.js';
import { CALENDAR_PATH } from '../src/lib/current-families/section.js';
import { signIn } from './suite-admin.js';

/**
 * The School Year and Events screens, driven the way Jill drives them (#23).
 *
 * The computation and both parsers are proved without a browser
 * (`src/lib/calendar/year.test.ts`, `src/lib/admin/school-year.test.ts`). Two
 * things are only true in a browser and are here: that the four-column preview
 * updates **as she types**, before anything is saved, and that saving a year
 * with the Tuesday track cleared is accepted rather than rejected as
 * incomplete.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe('the School Year screen', () => {
  test('previews the four-column sheet as the year is typed', async ({ page }) => {
    await page.goto('/admin/school-year');

    const preview = page.locator('[data-preview]');
    // The seeded year is already in the form, so the sheet is already drawn —
    // Monday's week 10, five days after Wednesday's.
    await expect(preview).toContainText('9 Nov 2026');
    await expect(preview).toContainText('4 Nov 2026');

    // Move the Monday track a week later and the whole column follows, with
    // nothing saved and no round trip.
    await page.locator('#fall\\.Monday\\.firstClassDate').fill('2026-09-14');
    // The Monday column ends a fortnight later than it did…
    await expect(preview).toContainText('21 Dec 2026');
    // …and the other three have not moved: this is per-track, not a shift.
    await expect(preview).toContainText('4 Nov 2026');
    await expect(preview).toContainText('15 Dec 2026');
  });

  test('saves a year with no Tuesday track as complete', async ({ page }) => {
    await page.goto('/admin/school-year');

    for (const semester of ['fall', 'spring']) {
      await page.locator(`#${semester}\\.Tuesday\\.firstClassDate`).fill('');
      await page.locator(`#${semester}\\.Tuesday\\.weeks`).fill('');
    }
    await page.getByRole('button', { name: 'Save the year' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
    await expect(page.locator('#fall\\.Tuesday\\.firstClassDate')).toHaveValue('');

    // And the public sheet has an empty Tuesday column rather than three
    // columns shifted left.
    await page.goto(CALENDAR_PATH);
    const weekOne = page
      .locator('[data-section="calendar-fall"] tbody tr')
      .filter({ has: page.locator('th', { hasText: /^1$/ }) })
      .first();
    await expect(weekOne).toContainText('31 August 2026');
    await expect(weekOne).not.toContainText('1 September 2026');

    /*
     * Put the Tuesday track back, because the suite's database is one database
     * for the whole run: the public specs read the seeded year, and a test that
     * left it six terms short would fail them from a distance.
     */
    await page.goto('/admin/school-year');
    await page.locator('#fall\\.Tuesday\\.firstClassDate').fill('2026-09-01');
    await page.locator('#fall\\.Tuesday\\.weeks').fill('14');
    await page.locator('#spring\\.Tuesday\\.firstClassDate').fill('2027-01-05');
    await page.locator('#spring\\.Tuesday\\.weeks').fill('14');
    await page.getByRole('button', { name: 'Save the year' }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
  });

  test('refuses a first class date that is not that track’s weekday, and saves nothing', async ({
    page,
  }) => {
    await page.goto('/admin/school-year');
    await page.locator('#fall\\.Wednesday\\.firstClassDate').fill('2026-09-03');
    await page.getByRole('button', { name: 'Save the year' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#fall\\.Wednesday\\.firstClassDate')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});

test.describe('the Events screen', () => {
  test('adds a one-off, publishes it, and takes it off again', async ({ page, request }) => {
    await page.goto('/admin/events/new');
    await page.getByLabel('Date').fill('2026-10-17');
    await page.getByLabel('What it is').fill('Suite open house');
    await page.getByLabel('Time').fill('18:30');
    await page.getByLabel('Where').fill('The hall');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    await page.goto(CALENDAR_PATH);
    await expect(page.locator('[data-section="calendar-events"]')).toContainText(
      'Suite open house',
    );

    // And in the feed, as a timed event rather than a whole day.
    const feed = await (await request.get(CALENDAR_FEED_PATH)).text();
    expect(feed.replace(/\r\n /g, '')).toContain('SUMMARY:Suite open house');
    expect(feed).toContain('DTSTART:20261017T223000Z');

    await page.goto('/admin/events/2026-10-17-suite-open-house');
    await page.getByRole('button', { name: 'Take this off the calendar' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(page.locator('body')).not.toContainText('Suite open house');
  });
});
