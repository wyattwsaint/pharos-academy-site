import { expect, test } from '@playwright/test';

import { SEEDED_SCHOOL_YEAR, trackColumn } from '../src/lib/calendar/year.js';
import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { timeLabel } from '../src/lib/courses/schedule.js';
import { clashWarnings, meetingSlots, runningTracks } from '../src/lib/courses/slots.js';
import { signIn } from './suite-admin.js';

/**
 * The course editor, driven the way Jill drives it (#24).
 *
 * The parser, the slot generation, the clash rule and the store's writes
 * are all proved without a browser (`src/lib/admin/courses.test.ts`,
 * `src/lib/courses/slots.test.ts`, `src/lib/courses/store.test.ts`). What is
 * only true in a browser is here: that the controls really are drawn from the
 * school year and the timetable rather than from a hard-coded week, that there
 * is **no price to type**, and that saving into an occupied slot warns and
 * saves anyway — the warning being the point, the refusal never.
 *
 * **Nothing here adds a course.** The public suite pins the catalogue's size,
 * its empty Tuesday and every published price, and it runs against this same
 * throwaway database at the same time; a class added here would fail those
 * specs from a distance. So the end-to-end save is an *edit* — of a course no
 * other spec mentions, to the one field no other spec asserts — and it is put
 * back afterwards.
 */

/**
 * The course this spec edits.
 *
 * Chosen for two reasons and asserted on both below: it already shares a slot
 * with another class, so a save proves the warning; and no other spec pins its
 * title, price or description, so borrowing it for a moment cannot fail one.
 */
const SUBJECT = CATALOGUE.find((course) => course.slug === 'basic-spanish-grades-9-12')!;

/** What the domain says about that slot, which is what the screen must print. */
const EXPECTED_WARNINGS = clashWarnings(
  {
    slug: SUBJECT.slug,
    days: SUBJECT.days,
    start: SUBJECT.start,
    end: SUBJECT.end,
    enrolment: SUBJECT.enrolment,
    dates: SUBJECT.dates,
  },
  CATALOGUE,
  SEEDED_SCHOOL_YEAR,
);

const MARKER = 'Edited by the suite — conversational Spanish, taught in Spanish.';

test.beforeEach(async ({ page }) => {
  await signIn(page, '/admin/courses');
});

test.describe('the add form', () => {
  test('has no price to type', async ({ page }) => {
    // AC 2, as a property of the page rather than a promise about it: there is
    // no control named price, at any spelling, so there is nothing to type over.
    await page.goto('/admin/courses/new');

    await expect(page.locator('[name="price" i]')).toHaveCount(0);
    await expect(page.locator('input[type="number"][name*="price" i]')).toHaveCount(0);
    await expect(page.getByTestId('computed-price')).toContainText('Worked out on save');
  });

  test('offers the year’s day tracks and nothing else', async ({ page }) => {
    // AC 3's first half. The days come from the School Year screen — a track
    // the year gives no term is a day the school does not meet.
    await page.goto('/admin/courses/new');

    const offered = await page
      .locator('input[name="days"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));
    expect(offered).toEqual(runningTracks(SEEDED_SCHOOL_YEAR));
  });

  test('offers the timetable’s real meeting times, plus a way in for a new one', async ({
    page,
  }) => {
    // AC 3's second half. The times are the distinct times the catalogue
    // already runs at, not a grid this site invented.
    await page.goto('/admin/courses/new');

    const expected = [
      ...new Set(
        meetingSlots(SEEDED_SCHOOL_YEAR, CATALOGUE).map((slot) => `${slot.start}-${slot.end}`),
      ),
    ].sort();

    const offered = await page
      .locator('#time option')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));

    expect(offered[0]).toBe('');
    expect(offered.at(-1)).toBe('custom');
    expect(offered.slice(1, -1)).toEqual(expected);

    // And they are labelled the way the school writes a time, not as 24-hour
    // machine values.
    const first = expected[0]!.split('-');
    await expect(page.locator('#time')).toContainText(timeLabel(first[0]!, first[1]!));
  });

  test('offers only real meeting dates as a block’s start', async ({ page }) => {
    // AC 6. Every option is one of that track's own meeting dates, so a block
    // cannot begin on a day the school does not meet.
    await page.goto('/admin/courses/new');

    for (const track of runningTracks(SEEDED_SCHOOL_YEAR)) {
      const dates = trackColumn(SEEDED_SCHOOL_YEAR, track).map((meeting) => meeting.date);
      const offered = await page
        .locator(`#blockStart optgroup[label="${track}"] option`)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));

      expect(offered.length, track).toBeGreaterThan(0);
      expect(offered, track).toEqual(dates);
    }
  });
});

test.describe('saving a class', () => {
  test('warns about the occupied slot, saves anyway, and reaches the public pages', async ({
    page,
  }) => {
    // AC 1 and AC 4 together, because they are one action: the save that warns
    // is the save that publishes.
    expect(
      EXPECTED_WARNINGS.length,
      'the subject course is supposed to share its slot',
    ).toBeGreaterThan(0);

    await page.goto(`/admin/courses/${SUBJECT.slug}`);
    await page.locator('#description').fill(MARKER);
    await page.getByRole('button', { name: 'Save' }).click();

    // Saved — the warning is a thing Jill is told, never a save she is refused.
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    const warnings = page.getByTestId('clash-warnings');
    await expect(warnings).toBeVisible();
    await expect(warnings).toContainText(EXPECTED_WARNINGS[0]!.course.title);
    // Told, not alarmed: an oversubscribed slot is the school's own design.
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // And it is on the public pages, which is the whole point of the screen.
    await page.goto('/classes/descriptions');
    await expect(page.locator(`.coursefull[data-course="${SUBJECT.slug}"]`)).toContainText(MARKER);

    await page.goto(`/classes/${SUBJECT.slug}`);
    await expect(page.locator('h1')).toHaveText(SUBJECT.title);
    await expect(page.locator('body')).toContainText(MARKER);

    /*
     * Put it back. The suite's database is one database for the whole run, and
     * the public specs read this catalogue — a spec that left its own words in
     * a class description would be editing the school's site from a distance.
     */
    await page.goto(`/admin/courses/${SUBJECT.slug}`);
    await page.locator('#description').fill(SUBJECT.description);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    await page.goto('/classes/descriptions');
    await expect(page.locator(`.coursefull[data-course="${SUBJECT.slug}"]`)).not.toContainText(
      MARKER,
    );
  });

  test('refuses a class with nothing typed, and says everything at once', async ({ page }) => {
    // The parser's promise, in a browser: the form comes back with every
    // complaint rather than one per round trip, and nothing was written.
    await page.goto('/admin/courses/new');
    // `novalidate` is not set, so the browser's own required-field stop has to
    // be got past before the server ever sees the post — the fields the server
    // judges are the ones with no HTML constraint.
    await page.locator('#title').fill('A class the suite never saves');
    await page.locator('#description').fill('Typed, so the browser lets the form through.');
    await page.locator('#ageLabel').fill('Any age');
    await page.locator('#prerequisites').fill('None');
    await page.locator('#weeks').fill('14');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.getByTestId('save-banner')).toContainText('Nothing was saved');
    // Stages, days, the shape, the units, the rate and the instructor are all
    // unanswered, and all six are said now.
    const form = page.locator('form[action="/admin/courses/new"]');
    await expect(form).toContainText('Tick at least one stage');
    await expect(form).toContainText('Tick the day track');
    await expect(form).toContainText('Say what shape the course runs as');
    await expect(form).toContainText('Tick at least one');
    await expect(form).toContainText('Pick which hourly rate');
    await expect(form).toContainText('Pick who teaches it');

    // And what was typed is still there — a rejected form does not empty itself.
    await expect(page.locator('#title')).toHaveValue('A class the suite never saves');
  });
});
