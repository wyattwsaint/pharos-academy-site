import { expect, test } from '@playwright/test';

import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { classPath } from '../src/lib/courses/views.js';
import { PEOPLE } from '../src/lib/people/person.js';

/**
 * #26's acceptance criteria, in a browser.
 *
 * The rules themselves — one list, an instructor derived from the catalogue, a
 * null bio staying null — are proved in vitest against real Postgres. What
 * needs a rendered page is only this: that a person with no bio and no
 * photograph comes out looking finished rather than broken, and that the name a
 * parent reads on the staff page is character-for-character the name they read
 * on the class page and in the timetable. Three surfaces, one row.
 *
 * Zero axe violations at all five widths is `accessibility.spec.ts`'s, where
 * `/staff` is one line on the surface list.
 */

/** Somebody the school has published no bio and no photograph for. AC 2. */
const UNWRITTEN = PEOPLE.find((person) => person.bio === null && person.photo === null)!;

/** Somebody who is leadership *and* teaches — the one row two sections show. */
const BOTH = 'george-jensen';

test.describe('the staff page', () => {
  test('renders a person with no bio and no photograph, and invents neither', async ({ page }) => {
    await page.goto('/staff');

    const entry = page.locator(`#${UNWRITTEN.slug}`);
    await expect(entry).toHaveCount(1);

    // What they *do* have: their name, their role, and what they teach.
    await expect(entry.getByRole('heading', { name: UNWRITTEN.name })).toBeVisible();
    await expect(entry.locator('.role')).toHaveText(UNWRITTEN.role);
    await expect(entry.locator('.staff-classes a').first()).toBeVisible();

    // And what they do not: no paragraph of filler, and no face standing in for
    // a photograph the school has not supplied (AC 4).
    await expect(entry.locator('.staff-bio')).toHaveCount(0);
    await expect(entry.locator('img')).toHaveCount(0);
  });

  test('puts no image of a person on the page at all, generated or otherwise', async ({ page }) => {
    await page.goto('/staff');

    // Slot 4 is blocked on the school supplying photographs of real consenting
    // adults, so the leadership portraits are empty tints and nothing else.
    await expect(page.locator('.people img')).toHaveCount(0);
    await expect(page.locator('.portrait')).toHaveCount(
      PEOPLE.filter((person) => person.leadershipRank !== null).length,
    );
  });

  test('shows one row in both sections rather than two rows saying the same thing', async ({
    page,
  }) => {
    await page.goto('/staff');

    const leadership = page.locator(`[data-section="staff-leadership"] #${BOTH}`);
    const teaching = page.locator(`[data-section="staff-instructors"] #${BOTH}`);
    await expect(leadership).toHaveCount(1);
    await expect(teaching).toHaveCount(1);

    // The same name from the same row, not two entries that could drift apart.
    const seeded = PEOPLE.find((person) => person.slug === BOTH)!;
    await expect(leadership.getByRole('heading', { name: seeded.name })).toBeVisible();
    await expect(teaching.getByRole('heading', { name: seeded.name })).toBeVisible();

    // And the role he is listed under is his leadership role in both places:
    // being an instructor is a fact about the catalogue, not a second title.
    await expect(teaching.locator('.role')).toHaveText(seeded.role);
  });

  test('links each instructor to every class they teach', async ({ page }) => {
    await page.goto('/staff');

    for (const course of CATALOGUE) {
      const link = page.locator(
        `[data-section="staff-instructors"] #${course.instructorSlug} a[href="${classPath(course.slug)}"]`,
      );
      await expect(link, course.slug).toHaveCount(1);
    }
  });
});

/**
 * AC 3, end to end: the class page, the timetable and the staff page print the
 * same name because they read the same row.
 */
test.describe('an instructor’s name', () => {
  const course = CATALOGUE.find((candidate) => candidate.slug === 'algebra-1')!;

  test('is the same on the class page, in the timetable and on the staff page', async ({
    page,
  }) => {
    await page.goto('/staff');
    const onStaff = (
      await page.locator(`#${course.instructorSlug} h3`).first().textContent()
    )?.trim();
    expect(onStaff).toBeTruthy();

    await page.goto(classPath(course.slug));
    await expect(page.locator('.coursefacts')).toContainText(onStaff!);

    await page.goto('/classes/by-day');
    await expect(
      page.locator(`[data-course="${course.slug}"] .slot-who`).first(),
    ).toHaveText(onStaff!);
  });
});
