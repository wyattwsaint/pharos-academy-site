import { expect, test } from '@playwright/test';

import { fullDateLabel, SEEDED_SCHOOL_YEAR, trackColumn } from '../src/lib/calendar/year.js';
import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { timeLabel } from '../src/lib/courses/schedule.js';
import { clashWarnings, meetingSlots, runningTracks } from '../src/lib/courses/slots.js';
import { signIn } from './suite-admin.js';
import { ensureUnstaffedCourse, UNSTAFFED } from './unstaffed-course.js';

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
 * **Almost nothing here adds a course.** The public suite reads this same
 * throwaway database at the same time, so a class added here shows up in its
 * assertions from a distance. The end-to-end save is therefore an *edit* — of a
 * course no other spec mentions, to the one field no other spec asserts — and
 * it is put back afterwards.
 *
 * The exception is the unstaffed class (#257), which cannot be an edit: no
 * seeded course lacks an instructor, and clearing one would take that person's
 * class off the staff page while `staff.spec.ts` was reading it. It is added
 * instead, once, by the shared fixture in `unstaffed-course.ts` — at an hour the
 * school already meets at, on the day with no geometry to disturb, so both the
 * time list here and the lanes over there are what they always were.
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

  test('offers no block start dates until a day is ticked', async ({ page }) => {
    // #61. The add form knows no track yet, and every date it could offer would
    // belong to some track this block does not meet on. An empty picker that
    // says what to do is the honest state; offering all four is not.
    await page.goto('/admin/courses/new');

    const offered = await page
      .locator('#blockStart option')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));

    expect(offered).toEqual(['']);
    await expect(page.locator('#blockStart-hint')).toContainText('tick the one day it meets on');
  });

  test('shows no computed end date on an empty form', async ({ page }) => {
    // #60's other end: nothing picked is not an end date of nothing.
    await page.goto('/admin/courses/new');

    await expect(page.getByTestId('block-end')).toHaveCount(0);
  });
});

/**
 * The three things the screen used to work out only after a save (#59, #60,
 * #61). Each is asserted on a **GET** — opening the screen and touching
 * nothing — because that is exactly what was broken: the answers existed, and
 * arrived one save later than the authoring they were for.
 */
test.describe('what the screen says before anything is saved', () => {
  /** The seeded block: six Wednesdays, in the crowded 10:40 slot. */
  const BLOCK = CATALOGUE.find((course) => course.slug === 'insect-explorers')!;

  test('warns about an occupied slot on opening the course, with no save', async ({ page }) => {
    // #59. AC 4 wants a clash found at authoring time; pressing Save to be told
    // about it is one save later than that.
    await page.goto(`/admin/courses/${SUBJECT.slug}`);

    await expect(page.getByTestId('save-banner')).toHaveCount(0);
    const warnings = page.getByTestId('clash-warnings');
    await expect(warnings).toBeVisible();
    await expect(warnings).toContainText(EXPECTED_WARNINGS[0]!.course.title);
  });

  test('shows a block’s computed end date on opening it', async ({ page }) => {
    // #60. Computed and shown after the fact is half of AC 6 — the point of
    // showing it is to check the run before committing to it.
    await page.goto(`/admin/courses/${BLOCK.slug}`);

    await expect(page.getByTestId('block-end')).toContainText(fullDateLabel(BLOCK.dates.at(-1)!));
  });

  test('keeps the computed end date through a rejected save', async ({ page }) => {
    // The redisplay after a validation error is exactly when Jill is looking at
    // the dates she just picked, and is where the line used to disappear.
    // Refused by the parser rather than by the browser — `novalidate` is not
    // set, so a cleared required field never reaches the server at all.
    await page.goto(`/admin/courses/${BLOCK.slug}`);
    await page.locator('#ageMax').fill('');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.getByTestId('block-end')).toContainText(fullDateLabel(BLOCK.dates.at(-1)!));
  });

  test('offers a saved block only its own track’s meeting dates', async ({ page }) => {
    // #61. Every date outside the ticked track is an option that cannot be
    // right — refused on submit, which is a correct message a save too late.
    await page.goto(`/admin/courses/${BLOCK.slug}`);

    const track = BLOCK.days[0]!;
    const dates = trackColumn(SEEDED_SCHOOL_YEAR, track).map((meeting) => meeting.date);
    const offered = await page
      .locator('#blockStart option')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));

    expect(offered).toEqual(['', ...dates]);
    for (const other of runningTracks(SEEDED_SCHOOL_YEAR).filter((one) => one !== track)) {
      const foreign = trackColumn(SEEDED_SCHOOL_YEAR, other)
        .map((meeting) => meeting.date)
        .filter((date) => !dates.includes(date));
      expect(offered.some((date) => foreign.includes(date!)), other).toBe(false);
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

  test('saves a class with no instructor, and the list says one is wanted', async ({ page }) => {
    /*
     * #257. The save succeeding is the acceptance criterion — before this, a
     * class the school meant to run and had not staffed could not be typed in
     * at all. The public pages say nothing about the gap, correctly, so this
     * list is the only place it is visible, and it is the place Jill scans.
     */
    await ensureUnstaffedCourse(page);
    await page.goto('/admin/courses');

    await expect(page.getByTestId(`no-instructor-${UNSTAFFED.slug}`)).toBeVisible();
    // Only that class. Every other course names somebody, and a list that said
    // so about all of them would say nothing about any of them.
    await expect(page.locator('[data-testid^="no-instructor-"]')).toHaveCount(1);

    // And the form comes back with nothing picked rather than with a guess.
    await page.goto(`/admin/courses/${UNSTAFFED.slug}`);
    await expect(page.locator('#instructorSlug')).toHaveValue('');
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
    // Stages, days, the shape, the units and the rate are all unanswered, and
    // all five are said now.
    const form = page.locator('form[action="/admin/courses/new"]');
    await expect(form).toContainText('Tick at least one stage');
    await expect(form).toContainText('Tick the day track');
    await expect(form).toContainText('Say what shape the course runs as');
    await expect(form).toContainText('Tick at least one');
    await expect(form).toContainText('Pick which hourly rate');
    // Not the instructor (#257). An empty one is an answer — a class the school
    // means to run and has not staffed — so it is the one blank on this form
    // that draws no complaint.
    await expect(form).not.toContainText('Pick who teaches it');

    // And what was typed is still there — a rejected form does not empty itself.
    await expect(page.locator('#title')).toHaveValue('A class the suite never saves');
  });

  test('says the days complaint to the group, not to one box', async ({ page }) => {
    /*
     * #193 AC 3, and the umbrella's story 21. "Tick the day track this class
     * meets on" is not a complaint about Tuesday, so it hangs off the fieldset:
     * a screen reader announces it on entering the group, which is the only
     * moment it is any use. Read through `aria-describedby` rather than by
     * looking for the sentence on the page, because the sentence being *there*
     * is what the test above already proves — this one is about the wiring.
     */
    await page.goto('/admin/courses/new');
    await page.locator('#title').fill('A class the suite never saves');
    await page.locator('#description').fill('Typed, so the browser lets the form through.');
    await page.locator('#ageLabel').fill('Any age');
    await page.locator('#prerequisites').fill('None');
    await page.locator('#weeks').fill('14');
    await page.getByRole('button', { name: 'Save' }).click();

    const group = page.getByRole('group', { name: 'Meets on' });
    const description = await group.evaluate((node) =>
      (node.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => node.ownerDocument.getElementById(id)?.textContent ?? '')
        .join(' '),
    );
    expect(description).toContain('Tick the day track this class meets on.');
  });
});
