import { expect, test, type Page } from '@playwright/test';

import { CALENDAR_PATH } from '../src/lib/calendar/views.js';
import { schoolToday } from '../src/lib/calendar/year.js';
import { jsonLdProblems } from '../src/lib/structured-data.test-helper.js';
import { ensureUnstaffedCourse } from './unstaffed-course.js';

/**
 * The structured data, as a browser and a crawler actually receive it (#30 AC 6,
 * #151).
 *
 * The nodes' shapes are unit-tested; what only a request shows is that they are
 * emitted at all, that the whole graph parses as JSON after going through the
 * template, and that every page describes the *same* school rather than one per
 * page — which is what a regenerated `@id` would silently do.
 *
 * One script per page carrying one `@graph`, so these read the graph rather than
 * a bare node.
 */
const PAGES = ['/', '/about', '/admissions'];

/**
 * A node as it comes back off the wire: a `@type` and whatever else the emitter
 * put on it. The shapes below name only what these tests actually read.
 */
type LdNode = { '@type': string; '@id': string };
type SchoolNode = LdNode & { telephone: string; email: string; areaServed: unknown };
type CourseNode = LdNode & {
  name: string;
  provider: { '@id': string };
  offers: unknown[];
  hasCourseInstance: {
    courseSchedule: { byDay: string[] };
    instructor?: { name: string };
  };
};
type EventNode = LdNode & { name: string; startDate: string };
type BreadcrumbNode = LdNode & { itemListElement: { name: string; position: number }[] };

/** The page's graph, parsed. Fails the test if there is not exactly one script. */
async function graphOf(page: Page): Promise<LdNode[]> {
  const blocks = page.locator('script[type="application/ld+json"]');
  await expect(blocks).toHaveCount(1);
  const parsed = JSON.parse((await blocks.textContent()) ?? '');
  expect(parsed['@context']).toBe('https://schema.org');
  // The generated graph must be free of the four silent faults, in the rendered
  // page and not only in the unit tests.
  expect(jsonLdProblems(parsed)).toEqual([]);
  return parsed['@graph'];
}

function nodesOfType<T extends LdNode>(graph: LdNode[], type: string): T[] {
  return graph.filter((node) => node['@type'] === type) as T[];
}

test.describe('the school’s structured data', () => {
  for (const path of PAGES) {
    test(`${path} carries one parseable School node`, async ({ page }) => {
      await page.goto(path);
      const [school] = nodesOfType<SchoolNode>(await graphOf(page), 'School');

      expect(school).toBeTruthy();
      // Read from the school details row, so what is asserted is that it is
      // populated rather than which value it holds.
      expect(String(school!.telephone)).not.toHaveLength(0);
      expect(String(school!.email)).toContain('@');
      expect(JSON.stringify(school!.areaServed)).toContain('County');
    });
  }

  test('describes one school across pages, not one per page', async ({ page }) => {
    const ids: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      ids.push(nodesOfType<SchoolNode>(await graphOf(page), 'School')[0]!['@id']);
    }

    expect(new Set(ids).size).toBe(1);
  });
});

test.describe('a class’s structured data', () => {
  test('describes the class it is on, and its schedule and price', async ({ page }) => {
    await page.goto('/classes/beginner-latin-grades-5-6');
    const graph = await graphOf(page);
    const [course] = nodesOfType<CourseNode>(graph, 'Course');

    expect(course).toBeTruthy();
    // The heading on the page and the name in the markup are one string.
    expect(await page.locator('h1').first().textContent()).toBe(course!.name);
    expect(course!.hasCourseInstance.courseSchedule.byDay.length).toBeGreaterThan(0);
    expect(course!.offers.length).toBeGreaterThan(0);
    // The school by reference — the same entity the page's School node declares.
    expect(course!.provider['@id']).toBe(nodesOfType(graph, 'School')[0]!['@id']);
  });

  test('claims no instructor for a class the school has not staffed', async ({ page }) => {
    /*
     * #257, and the reason it is asserted in a browser as well as in
     * `structured-data.test.ts`: the page and the markup are supposed to be one
     * decision, so what has to be checked here is that the *rendered* page
     * prints no name and the *rendered* graph carries none — a crawler holding
     * a teacher the page never mentioned is the failure, and only a request
     * shows both halves at once.
     */
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'adds a course to the database');
    const path = await ensureUnstaffedCourse(page);
    await page.goto(path);

    const [course] = nodesOfType<CourseNode>(await graphOf(page), 'Course');
    expect(course).toBeTruthy();
    expect(course!.hasCourseInstance).not.toHaveProperty('instructor');
    await expect(page.locator('.coursefacts dt', { hasText: /^Instructor$/ })).toHaveCount(0);
  });
});

test.describe('the events’ structured data', () => {
  test('describes the upcoming subset of what the grid draws', async ({ page }) => {
    await page.goto(CALENDAR_PATH);
    const events = nodesOfType<EventNode>(await graphOf(page), 'Event');
    // The title alone: the cell prints the time beside it (#234), and what a
    // crawler is given as the event's `name` is the name of the thing.
    const shown = page.locator('[data-section="calendar-months"] .one-off-name');

    /*
     * The grid draws the whole year, past one-offs included, because a cell says
     * its own date (#186). The markup describes what is still ahead, because a
     * crawler has no cell and last spring's concert offered as though it were on
     * is a wrong claim about today. So the two are counted against each other
     * through that boundary rather than directly: the markup is exactly the
     * upcoming subset of what the grid draws — not a node fewer, which an
     * under-emitting builder would be, and not a node more.
     *
     * Skipped rather than passed on nothing when the calendar is empty. Which
     * events are on is no longer knowable from the repository — most of them
     * arrive from the school's own Google calendar overnight (#153) — so the
     * guard has to be here, and it is a skip on the report rather than a silent
     * zero-against-zero.
     */
    const drawn = await page
      .locator('[data-section="calendar-months"] .one-off')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) => node.querySelector('.one-off-panel time')?.getAttribute('datetime') ?? null,
        ),
      );
    test.skip(drawn.length === 0, 'Nothing is on the calendar, so there is nothing to describe.');

    const today = schoolToday(new Date());
    const upcoming = drawn.filter((date): date is string => date !== null && date >= today);
    expect(events).toHaveLength(upcoming.length);

    for (const event of events) {
      expect(await shown.filter({ hasText: event.name }).count()).toBeGreaterThan(0);
      expect(String(event.startDate)).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(String(event.startDate).slice(0, 10) >= today, event.name).toBe(true);
    }
  });
});

test.describe('breadcrumbs', () => {
  test('a page below the top level says where it sits', async ({ page }) => {
    await page.goto('/current-families/policies');
    const [crumbs] = nodesOfType<BreadcrumbNode>(await graphOf(page), 'BreadcrumbList');

    expect(crumbs!.itemListElement.map((item) => item.name)).toEqual([
      'Home',
      'Current Families',
      'Policies',
    ]);
    expect(crumbs!.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
  });

  test('the home page claims no trail', async ({ page }) => {
    await page.goto('/');
    expect(nodesOfType(await graphOf(page), 'BreadcrumbList')).toHaveLength(0);
  });
});
