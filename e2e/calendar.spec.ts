import { expect, test } from '@playwright/test';

import { eventDateLabel } from '../src/lib/calendar/event.js';
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
    const cells = page.locator('[data-section^="calendar-"] tbody td time');
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

  /*
   * The events a visitor who is not signed in actually sees (#146 ACs 1, 3
   * and 5, #153 ACs 1 and 3).
   *
   * Read off the page rather than off a constant, and that is a change: the
   * school's events now come from two places — the Events screen and the
   * school's own Google calendar — and neither the count nor the titles are
   * knowable from the repository any more. What *is* knowable is the shape of
   * an event and that the page and the feed agree about it, which is what this
   * asserts.
   *
   * Skipped rather than quietly satisfied when nothing is on. A year with an
   * empty stretch is an ordinary year and the page is right to say so; a loop
   * over an empty list is a test that passes for ever while proving nothing. A
   * skip says so on the report, and the admin suite proves the same page with
   * an event it creates itself.
   */
  test('shows the events still ahead, from both of the school’s calendars', async ({
    page,
    request,
  }) => {
    await page.goto(CALENDAR_PATH);
    const section = page.locator('[data-section="calendar-events"]');
    const shown = section.locator('.events li');
    const count = await shown.count();
    test.skip(count === 0, 'Nothing is on the calendar today — see admin-calendar.spec.ts.');

    await expect(section).not.toContainText('Nothing else is on the calendar');

    const feed = (await (await request.get(CALENDAR_FEED_PATH)).text()).replace(/\r\n /g, '');
    for (let index = 0; index < count; index += 1) {
      const event = shown.nth(index);
      // A date, printed as the sheet prints one, and a title.
      await expect(event.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
      const heldOn = (await event.locator('time').getAttribute('datetime'))!;
      await expect(event.locator('time')).toHaveText(eventDateLabel(heldOn));

      // And the same event in the subscribed feed, whichever calendar it came
      // from: that is the whole of what "alongside events entered directly"
      // means to a family who subscribed once and never touched it again.
      const title = (await event.locator('h3').innerText()).trim();
      expect(feed, title).toContain(title.replace(/([;,\\])/g, '\\$1'));
    }
  });

  test('prints as the calendar, not as a website', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByTestId('calendar-download')).toBeHidden();
    // The sheet itself is still there, and still whole.
    await expect(page.locator('[data-section="calendar-fall"] tbody tr').first()).toBeVisible();
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
