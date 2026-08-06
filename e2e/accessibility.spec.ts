import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { SUPPORT_PATH } from '../src/lib/about/story.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';
import { CALENDAR_PATH, CURRENT_FAMILIES_PATH } from '../src/lib/current-families/section.js';
import { STAFF_PATH } from '../src/lib/people/views.js';
import { POLICIES_PATH } from '../src/lib/policies/views.js';
import { TEACH_PATH } from '../src/lib/teach/teach.js';

/**
 * WCAG 2.2 AA is a hard target (spec #18 §"Accessibility"), and the acceptance
 * criteria are inherited from the prototype's own audit: zero axe violations
 * and no horizontal overflow at each of these widths. The prototype achieved
 * it; the build is not allowed to regress it.
 *
 * The homepage is checked in three states — as it loads, with a H.O.P.E. card
 * open, and with a class description open (#21 AC 1) — because the open state
 * is the one that can actually fail: the card is a light panel on the navy
 * band, it floats over its neighbours on desktop, and below 620px it spans two
 * columns and is anchored to its own side of the row. That last arrangement is
 * precisely how a panel ends up hanging off the viewport.
 *
 * All four catalogue surfaces are measured too (#22's last acceptance
 * criterion). The timetable is the interesting one: on a phone it scrolls
 * sideways inside its own box rather than squeezing its lanes, so what is
 * asserted is that the *document* does not overflow — which is what a parent
 * actually experiences — while the grid's own box may.
 */
const WIDTHS = [390, 768, 834, 1024, 1440];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Open the first H.O.P.E. card and leave it stuck open. */
async function openHopeCard(page: Page) {
  const cell = page.locator('[data-disclosure-group="hope"] [data-disclosure-cell]').first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

/** Open the first class description, which expands inside its own grid cell. */
async function openClassPanel(page: Page) {
  const cell = page.locator('[data-disclosure-group="classes"] [data-disclosure-cell]').first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

/** Open the first card on the By Age surface. */
async function openCatalogueCard(page: Page) {
  const cell = page.locator('.classcard').first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

/** Open the refund terms on Admissions — the one long block that expands. */
async function openRefundTerms(page: Page) {
  await page.locator('.refunds summary').click();
  await expect(page.locator('.refunds[open]')).toBeVisible();
}

const noop = async (_page: Page) => {};

/**
 * Every public surface, in every state worth measuring.
 *
 * One list, so a page added to it is measured at all five widths by
 * construction rather than by somebody remembering to copy a block.
 */
const SURFACES = [
  { name: 'the home page', path: '/', state: 'closed', open: noop },
  { name: 'the home page', path: '/', state: 'with a H.O.P.E. card open', open: openHopeCard },
  {
    name: 'the home page',
    path: '/',
    state: 'with a class description open',
    open: openClassPanel,
  },
  { name: 'classes by age', path: '/classes', state: 'closed', open: noop },
  {
    name: 'classes by age',
    path: '/classes',
    state: 'with a description open',
    open: openCatalogueCard,
  },
  { name: 'classes by day', path: '/classes/by-day', state: 'closed', open: noop },
  {
    name: 'the full descriptions',
    path: '/classes/descriptions',
    state: 'closed',
    open: noop,
  },
  { name: 'a class page', path: '/classes/algebra-1', state: 'closed', open: noop },
  // #26. Eight of the eleven people on it have no bio and no photograph, so
  // this is also where "an absent bio renders correctly" is measured at every
  // width rather than only asserted in one.
  { name: 'the staff page', path: STAFF_PATH, state: 'closed', open: noop },
  // #27 AC 5. The list carries dates, links out and PDF links, and it is the
  // one surface whose length is decided by how much the school has posted.
  { name: 'the news page', path: NEWS_PATH, state: 'closed', open: noop },
  // #28 AC 8. A list of documents, each with a description, a date and a
  // download — and the one page a parent is sent to from a printed handbook.
  { name: 'the policies page', path: POLICIES_PATH, state: 'closed', open: noop },
  // #29 AC 8. The longest piece of prose on the site, a numbered list, a
  // three-column figure list that stacks on a phone, and a `<details>` — and
  // the page a family reads immediately before committing money, so a layout
  // that fails at one width fails at the worst possible moment.
  { name: 'the admissions page', path: '/admissions', state: 'closed', open: noop },
  {
    name: 'the admissions page',
    path: '/admissions',
    state: 'with the refund terms open',
    open: openRefundTerms,
  },
  // #30 AC 8. Two cards and a paragraph — short, and measured all the same,
  // because it is a nav destination and the nav is on every page.
  { name: 'the current families page', path: CURRENT_FAMILIES_PATH, state: 'closed', open: noop },
  /*
   * #23 AC 7. Two 30-row tables of five columns each, which is by a distance
   * the densest thing on the site — and the one surface that scrolls sideways
   * inside its own box on a phone rather than squeezing its columns, exactly as
   * the timetable does. The document must not overflow even where the table's
   * own box does, which is what a parent actually experiences.
   */
  { name: 'the calendar page', path: CALENDAR_PATH, state: 'closed', open: noop },
  // #30 AC 8. Two description lists, a two-column statement grid that stacks,
  // and three long essay paragraphs — the page that absorbed three Wix pages,
  // so it is also the longest one a 301 can land somebody part-way down.
  { name: 'the about page', path: '/about', state: 'closed', open: noop },
  // #30 AC 8. The only public page with a form on it — five checkboxes, a
  // select, an error state and a status line — and forms are where axe finds
  // real violations rather than cosmetic ones.
  { name: 'the support page', path: SUPPORT_PATH, state: 'closed', open: noop },
  // #30 AC 8. Short, and off the parent path — but a nav-less page is exactly
  // the one that stops being measured.
  { name: 'the teach page', path: TEACH_PATH, state: 'closed', open: noop },
  // #30 AC 8. The longest unbroken run of prose on the site — eleven numbered
  // articles set in a measure, then two permission notes — and the page a
  // family is most likely to read on a phone, because they were sent to it
  // before deciding.
  { name: 'the statement of faith', path: '/about/beliefs', state: 'closed', open: noop },
];

for (const surface of SURFACES) {
  test.describe(`${surface.name} (${surface.path}), ${surface.state}`, () => {
    for (const width of WIDTHS) {
      test(`has zero axe violations at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(surface.path);
        await surface.open(page);

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        expect(violations.map(describeViolation)).toEqual([]);
      });

      test(`does not overflow horizontally at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(surface.path);
        await surface.open(page);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
      });
    }
  });
}

/**
 * One h1 per page, checked once per page rather than once per state — a state
 * cannot add a heading, and the homepage is expensive enough to load that
 * asserting it three times only buys flakiness.
 */
test.describe('every page', () => {
  for (const path of [...new Set(SURFACES.map((surface) => surface.path))]) {
    test(`${path} has exactly one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }

  test('sets the school as the home page’s h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Pharos Academy');
  });
});

/** A violation rendered so a CI failure names the rule and the element. */
function describeViolation(violation: {
  id: string;
  impact?: string | null;
  nodes: { target: unknown[] }[];
}) {
  return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
    .map((node) => node.target.join(' '))
    .join(', ')}`;
}
