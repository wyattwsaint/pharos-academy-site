import { expect, test, type Page } from '@playwright/test';

import { SEEDED_SCHOOL_YEAR } from '../src/lib/calendar/year.js';
import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { courseMeetings } from '../src/lib/courses/meetings.js';
import { coursePrice, priceSummary } from '../src/lib/courses/pricing.js';
import { SEEDED_MONEY_SETTINGS } from '../src/lib/money/settings.js';
import { contactHours } from '../src/lib/courses/schedule.js';
import { seededName } from '../src/lib/people/person.js';
import { ensureUnstaffedCourse, UNSTAFFED } from './unstaffed-course.js';

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

  test('render every class from the one source', async ({ page }) => {
    // AC 1. Every course, on every list surface — the four ways a parent finds
    // a class, agreeing because there is only one source behind them.
    for (const path of ['/classes', '/classes/by-day', '/classes/descriptions']) {
      await page.goto(path);
      for (const course of CATALOGUE) {
        await expect(
          page.locator(`[data-course="${course.slug}"]`).first(),
          `${course.title} on ${path}`,
        ).toHaveCount(1);
      }
    }
  });

  test('state no class count in the heading or the lede', async ({ page }) => {
    // #247, reversing what #138 left. The heading quoted `courses.length` and
    // the lede quoted it again, so the number was always true and was still the
    // site saying how big the school is. Asserted on what rendered rather than
    // on the source, because a count is a count whether it was typed or derived
    // — and the classes are still all there, which is what the test above says.
    await page.goto('/classes');
    await expect(page.locator('h1')).toHaveText('Our Classes, by the Age They Are Written For');
    await expect(page.locator('[data-section="classes-header"] .sub')).not.toHaveText(/\d/);

    await page.goto('/classes/descriptions');
    const listed = await page.locator('[data-section="full-descriptions"] [data-course]').count();
    // The seed is the floor: the course editor can add rows past it
    // (`live-routes.ts`), and a page showing more of them is right, not broken.
    expect(listed).toBeGreaterThanOrEqual(CATALOGUE.length);
    await expect(page.locator('h1')).toHaveText('Every Class, in Full');
    await expect(page.locator('[data-section="classes-header"] .sub')).not.toHaveText(/\d/);
  });

  test('publish no class count in the markup either', async ({ page }) => {
    // #247. `numberOfItems` was the count the heading used to state, in the one
    // place a crawler reads. The list itself is untouched: what is dropped is
    // the assertion of a total, not the classes.
    for (const path of ['/classes', '/classes/by-day', '/classes/descriptions']) {
      await page.goto(path);
      const graphs = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((tags) => tags.map((tag) => JSON.parse(tag.textContent ?? '{}')));
      const lists = graphs
        .flatMap((graph) => (graph['@graph'] ?? [graph]) as Record<string, unknown>[])
        .filter((node) => node['@type'] === 'ItemList');

      expect(lists, path).toHaveLength(1);
      expect(lists[0], path).not.toHaveProperty('numberOfItems');
      expect((lists[0].itemListElement as unknown[]).length, path).toBeGreaterThanOrEqual(
        CATALOGUE.length,
      );
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
    // Every seeded class is reachable, which is the claim. Not "exactly these
    // and no others": the admin adds courses, and this suite adds one itself
    // (`unstaffed-course.ts`), so a total would be an assertion about the run
    // rather than about the page.
    const shownOnce = new Set(shown);
    for (const course of CATALOGUE) {
      expect(shownOnce, course.title).toContain(course.slug);
    }
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
    // The name comes from the one list of people (#26), not from the course.
    await expect(facts).toContainText(seededName(course.instructorSlug!));
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

  test('says when the class meets, and opens every date behind one press', async ({ page }) => {
    // #233. The dates themselves are proved in `meetings.test.ts`; what needs a
    // browser is that the summary is readable without pressing anything and the
    // list is not, which is the whole shape of the section.
    const course = bySlug('the-virtue-of-kindness');
    const meetings = courseMeetings(SEEDED_SCHOOL_YEAR, course);
    await page.goto(`/classes/${course.slug}`);

    const section = page.locator('[data-section="class-dates"]');
    await expect(section.locator('.coursedates-summary')).toHaveText(meetings.summary!);
    await expect(section.locator('.coursedates-months')).toBeHidden();

    await section.locator('summary').click();
    await expect(section.locator('.coursedates-months')).toBeVisible();
    for (const month of meetings.months) {
      await expect(section).toContainText(month.heading);
      for (const meeting of month.dates) {
        await expect(section.locator(`time[datetime="${meeting.date}"]`)).toHaveText(meeting.label);
      }
    }
  });

  test('opens its dates from the keyboard, and they are readable there too', async ({ page }) => {
    // The longest list the page can hold — Algebra 1's fifty-six dates over two
    // tracks — because a keyboard is how the parent who most needs the list
    // reads it, and a short block would not exercise the months.
    const meetings = courseMeetings(SEEDED_SCHOOL_YEAR, bySlug('algebra-1'));
    await page.goto('/classes/algebra-1');
    const section = page.locator('[data-section="class-dates"]');

    await section.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(section.locator('.coursedates-months')).toBeVisible();

    const first = meetings.months[0]!;
    const last = meetings.months.at(-1)!;
    await expect(section).toContainText(first.heading);
    await expect(section).toContainText(last.heading);
    await expect(section.locator(`time[datetime="${first.dates[0]!.date}"]`)).toBeVisible();
    await expect(section.locator(`time[datetime="${last.dates.at(-1)!.date}"]`)).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(section.locator('.coursedates-months')).toBeHidden();
  });

  test.describe('with no JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('still says when the class meets', async ({ page }) => {
      // The summary line is the answer to the August question, so it may not
      // depend on a script. Only the full list is behind the disclosure, and a
      // native `details` opens without one anyway.
      const course = bySlug('introduction-to-church-and-bible-history');
      await page.goto(`/classes/${course.slug}`);

      await expect(page.locator('[data-section="class-dates"] .coursedates-summary')).toHaveText(
        courseMeetings(SEEDED_SCHOOL_YEAR, course).summary!,
      );
    });
  });

  test('shows a fall class no spring date, and a spring class no fall date', async ({ page }) => {
    // The enrolment unit decides the dates, which is the reason the section
    // could not have been a link to the day track's column.
    for (const slug of ['drawing-and-painting-grades-5-8', 'drawing-and-painting-grades-2-4']) {
      const { dates } = courseMeetings(SEEDED_SCHOOL_YEAR, bySlug(slug));
      await page.goto(`/classes/${slug}`);
      await page.locator('[data-section="class-dates"] summary').click();

      const shown = await page
        .locator('[data-section="class-dates"] time')
        .evaluateAll((times) => times.map((time) => time.getAttribute('datetime')));
      expect(shown, slug).toEqual(dates);
    }
  });

  test('is reachable from every list surface', async ({ page }) => {
    await page.goto('/classes/by-day');
    await page.locator('[data-course="kingdom-math"]').first().click();
    await expect(page.locator('h1')).toContainText('Kingdom Math');

    await page.goto('/classes/descriptions');
    await page.locator('.coursefull[data-course="kingdom-math"] a.btn').click();
    await expect(page.locator('h1')).toContainText('Kingdom Math');
  });
});

/**
 * A class the school has scheduled and not staffed (#257).
 *
 * The absence is rendered rather than filled: no instructor line, and — the
 * part that is easy to get wrong — no label with nothing beside it, no dash and
 * no "TBA". A parent reading it learns the class runs, which is the true thing
 * the school knows about it today.
 *
 * The course is added through the admin, because no seeded one is unstaffed and
 * this ticket changes no data. That is why these skip against a deployment.
 */
test.describe('a class with no instructor', () => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'adds a course to the database');

  test('names nobody on its own page, and leaves no empty row where a name goes', async ({
    page,
  }) => {
    await page.goto(await ensureUnstaffedCourse(page));

    const facts = page.locator('.coursefacts');
    await expect(facts).toBeVisible();
    // Not "Instructor: —". The row is simply not there, the way an unfilled
    // required text is not there.
    await expect(facts.locator('dt', { hasText: /^Instructor$/ })).toHaveCount(0);
    // And no row anywhere on the list is a label with nothing under it.
    const emptyValues = await facts
      .locator('dd')
      .evaluateAll((cells) => cells.filter((cell) => (cell.textContent ?? '').trim() === '').length);
    expect(emptyValues).toBe(0);
    // The class itself is still fully described — this is a staffing gap, not
    // a broken page.
    await expect(facts).toContainText('Meets');
    await expect(page.locator('h1')).toHaveText(UNSTAFFED.title);
  });

  test('names nobody in the full descriptions either', async ({ page }) => {
    await ensureUnstaffedCourse(page);
    await page.goto('/classes/descriptions');

    const entry = page.locator(`.coursefull[data-course="${UNSTAFFED.slug}"]`);
    await expect(entry).toBeVisible();
    await expect(entry.locator('dt', { hasText: /^Instructor$/ })).toHaveCount(0);
    // The surfaces agree, which is #22's whole claim: a class named on one and
    // unnamed on the other would be the drift this catalogue exists to end.
    // Everything else about it is still printed here.
    expect(await entry.locator('.coursefacts dd').count()).toBeGreaterThan(0);
  });

  test('carries no who-teaches-it line in the timetable', async ({ page }) => {
    await ensureUnstaffedCourse(page);
    await page.goto('/classes/by-day');

    const slot = page.locator(`[data-day="${UNSTAFFED.day}"] [data-course="${UNSTAFFED.slug}"]`);
    await expect(slot).toBeVisible();
    await expect(slot.locator('.slot-who')).toHaveCount(0);
    // Beside a staffed class in the same column, which is what makes the
    // absence a rendering decision rather than a missing component.
    await expect(
      page.locator(`[data-day="${UNSTAFFED.day}"] [data-course="backyard-botany"] .slot-who`),
    ).toHaveCount(1);
  });
});

test.describe('the prices', () => {
  test('agree across the surfaces, because they are computed from one source', async ({ page }) => {
    // AC 2's browser half: the same computed figure wherever it is printed.
    // The formula itself is proven against the school's published costs in
    // `pricing.test.ts`.
    //
    // Priced at the seeded rates, which is what the server's database holds
    // until somebody edits the money settings — the same figures the school
    // publishes today (#29).
    await page.goto('/classes');
    for (const course of CATALOGUE) {
      await expect(
        page.locator(`.classcard[data-course="${course.slug}"]`).first(),
        course.title,
      ).toContainText(priceSummary(course, SEEDED_MONEY_SETTINGS.rates));
    }

    for (const course of CATALOGUE) {
      await page.goto(`/classes/${course.slug}`);
      const price = coursePrice(course, SEEDED_MONEY_SETTINGS.rates);
      await expect(page.locator('.coursefacts'), course.title).toContainText(
        `$${price.ratePerHour}/hour`,
      );
    }
  });
});
