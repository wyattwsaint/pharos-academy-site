import { expect, test } from '@playwright/test';

import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { classPath } from '../src/lib/courses/views.js';
import { PEOPLE } from '../src/lib/people/person.js';
import { SITE_CREDIT, STAFF_PATH } from '../src/lib/people/views.js';

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
  /**
   * #143: plainer headings, and nothing above or below them clearing its
   * throat. The absences are asserted alongside the headings because the
   * ticket is about what the page stopped saying as much as what it says.
   */
  test('says who these people are once, without a label or a preamble', async ({ page }) => {
    await page.goto(STAFF_PATH);

    const header = page.locator('[data-section="staff-header"]');
    await expect(header.getByRole('heading', { level: 1 })).toHaveText('Our Dedicated Staff');
    await expect(header.locator('.label')).toHaveCount(0);
    await expect(header.locator('.sub')).toHaveCount(0);

    const instructors = page.locator('[data-section="staff-instructors"]');
    await expect(instructors.getByRole('heading', { level: 2 })).toHaveText('Instructors');
    await expect(instructors.locator('.sub')).toHaveCount(0);

    // Every section still has its own heading, and no level is skipped
    // between them: h1, then an h2 per section, then a name per person.
    const levels = await page.locator('main :is(h1, h2, h3, h4, h5, h6)').evaluateAll((nodes) =>
      nodes.map((node) => Number(node.tagName[1])),
    );
    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    }

    // And the description still says who is on the page without echoing a
    // heading that is gone — asserted positively, because "does not contain
    // the old string" passes for an empty description too.
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    expect(description).toContain('the instructors who teach each class');
    expect(description).not.toContain('The people of Pharos Academy');
  });

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

    // One tint per leader the school has sent no photograph of — none today,
    // and the count rather than a boolean so that a fourth leader arriving
    // without one is measured rather than rounded to "at most one".
    const unphotographedLeaders = PEOPLE.filter(
      (person) => person.leadershipRank !== null && person.photo === null,
    );
    await expect(page.locator('div.portrait')).toHaveCount(unphotographedLeaders.length);

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

  test('credits the web designer, without making them a tenth instructor', async ({ page }) => {
    await page.goto(STAFF_PATH);

    const credit = page.locator('[data-section="staff-credit"]');
    await expect(credit).toHaveCount(1);
    await expect(credit.locator('.staff-credit')).toHaveText(SITE_CREDIT);

    // #150: no portrait, and outside both lists — the credit is a footnote to
    // the school's people, not one of them. Asserting where it *isn't* is the
    // point: a line reading "Website by …" under the Instructors heading would
    // pass a bare "the text is on the page" check.
    await expect(credit.locator('img')).toHaveCount(0);
    await expect(
      page.locator(`[data-section="staff-instructors"] .staff-credit`),
    ).toHaveCount(0);
    await expect(
      page.locator(`[data-section="staff-leadership"] .staff-credit`),
    ).toHaveCount(0);
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
