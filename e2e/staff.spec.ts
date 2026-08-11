import { expect, test } from '@playwright/test';

import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { classPath } from '../src/lib/courses/views.js';
import { PEOPLE } from '../src/lib/people/person.js';
import { STAFF_PATH } from '../src/lib/people/views.js';

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
 * `/about/staff` is one line on the surface list.
 */

/** Somebody the school has published no bio and no photograph for. AC 2. */
const UNWRITTEN = PEOPLE.find((person) => person.bio === null && person.photo === null)!;

/** Somebody who is leadership *and* teaches — the one row two sections show. */
const BOTH = 'george-jensen';

/**
 * The four the school supplied (#99), with the section each one's face is in.
 *
 * George is leadership *and* an instructor, and his portrait runs once, in
 * leadership — the row is printed twice but the face is not.
 */
const PHOTOGRAPHED = PEOPLE.filter((person) => person.photo !== null).map((person) => ({
  ...person,
  section: person.leadershipRank === null ? 'staff-instructors' : 'staff-leadership',
}));

test.describe('the staff page', () => {
  test('renders a person with no bio and no photograph, and invents neither', async ({ page }) => {
    await page.goto(STAFF_PATH);

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

  test('renders the four supplied portraits, each naming who is in it', async ({ page }) => {
    await page.goto(STAFF_PATH);

    // #99: the photographs the school sent, upright and square in their frame.
    // `naturalWidth` is what separates "the tag is on the page" from "the file
    // is actually there" — a typo'd path renders as an img with zero width.
    for (const person of PHOTOGRAPHED) {
      const portrait = page.locator(
        `[data-section="${person.section}"] #${person.slug} img.portrait`,
      );
      await expect(portrait, person.name).toHaveCount(1);
      await expect(portrait).toHaveAttribute('src', person.photo!);
      await expect(portrait).toHaveAttribute('alt', person.name);

      // These load lazily, so they have no natural size until they are on
      // screen — scrolling to them is what makes the next three assertions
      // measure a decoded image rather than an empty box.
      await portrait.scrollIntoViewIfNeeded();
      const box = await portrait.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        return {
          w: img.naturalWidth,
          h: img.naturalHeight,
          rendered: img.getBoundingClientRect(),
        };
      });
      expect(box.w, person.name).toBeGreaterThan(0);
      expect(box.w, person.name).toBe(box.h);
      // Square in the frame too: a 1:1 file in a non-square box is a stretched
      // face, which is the failure a bare "it renders" assertion sails past.
      expect(Math.abs(box.rendered.width - box.rendered.height), person.name).toBeLessThan(1);
    }
  });

  test('leaves the people without a photograph as they were', async ({ page }) => {
    await page.goto(STAFF_PATH);

    // No stand-in face anywhere: exactly the four supplied photographs, and no
    // more. Leadership keeps its empty tint, so the row of three stays a row of
    // three; the instructors carry no frame at all.
    await expect(page.locator('img.portrait')).toHaveCount(PHOTOGRAPHED.length);

    const unphotographedLeader = PEOPLE.find(
      (person) => person.leadershipRank !== null && person.photo === null,
    );
    const tints = page.locator('div.portrait');
    await expect(tints).toHaveCount(unphotographedLeader ? 1 : 0);

    await expect(page.locator(`[data-section="staff-instructors"] #${UNWRITTEN.slug} img`))
      .toHaveCount(0);
  });

  test('shows one row in both sections rather than two rows saying the same thing', async ({
    page,
  }) => {
    await page.goto(STAFF_PATH);

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
    await page.goto(STAFF_PATH);

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
    await page.goto(STAFF_PATH);
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
