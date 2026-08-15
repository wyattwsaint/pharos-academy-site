import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { SUPPORT_PATH } from '../src/lib/about/story.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';
import { APPLICATION_PATH } from '../src/lib/application/application.js';
import { CALENDAR_PATH, CURRENT_FAMILIES_PATH } from '../src/lib/current-families/section.js';
import { SEEDED_SCHOOL_DETAILS } from '../src/lib/db/migrations.js';
import { INQUIRY_PATH } from '../src/lib/inquiry/inquiry.js';
import { STAFF_PATH } from '../src/lib/people/views.js';
import { POLICIES_PATH } from '../src/lib/policies/views.js';
import { TEACH_PATH } from '../src/lib/teach/teach.js';
import { AXE_TAGS, describeViolation } from './axe.js';
import { SUITE_RETIRED_COURSE } from './suite-admin.js';

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

const TAGS = AXE_TAGS;

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

/** Open a class's meeting dates, which is a native `details` and not a group. */
async function openMeetingDates(page: Page) {
  await page.locator('[data-section="class-dates"] > details > summary').click();
  await expect(page.locator('[data-section="class-dates"] .coursedates-months')).toBeVisible();
}

/** Open the one instructor bio the school has published (#152). */
async function openInstructorBio(page: Page) {
  const cell = page
    .locator('[data-disclosure-group="instructors"] [data-disclosure-cell]')
    .first();
  await cell.locator('[data-disclosure-trigger]').click();
  await expect(cell.locator('[data-disclosure-panel]')).toBeVisible();
}

/**
 * Open the classes on the first teaching date of the calendar's month grid.
 *
 * The panel is where the grid's new markup lives (#235) — a named control whose
 * `aria-expanded` moves, and a list of links floating over a table. Closed, none
 * of that is in the tree to measure.
 */
async function openMonthClasses(page: Page) {
  const cell = page.locator('[data-section="calendar-months"] .classes').first();
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

/**
 * Post the inquiry form with nothing in it, so axe measures the refused state.
 *
 * An empty submission is refused by `parseInquiry` before anything is stored or
 * emailed, so this is safe to run against a real deployment — which matters,
 * because that is where CI points this suite. The *accepted* state is left to
 * `inquiry.spec.ts`: it writes a row, and five widths of junk rows on every
 * axe run is a worse trade than the coverage is worth.
 */
async function rejectInquiry(page: Page) {
  await page.getByRole('button', { name: 'Send my question' }).click();
  await expect(page.locator('[data-outcome="failed"]').first()).toBeVisible();
}

/**
 * Tick the #31 AC 3 pair — Algebra 1 (year) and Beginner Latin 5-6 (year) both
 * meet Monday 11:20–12:20 — and ask for a check, so axe measures the page with
 * the clash warnings displayed. A check re-renders the warnings and **writes
 * nothing**, so like `rejectInquiry` this is safe against a real deployment.
 */
async function showClashes(page: Page) {
  await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
  await page.check('input[name="child-0-classes"][value="beginner-latin-grades-5-6:year"]');
  await page.getByRole('button', { name: 'Check these choices' }).click();
  await expect(page.locator('li[data-severity="clash"]').first()).toBeVisible();
}

const noop = async (_page: Page) => {};

/**
 * Every public surface, in every state worth measuring.
 *
 * One list, so a page added to it is measured at all five widths by
 * construction rather than by somebody remembering to copy a block.
 */
type Surface = {
  name: string;
  path: string;
  state: string;
  open: (page: Page) => Promise<void>;
  /** Measured only against a server this config started — see the retired class. */
  localOnly?: true;
};

const SURFACES: Surface[] = [
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
  // #233. Fifty-six dates in a grid of months is the longest thing this page
  // can hold, and the state a parent planning the year actually reads.
  {
    name: 'a class page',
    path: '/classes/algebra-1',
    state: 'with its meeting dates open',
    open: openMeetingDates,
  },
  // #26. Eight of the eleven people on it have no bio and no photograph, so
  // this is also where "an absent bio renders correctly" is measured at every
  // width rather than only asserted in one.
  { name: 'the staff page', path: STAFF_PATH, state: 'closed', open: noop },
  // #152. The bio floats over the entry below it at every width, so the state
  // worth measuring is the open one: a card of prose on parchment, and the
  // contrast of the name that opened it.
  {
    name: 'the staff page',
    path: STAFF_PATH,
    state: 'with an instructor bio open',
    open: openInstructorBio,
  },
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
  /*
   * #235. Measured open as well, because the grid carries eighty-odd controls
   * that only exist as controls once one of them is pressed: the panel is where
   * the accessible name, the moved `aria-expanded` and a list of links over a
   * table all have to hold up.
   */
  {
    name: 'the calendar page',
    path: CALENDAR_PATH,
    state: 'with a date’s classes open',
    open: openMonthClasses,
  },
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
  /*
   * #25 AC 8. The primary call to action on the whole site, and the one page
   * that renders on request. Measured twice: as it is reached, and with every
   * field refused — the second is where axe finds real violations, because a
   * rejected form is where `aria-describedby`, `aria-invalid` and a status
   * region either wire up or do not.
   */
  { name: 'the inquiry page', path: INQUIRY_PATH, state: 'closed', open: noop },
  {
    name: 'the inquiry page',
    path: INQUIRY_PATH,
    state: 'with every field refused',
    open: rejectInquiry,
  },
  // #30 AC 8. The longest unbroken run of prose on the site — eleven numbered
  // articles set in a measure, then two permission notes — and the page a
  // family is most likely to read on a phone, because they were sent to it
  // before deciding.
  { name: 'the statement of faith', path: '/about/beliefs', state: 'closed', open: noop },
  /*
   * #31 AC 11. The longest form on the site — three radio grids asked of three
   * respondents, eight-way child rows of checkboxes, totals and two submits —
   * measured as it is reached and with the clash warnings displayed, because
   * the warnings are a `role="status"` region with severity borders and they
   * only exist in the checked state. Forms are where axe finds real
   * violations, and this one is the site's biggest.
   */
  { name: 'the application page', path: APPLICATION_PATH, state: 'closed', open: noop },
  {
    name: 'the application page',
    path: APPLICATION_PATH,
    state: 'with clash warnings displayed',
    open: showClashes,
  },
  /*
   * #263 AC 13. A class the school has retired keeps its address and says so,
   * which is a state no other surface has: a notice band above facts written in
   * the past tense, and a page with the primary call to action taken off it.
   *
   * Local only, and that is a fact about the school rather than about the test.
   * The suite's throwaway database retires a class of its own so this state
   * always exists to be measured (`SUITE_RETIRED_COURSE`); a real deployment
   * has whatever the school has actually retired, which on the day the ticket
   * ships is nothing.
   */
  {
    name: 'a retired class page',
    path: `/classes/${SUITE_RETIRED_COURSE}`,
    state: 'closed',
    open: noop,
    localOnly: true,
  },
];

/** True unless the suite is pointed at a real deployment. */
const LOCAL = !process.env.PLAYWRIGHT_BASE_URL;

for (const surface of SURFACES) {
  const skip = () =>
    test.skip(
      !LOCAL && surface.localOnly === true,
      'only the suite’s own throwaway database has a retired class in it',
    );

  test.describe(`${surface.name} (${surface.path}), ${surface.state}`, () => {
    for (const width of WIDTHS) {
      test(`has zero axe violations at ${width}px`, async ({ page }) => {
        skip();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(surface.path);
        await surface.open(page);

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        expect(violations.map(describeViolation)).toEqual([]);
      });

      test(`does not overflow horizontally at ${width}px`, async ({ page }) => {
        skip();
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
 * A link in a sentence is recognisable as a link without colour (#103).
 *
 * A computed-style assertion rather than a screenshot: what is being claimed is
 * that the affordance survives when the colour does not, and a screenshot
 * cannot say that — it can only say the pixels have not moved. So the two
 * non-colour signals are read off the link itself and compared with the
 * paragraph it sits in, which is the only comparison that means anything (a
 * bold link inside bold copy is not heavier than anything).
 *
 * Teach and Admissions specifically: both carried body links with no class at
 * all, falling back to the browser's default blue.
 */
test.describe('an inline prose link', () => {
  const PROSE_LINKS = [
    // "Send us a note" until #105 named the Head of School; the address is now
    // the page's one body link and carries the same no-class case.
    { name: 'on the teach page', path: TEACH_PATH, link: SEEDED_SCHOOL_DETAILS.email },
    // "the timetable" until #107 rewrote the band it sat in; the faith link is
    // the surviving body link on the page and carries the same no-class case.
    { name: 'on the admissions page', path: '/admissions', link: 'what we believe' },
  ];

  for (const { name, path, link } of PROSE_LINKS) {
    test(`${name} is underlined and heavier than the copy around it`, async ({ page }) => {
      await page.goto(path);

      const affordance = await page
        .getByRole('link', { name: link })
        .first()
        .evaluate((element) => {
          const paragraph = element.closest('p');
          if (!paragraph) throw new Error('the link is not in a paragraph');
          return {
            decoration: getComputedStyle(element).textDecorationLine,
            weight: Number.parseInt(getComputedStyle(element).fontWeight, 10),
            proseWeight: Number.parseInt(getComputedStyle(paragraph).fontWeight, 10),
          };
        });

      expect(affordance.decoration).toContain('underline');
      expect(affordance.weight).toBeGreaterThan(affordance.proseWeight);
    });
  }
});

/**
 * One h1 per page, checked once per page rather than once per state — a state
 * cannot add a heading, and the homepage is expensive enough to load that
 * asserting it three times only buys flakiness.
 */
test.describe('every page', () => {
  const everywhere = SURFACES.filter((surface) => LOCAL || surface.localOnly !== true);
  for (const path of [...new Set(everywhere.map((surface) => surface.path))]) {
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
