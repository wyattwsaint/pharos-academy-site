import { expect, test } from '@playwright/test';

import { monthGrid, printedYear } from '../src/lib/calendar/months.js';
import { CALENDAR_FEED_PATH } from '../src/lib/calendar/views.js';
import { CALENDAR_PATH } from '../src/lib/current-families/section.js';
import { meetingsOf, SEEDED_SCHOOL_YEAR, trackColumn } from '../src/lib/calendar/year.js';

/**
 * The calendar page and the feed, over HTTP (#23).
 *
 * The computation is proved in `src/lib/calendar/year.test.ts` against the
 * school's own PDFs, and the feed's structure in `ics.test.ts`. What is only
 * true in a browser is here: that the sheet renders the four tracks as four
 * columns, that the page prints as the calendar rather than as a website, and
 * that the subscribe address answers as a calendar rather than as a page.
 *
 * Subscribing the feed in a real client is #56's, and no assertion here
 * pretends to cover it.
 */

test.describe('the calendar page', () => {
  test('shows each track’s own dates, in its own column', async ({ page }) => {
    await page.goto(CALENDAR_PATH);

    const fall = page.locator('[data-section="calendar-fall"]');
    // Week 10 is the row that proves the tracks are computed apart: 9 November
    // on Monday and 4 November on Wednesday, both correct.
    const weekTen = fall.locator('tbody tr', { has: page.locator('th', { hasText: /^10$/ }) });
    await expect(weekTen).toContainText('9 November 2026');
    await expect(weekTen).toContainText('4 November 2026');

    // And the closures are written in where they interrupt.
    await expect(fall).toContainText('Labor Day');
    await expect(fall).toContainText('Thanksgiving');
  });

  test('renders every one of the year’s dates', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    // The sheet's own cells, not the month grid's below it: both are tables of
    // dates on this page, and the count that is fixed at 112 is the sheet's.
    const cells = page.locator('.sheet tbody td time');
    await expect(cells).toHaveCount(meetingsOf(SEEDED_SCHOOL_YEAR).length);
  });

  test('offers one download and says what a subscribed calendar cannot promise', async ({
    page,
  }) => {
    await page.goto(CALENDAR_PATH);

    const download = page.getByTestId('calendar-download');
    await expect(download).toHaveAttribute('href', CALENDAR_FEED_PATH);
    // One, not five: the PDFs it retires were six separate files.
    await expect(page.locator(`a[href="${CALENDAR_FEED_PATH}"]`)).toHaveCount(1);

    await expect(page.getByTestId('subscription-caveat')).toContainText('own schedule');
  });

  /**
   * What comes out of the printer is the year as a dated list (#236).
   *
   * The folding is proved as arithmetic in `src/lib/calendar/months.test.ts`.
   * What is only true in a browser is here: that print media swaps the screen's
   * two halves for the list, and that the list is on the paper at all.
   *
   * This replaces the assertion that the semester sheet survived print. It did,
   * and that was the bug: a school office pinned up a table of week numbers
   * with no fundraiser, no picture day and no open house on it.
   */
  test('prints as the year’s dated list, not as a website', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByTestId('calendar-download')).toBeHidden();
    // Both drawings of the year on the screen come off: the sheet is week
    // numbers, and the grid is nine sheets of mostly empty boxes.
    await expect(page.locator('.months')).toBeHidden();
    await expect(page.locator('[data-section="calendar-fall"]')).toBeHidden();
    await expect(page.locator('[data-section="calendar-spring"]')).toBeHidden();
    // Which is what takes the week numbers and the offerings off the paper:
    // they are the sheets' and the grid's, and neither is printed.
    await expect(page.getByRole('columnheader', { name: 'Week' })).toBeHidden();

    // And the list is there, month by month, in the two columns it is read in.
    const printed = page.locator('[data-section="calendar-print"]');
    await expect(printed).toBeVisible();
    const months = printedYear(monthGrid(SEEDED_SCHOOL_YEAR, [])).map((month) => month.id);
    for (const month of months) {
      await expect(printed.locator(`[data-print-month="${month}"]`), month).toBeVisible();
    }
    await expect(printed.locator('.printed-columns')).toHaveCSS('column-count', '2');
  });

  /**
   * The dates the school shut, and the one-offs, on the paper (#236 ACs 3–7).
   *
   * Read against the seeded year's own closures, which are computed rather than
   * typed here; the one-offs are not knowable from the repository (#153), so
   * that half is asserted in `admin-calendar.spec.ts` with an event it creates.
   */
  test('folds a run of closures into one printed line', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    await page.emulateMedia({ media: 'print' });

    const november = page.locator('[data-print-month="2026-11"]');
    // Thanksgiving's Wednesday and Thursday as one line, and the run that
    // crosses into December as one more — printed under the month it opens in.
    await expect(november.locator('li', { hasText: '25–26' })).toContainText(
      'No school — Thanksgiving',
    );
    await expect(november.locator('li', { hasText: '30 November–1 December' })).toBeVisible();
    // Election Day is one day off with its own name: a line, not a range of one.
    const election = november.locator('li', { hasText: 'Election Day' });
    await expect(election.locator('.printed-days')).toHaveText('3');

    // No week numbers and no offerings anywhere on the sheet.
    await expect(page.locator('[data-section="calendar-print"]')).not.toContainText('Week');
  });
});

/**
 * The month grid (#186).
 *
 * The view model is proved without a browser in
 * `src/lib/calendar/months.test.ts`, date by date and against the sheet. What is
 * only true in a browser is here: that the months are drawn, that the page opens
 * on the one it currently is, that a one-off's detail can be opened from a
 * keyboard, and that a phone gets a list rather than seven columns it cannot
 * read.
 *
 * That a **past** one-off is drawn is proved in `admin-calendar.spec.ts`, which
 * can make one; which one-offs the site holds today is no longer knowable from
 * the repository (#153).
 */
test.describe('the month grid', () => {
  test('draws every month the year touches, and opens on the current one', async ({ page }) => {
    await page.goto(CALENDAR_PATH);

    const months = page.locator('[data-section="calendar-months"] .month');
    const drawn = await months.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.month!),
    );
    const expected = monthGrid(SEEDED_SCHOOL_YEAR, []).map((month) => month.id);
    // A floor rather than an exact list: a one-off outside the term dates pulls
    // the span out to it, and the one-offs are not knowable from here.
    for (const month of expected) expect(drawn, month).toContain(month);

    // Contiguous, so a family reading November is not reading October's grid.
    for (const [index, month] of drawn.slice(1).entries()) {
      expect(month > drawn[index]!, month).toBe(true);
    }

    const current = page.locator('[data-current-month]');
    if ((await current.count()) > 0) await expect(current).toBeInViewport();
  });

  test('marks the weekdays in term time that nobody meets on', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    const cell = (date: string) =>
      page.locator(`[data-section="calendar-months"] td:has(time[datetime="${date}"])`);

    // Election Day, then Thanksgiving off four tracks in six days.
    await expect(cell('2026-11-03')).toContainText('No school — Election Day');
    for (const date of ['2026-11-25', '2026-11-26', '2026-11-30', '2026-12-01']) {
      await expect(cell(date), date).toContainText('No school — Thanksgiving');
    }

    // And a Tuesday the Tuesday track meets, which carries no courses at all
    // and is a school day all the same — the sheet above prints it.
    await expect(cell('2026-11-10')).not.toContainText('No school');
  });

  /*
   * The one-offs on the grid are the one-offs in the feed (#153 ACs 1 and 3).
   *
   * Read off the page rather than off a constant: the school's events come from
   * two places — the Events screen and the school's own Google calendar — and
   * neither the count nor the titles are knowable from the repository any more.
   * What is knowable is that a family who subscribed once and never touched it
   * again sees the same year the page draws, whichever calendar an event came
   * from.
   *
   * Skipped rather than quietly satisfied when nothing is on: a loop over an
   * empty list passes for ever while proving nothing, and the admin suite proves
   * the same page with an event it creates itself.
   */
  test('draws the same one-offs the subscribed feed carries', async ({ page, request }) => {
    await page.goto(CALENDAR_PATH);
    const shown = page.locator('[data-section="calendar-months"] .one-off-title');
    const count = await shown.count();
    test.skip(count === 0, 'Nothing is on the calendar today — see admin-calendar.spec.ts.');

    const feed = (await (await request.get(CALENDAR_FEED_PATH)).text()).replace(/\r\n /g, '');
    for (let index = 0; index < count; index += 1) {
      const one = shown.nth(index);
      const title = (await one.innerText()).trim();
      expect(feed, title).toContain(title.replace(/([;,\\])/g, '\\$1'));
    }
  });

  test('opens a one-off’s detail from the keyboard, and closes it again', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    const trigger = page.locator('[data-section="calendar-months"] .one-off-title').first();
    test.skip((await trigger.count()) === 0, 'Nothing is on the calendar — see admin-calendar.');

    const panel = page.locator(`#${await trigger.getAttribute('aria-controls')}`);
    await expect(panel).toBeHidden();

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Revealed, not merely announced: an off-screen detail is not a disclosure.
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('is a dated list on a phone, with nothing off the side of the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(CALENDAR_PATH);

    const section = page.locator('[data-section="calendar-months"]');
    // A date with nothing true of it steps out; a marked one stays and says
    // which day it is in full, because there is no column heading left to.
    await expect(section.locator('td:has(time[datetime="2026-11-04"])')).toBeHidden();
    await expect(section.locator('td:has(time[datetime="2026-11-25"])')).toBeVisible();
    await expect(section.locator('time[datetime="2026-11-25"]')).toContainText(
      'Wednesday 25 November',
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('has no events list left on it', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    await expect(page.locator('[data-section="calendar-events"]')).toHaveCount(0);
  });
});

test.describe('the subscribe address', () => {
  test('answers as a calendar, with a VEVENT per meeting date and per one-off', async ({
    request,
  }) => {
    const response = await request.get(CALENDAR_FEED_PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/calendar');

    const body = await response.text();
    /*
     * Every meeting date, and then the one-offs on top of them.
     *
     * A floor rather than an exact count, because the one-offs are no longer
     * knowable from the repository: some are typed on the Events screen and the
     * rest arrive from the school's own Google calendar overnight (#153). The
     * count that *is* fixed is the year's, which is computed from eight numbers.
     */
    const meetings = meetingsOf(SEEDED_SCHOOL_YEAR).length;
    expect(body.split('BEGIN:VEVENT').length - 1).toBeGreaterThanOrEqual(meetings);

    // One real date, spot-checked end to end: the Wednesday track's week 10.
    const wednesday = trackColumn(SEEDED_SCHOOL_YEAR, 'Wednesday').find((m) => m.week === 10)!;
    const unfolded = body.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DTSTART;VALUE=DATE:${wednesday.date.replace(/-/g, '')}`);

    /*
     * The one-offs are deliberately unfiltered here where the page is not
     * (#146 AC 1): a subscribed calendar is the record of the year, and its
     * client is what decides what to draw. That each one the page shows is also
     * in here is asserted on the page test above, which is where both are known.
     */
  });

  test('answers 304 when nothing about the year has changed', async ({ request }) => {
    const first = await request.get(CALENDAR_FEED_PATH);
    const etag = first.headers()['etag']!;
    const second = await request.get(CALENDAR_FEED_PATH, { headers: { 'if-none-match': etag } });
    expect(second.status()).toBe(304);
  });
});
