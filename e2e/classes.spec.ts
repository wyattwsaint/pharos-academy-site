import { expect, test, type Page } from '@playwright/test';

import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { coursePrice, priceSummary } from '../src/lib/courses/pricing.js';
import { contactHours } from '../src/lib/courses/schedule.js';

/**
 * #22's acceptance criteria, in a browser.
 *
 * The pure rules — the price formula, the age axis, the lane packing — are
 * vitest's, over the real catalogue. What is asserted here is only what needs a
 * rendered page to be true: that all four surfaces really do read the one
 * source, that the timetable's overlaps are *visible* rather than merely
 * modelled, and that the Wednesday 10:40 slot carries five electives with
 * nothing on the page calling that a problem.
 */

const DESKTOP = { width: 1440, height: 900 };

const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;

/** The bounding box of a class in the by-day grid. */
async function slotBox(page: Page, day: string, slug: string) {
  const box = await page.locator(`[data-day="${day}"] [data-course="${slug}"]`).boundingBox();
  if (!box) throw new Error(`No slot for ${slug} on ${day}`);
  return box;
}

test.describe('the four surfaces', () => {
  test('are all reachable, and By Age is what /classes itself renders', async ({ page }) => {
    // Not a redirect to /classes/by-age: ages are the primary axis, and the
    // primary axis must not be the one view without an address.
    const response = await page.goto('/classes');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/classes');
    await expect(page.locator('[data-section="by-age"]')).toHaveCount(1);
    await expect(page.locator('.viewnav-link[aria-current="page"]')).toHaveText('By age');
  });

  test('switch between one another', async ({ page }) => {
    await page.goto('/classes');
    await page.locator('.viewnav-link', { hasText: 'By day' }).click();
    await expect(page.locator('[data-section="by-day"]')).toHaveCount(1);

    await page.locator('.viewnav-link', { hasText: 'Full descriptions' }).click();
    await expect(page.locator('[data-section="full-descriptions"]')).toHaveCount(1);

    await page.locator('.viewnav-link', { hasText: 'By age' }).click();
    await expect(page.locator('[data-section="by-age"]')).toHaveCount(1);
  });

  test('render all nineteen classes from the one source', async ({ page }) => {
    // AC 1. Every course, on every list surface — the four ways a parent finds
    // a class, agreeing because there is only one source behind them.
    for (const path of ['/classes', '/classes/by-day', '/classes/full-descriptions']) {
      await page.goto(path);
      for (const course of CATALOGUE) {
        await expect(
          page.locator(`[data-course="${course.slug}"]`).first(),
          `${course.title} on ${path}`,
        ).toHaveCount(1);
      }
    }
  });
});

test.describe('the timetable', () => {
  test('draws the two real overlapping pairs as overlapping, not consecutive', async ({ page }) => {
    // AC 3, and the reason the ticket exists. Both pairs are on the Monday
    // track — Algebra 1 also runs Wednesday, but Kingdom Math does not.
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes/by-day');

    for (const [a, b] of [
      ['god-made-everything', 'principles-of-drawing'],
      ['kingdom-math', 'algebra-1'],
    ] as const) {
      const first = await slotBox(page, 'Monday', a);
      const second = await slotBox(page, 'Monday', b);

      // Vertical extents genuinely intersect: the later class starts before
      // the earlier one has finished, and that is visible on the page.
      expect(second.y, `${a} / ${b}`).toBeLessThan(first.y + first.height);
      expect(first.y).toBeLessThan(second.y + second.height);
      // And they are side by side rather than stacked, which is what makes the
      // overlap readable rather than a collision of two boxes.
      const apart = Math.abs(first.x - second.x);
      expect(apart, `${a} / ${b} share a lane`).toBeGreaterThan(0);
    }
  });

  test('is drawn to the clock — a 90-minute class is taller than a 60-minute one', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes/by-day');

    const ninety = await slotBox(page, 'Monday', 'kingdom-math'); // 10:40-12:10
    const sixty = await slotBox(page, 'Monday', 'algebra-1'); // 11:20-12:20
    expect(ninety.height).toBeGreaterThan(sixty.height * 1.3);
  });

  test('gives the Wednesday 10:40 slot five electives and calls it nothing', async ({ page }) => {
    // AC 4. Oversubscription by design (CONTEXT.md, "clash") — five electives
    // that run in different parts of the year. Never an error, never a warning.
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes/by-day');

    const wednesday = page.locator('[data-day="Wednesday"]');
    const atTen40 = wednesday.locator('.slot[data-start="640"]');
    await expect(atTen40).toHaveCount(5);

    const lanes = await atTen40.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-lane')),
    );
    expect(new Set(lanes).size).toBe(5);

    const text = (await wednesday.textContent()) ?? '';
    expect(text).not.toMatch(/clash|conflict|error|warning|problem|double-?book/i);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('draws no Tuesday, because an empty day track is complete', async ({ page }) => {
    await page.goto('/classes/by-day');
    await expect(page.locator('[data-day="Tuesday"]')).toHaveCount(0);
    await expect(page.locator('[data-day="Monday"]')).toHaveCount(1);
    await expect(page.locator('[data-day="Wednesday"]')).toHaveCount(1);
    await expect(page.locator('[data-day="Thursday"]')).toHaveCount(1);
  });
});

test.describe('the age axis', () => {
  test('shows Algebra 1 in every band rather than excluding it for want of a range', async ({
    page,
  }) => {
    // AC 5. Its gate is a prerequisite, not an age, and a filter that needs a
    // number would drop the course with the widest door.
    await page.goto('/classes');

    const bands = page.locator('.ageband');
    const count = await bands.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i += 1) {
      await expect(
        bands.nth(i).locator('[data-course="algebra-1"]'),
        `band ${i}`,
      ).toHaveCount(1);
    }
  });

  test('leaves no band empty and no class unreachable', async ({ page }) => {
    await page.goto('/classes');
    const shown = await page.locator('.classcard[data-course]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-course')),
    );
    expect(new Set(shown).size).toBe(CATALOGUE.length);
  });
});

test.describe('a class description', () => {
  test('opens on hover, sticks on click, and closes on Escape', async ({ page }) => {
    // The same contract as the H.O.P.E. cards, because it is the same element
    // (#21 AC 6) — two behaviours that are almost the same is how a client
    // finds the inconsistent one.
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes');

    const cell = page.locator('.classcard').first();
    const trigger = cell.locator('[data-disclosure-trigger]');
    const panel = cell.locator('[data-disclosure-panel]');

    await expect(panel).not.toBeVisible();
    await trigger.hover();
    await expect(panel).toBeVisible();

    await page.mouse.move(2, 2);
    await expect(panel).not.toBeVisible();

    await trigger.hover();
    await trigger.click();
    await page.mouse.move(2, 2);
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
  });

  test('keeps its link to the class page reachable from the keyboard', async ({ page }) => {
    // Tab from the trigger must land on the link inside the panel — closing on
    // the trigger's blur would hide it at the exact moment focus arrived.
    await page.setViewportSize(DESKTOP);
    await page.goto('/classes');

    const cell = page.locator('.classcard').first();
    await cell.locator('[data-disclosure-trigger]').focus();
    await page.keyboard.press('Tab');

    const link = cell.locator('.classcard-more');
    await expect(link).toBeFocused();
    await expect(link).toBeVisible();
  });
});

test.describe('a class’s own page', () => {
  test('carries the text, prerequisites, instructor, hours and both fees', async ({ page }) => {
    // AC 6 — this is the page Jill links to when she means one class, so it
    // has to stand alone. Algebra 1 is the course that carries every field.
    const course = bySlug('algebra-1');
    await page.goto(`/classes/${course.slug}`);

    await expect(page.locator('h1')).toHaveText(course.title);
    const facts = page.locator('.coursefacts');
    await expect(facts).toContainText('Elementary Algebra');
    await expect(facts).toContainText('Proficiency in core arithmetic skills');
    await expect(facts).toContainText(course.instructor);
    await expect(facts).toContainText(`${contactHours(course)} hours`);
    await expect(facts).toContainText('$50 for test scoring');
    await expect(facts).toContainText('$420/semester, $840/year ($15/hour)');
  });

  test('prints a materials fee where the school charges one', async ({ page }) => {
    await page.goto('/classes/beginner-latin-grades-5-6');
    await expect(page.locator('.coursefacts')).toContainText('$25 per year');
  });

  test('answers 404 for a slug that is not a class', async ({ page }) => {
    // Rather than an empty page, which would claim the school offers it.
    const response = await page.goto('/classes/underwater-basket-weaving');
    expect(response?.status()).toBe(404);
  });

  test('is reachable from every list surface', async ({ page }) => {
    await page.goto('/classes/by-day');
    await page.locator('[data-course="kingdom-math"]').first().click();
    await expect(page.locator('h1')).toContainText('Kingdom Math');

    await page.goto('/classes/full-descriptions');
    await page.locator('.coursefull[data-course="kingdom-math"] a.btn').click();
    await expect(page.locator('h1')).toContainText('Kingdom Math');
  });
});

test.describe('the prices', () => {
  test('agree across the surfaces, because they are computed from one source', async ({ page }) => {
    // AC 2's browser half: the same computed figure wherever it is printed.
    // The formula itself is proven against the school's published costs in
    // `pricing.test.ts`.
    await page.goto('/classes');
    for (const course of CATALOGUE) {
      await expect(
        page.locator(`.classcard[data-course="${course.slug}"]`).first(),
        course.title,
      ).toContainText(priceSummary(course));
    }

    for (const course of CATALOGUE) {
      await page.goto(`/classes/${course.slug}`);
      const price = coursePrice(course);
      await expect(page.locator('.coursefacts'), course.title).toContainText(
        `$${price.ratePerHour}/hour`,
      );
    }
  });
});
