import { expect, test } from '@playwright/test';

import { eventDateLabel, SEEDED_EVENTS, upcomingEvents } from '../src/lib/calendar/event.js';
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
   * The fundraiser, to a visitor who is not signed in (#146 ACs 1, 3 and 5).
   *
   * Asserted against `upcomingEvents` rather than against the Chick-fil-A row by
   * name, because the seed is dated and this suite is not: on 20 August the
   * event has been and gone, and the page is *right* to have dropped it. What is
   * true on both sides of that date is that the page shows what is ahead and
   * says nothing is scheduled only when nothing is.
   */
  test('shows the events still ahead, and claims nothing is on only when nothing is', async ({
    page,
  }) => {
    await page.goto(CALENDAR_PATH);
    const events = page.locator('[data-section="calendar-events"]');
    const ahead = upcomingEvents(SEEDED_EVENTS, new Date());

    for (const event of ahead) {
      await expect(events, event.slug).toContainText(event.title);
      await expect(events, event.slug).toContainText(eventDateLabel(event.heldOn));
    }

    if (ahead.length > 0) await expect(events).not.toContainText('Nothing else is on the calendar');
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
    expect(body.split('BEGIN:VEVENT').length - 1).toBe(
      meetingsOf(SEEDED_SCHOOL_YEAR).length + SEEDED_EVENTS.length,
    );
    // One real date, spot-checked end to end: the Wednesday track's week 10.
    const wednesday = trackColumn(SEEDED_SCHOOL_YEAR, 'Wednesday').find((m) => m.week === 10)!;
    const unfolded = body.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DTSTART;VALUE=DATE:${wednesday.date.replace(/-/g, '')}`);

    /*
     * And every one-off, whether or not it is still ahead (#146 AC 1). The feed
     * is deliberately unfiltered where the page is not: a subscribed calendar is
     * the record of the year, and its client is what decides what to draw.
     */
    for (const event of SEEDED_EVENTS) {
      expect(unfolded, event.slug).toContain(`SUMMARY:${event.title}`);
    }
  });

  test('answers 304 when nothing about the year has changed', async ({ request }) => {
    const first = await request.get(CALENDAR_FEED_PATH);
    const etag = first.headers()['etag']!;
    const second = await request.get(CALENDAR_FEED_PATH, { headers: { 'if-none-match': etag } });
    expect(second.status()).toBe(304);
  });
});
