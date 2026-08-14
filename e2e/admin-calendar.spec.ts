import { expect, test, type Locator, type Page } from '@playwright/test';

import { eventSlug } from '../src/lib/calendar/event.js';
import { schoolTimeToUtc, utcStamp } from '../src/lib/calendar/ics.js';
import { CALENDAR_FEED_PATH } from '../src/lib/calendar/views.js';
import { addDays, schoolToday } from '../src/lib/calendar/year.js';
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

/**
 * That a control's complaint is announced *with* it, rather than merely
 * printed near it — which is the whole of what the shared field wires up and
 * the whole of what rots when a screen hand-copies a control (#190, #196).
 *
 * Asserted through `aria-describedby` because that is what a screen reader
 * reads; the ids are looked up by attribute rather than as a `#` selector,
 * since a described-by holds a space-separated list and admin ids contain dots.
 */
async function announces(page: Page, control: Locator, says: string): Promise<void> {
  const described = await control.getAttribute('aria-describedby');
  expect(described, 'the control names what describes it').toBeTruthy();
  const complaint = described!.split(' ').filter((id) => id.endsWith('-error'));
  expect(complaint).toHaveLength(1);
  await expect(page.locator(`[id="${complaint[0]}"]`)).toContainText(says);
}

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

    /*
     * And the sheet it draws declares its headers (#196 AC 4, #190).
     *
     * Every date in here answers a track *and* a week, so both directions are
     * named: the track across the top, the week number down the side. Without
     * them a screen reader reads four loose dates per row and the reader has
     * to hold the column order in their head. Asserted on the redrawn table
     * rather than in a spec of its own, because the script that draws the
     * dates is the same script that declares the headers.
     */
    const table = preview.locator('table').first();
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(5);
    await expect(table.locator('thead th[scope="col"]').first()).toHaveText('Week');
    const weekOne = table.locator('tbody tr').first();
    await expect(weekOne.locator('th[scope="row"]')).toHaveCount(1);
    await expect(weekOne.locator('th[scope="row"]')).toHaveText('1');
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
    const refused = page.locator('#fall\\.Wednesday\\.firstClassDate');
    await expect(refused).toHaveAttribute('aria-invalid', 'true');
    // And the complaint is announced with the box, not merely printed beside
    // it (#196 AC 3): the term rows' errors were loose paragraphs.
    await announces(page, refused, 'Wednesday');
  });

  /**
   * A closure row that is wrong twice says so twice (#196 AC 2, #190).
   *
   * Both complaints were rendered as one unlabelled paragraph, so a screen
   * reader on either box heard nothing and the row had to be fixed in two
   * passes. Asserted through `aria-describedby` rather than the markup: what
   * matters is that the complaint is announced *with* the box it is about.
   *
   * The two are provoked together by repeating a day already on the list and
   * leaving its label blank — a date box cannot hold an unparseable date, so a
   * duplicate is the only way one is filled in and still refused.
   */
  test('announces both complaints on a closure row that is wrong twice', async ({ page }) => {
    await page.goto('/admin/school-year');

    const rows = page.locator('[data-closure-row]');
    const before = await rows.count();
    const already = await rows.first().locator('input[name="closure.date"]').inputValue();

    await rows.last().locator('input[name="closure.date"]').fill(already);
    await page.getByRole('button', { name: 'Save the year' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');

    const refused = page
      .locator('[data-closure-row]')
      .filter({ hasText: 'That day is already on the list.' });

    await announces(page, refused.locator('input[name="closure.date"]'), 'already on the list');
    await announces(
      page,
      refused.locator('input[name="closure.label"]'),
      'Say what the school is closed for',
    );

    // And nothing was saved: the refusal is the whole form's, not the row's.
    await page.goto('/admin/school-year');
    await expect(page.locator('[data-closure-row]')).toHaveCount(before);
  });
});

test.describe('the Events screen', () => {
  /*
   * A date this suite computes rather than types, because what a one-off is
   * still ahead *of* moves: a literal 17 October 2026 in here is a test that
   * stops proving anything on 18 October and reports it as a regression. A
   * hundred days out is always ahead, and the instant its 6.30pm falls on is
   * asked of the same function the feed uses, so the assertion holds either side
   * of a daylight-saving changeover.
   *
   * The page no longer filters — the grid draws the year, past one-offs included
   * (#186) — but the structured data and the "still ahead" boundary do, so this
   * stays ahead and the test below is the one that has already happened.
   */
  const heldOn = addDays(schoolToday(new Date()), 100);

  test('adds a one-off, publishes it, and takes it off again', async ({ page, request }) => {
    await page.goto('/admin/events/new');
    await page.getByLabel('Date').fill(heldOn);
    await page.getByLabel('What it is').fill('Suite open house');
    await page.getByLabel('Time').fill('18:30');
    await page.getByLabel('Where').fill('The hall');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    await page.goto(CALENDAR_PATH);
    const cell = page.locator(`[data-section="calendar-months"] td:has(time[datetime="${heldOn}"])`);
    await expect(cell).toContainText('Suite open house');

    /*
     * And its detail opens from a keyboard (#186 AC 4).
     *
     * Here rather than in `calendar.spec.ts` because this is the suite that can
     * make a one-off: which of them the site holds is no longer knowable from
     * the repository, and a test that skips itself on an empty calendar proves
     * nothing on the day it matters.
     */
    const trigger = cell.getByRole('button', { name: 'Suite open house' });
    const panel = page.locator(`#${await trigger.getAttribute('aria-controls')}`);
    await expect(panel).toBeHidden();

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Revealed, not merely announced: the time and the place are what the cell
    // itself has no room for, and an off-screen detail is not a disclosure.
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('6.30pm');
    await expect(panel).toContainText('The hall');

    // And in the feed, as a timed event rather than a whole day.
    const feed = await (await request.get(CALENDAR_FEED_PATH)).text();
    expect(feed.replace(/\r\n /g, '')).toContain('SUMMARY:Suite open house');
    expect(feed).toContain(`DTSTART:${utcStamp(schoolTimeToUtc(heldOn, '18:30'))}`);

    await page.goto(`/admin/events/${eventSlug(heldOn, 'Suite open house')}`);
    await page.getByRole('button', { name: 'Take this off the calendar' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(page.locator('body')).not.toContainText('Suite open house');
  });

  /*
   * The one-off that has been and gone, still on the grid (#186).
   *
   * This reverses #146 for the page and only for the page: in a list a finished
   * fundraiser led, and in a grid the cell's own position says the date has
   * passed. The structured data still drops it, which is asserted where the
   * markup is read.
   *
   * Only this suite can prove it, because only this suite can make a one-off.
   */
  test('leaves a one-off that has been and gone on the grid', async ({ page }) => {
    const gone = addDays(schoolToday(new Date()), -100);

    await page.goto('/admin/events/new');
    await page.getByLabel('Date').fill(gone);
    await page.getByLabel('What it is').fill('Suite spring concert');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    await page.goto(CALENDAR_PATH);
    const cell = page.locator(`[data-section="calendar-months"] td:has(time[datetime="${gone}"])`);
    await expect(cell).toContainText('Suite spring concert');

    await page.goto(`/admin/events/${eventSlug(gone, 'Suite spring concert')}`);
    await page.getByRole('button', { name: 'Take this off the calendar' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
  });
});
