import { expect, test } from '@playwright/test';

import { CATALOGUE } from '../src/lib/courses/catalogue.js';
import { classPath } from '../src/lib/courses/views.js';
import { PEOPLE } from '../src/lib/people/person.js';
import { STAFF_PATH } from '../src/lib/people/views.js';
import { SITE_CREDIT } from '../src/lib/site.js';

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

/** The instructor the school supplied a bio for, rather than a leader (#150). */
const SUPPLIED_BIO = PEOPLE.find(
  (person) => person.bio !== null && person.leadershipRank === null,
)!;

/** The widths #152 AC 8 names: a desktop, and a phone with no pointer to hover. */
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** Who the catalogue names — being an instructor is a fact about it, not a column. */
const TEACHES = new Set(CATALOGUE.map((course) => course.instructorSlug));

/**
 * An instructor with a bio, one without, and one whose face is on the page too
 * (#152).
 *
 * All three are *found* rather than named, because which is which is the
 * school's to change: two of the ten had a bio in this section when the reveal
 * was built, Mrs. Saint's arrived with #150 while it was in review, and the
 * rest are still owed by the Head of School. A spec that named a slug would
 * have to be edited every time the school writes a paragraph.
 *
 * `WITH_PORTRAIT` is the one that makes "pointing at their photograph" testable
 * at all: Pastor Jensen has a face on this page but it runs in leadership, so
 * his entry down here carries no portrait to point at.
 */
const WITH_BIO = PEOPLE.find((person) => TEACHES.has(person.slug) && person.bio !== null)!;
const WITHOUT_BIO = PEOPLE.find((person) => TEACHES.has(person.slug) && person.bio === null)!;
const WITH_PORTRAIT = PEOPLE.find(
  (person) =>
    TEACHES.has(person.slug) &&
    person.bio !== null &&
    person.photo !== null &&
    person.leadershipRank === null,
)!;

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

    // No level is skipped between the headings there are: h1, then an h2 per
    // section, then a name per person. The credit line (#150) is a section
    // without a heading on purpose, so this counts levels rather than sections.
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

  test('prints the instructor bio the school supplied, in the instructors list', async ({
    page,
  }) => {
    // #150. The mirror image of the test above: the seven with nothing written
    // about them get no paragraph, and the one the school wrote about gets hers
    // — on the page, not merely in the seed. The text is read out of `PEOPLE`
    // rather than pasted here, so an edit for tone is not a broken test.
    //
    // It is in the markup rather than on the screen since #152 put it behind
    // the reveal, which is why this asserts the text and not its visibility;
    // that it can be *opened* is `an instructor's biography` below.
    await page.goto(STAFF_PATH);

    const bio = SUPPLIED_BIO.bio;
    if (bio === null) throw new Error(`"${SUPPLIED_BIO.slug}" has no seeded bio to look for.`);

    const entry = page.locator(`[data-section="staff-instructors"] #${SUPPLIED_BIO.slug}`);
    await expect(entry.locator('.staff-bio')).toHaveText(bio);
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
    //
    // Scoped by the *text* rather than by `.staff-credit`: that class is only
    // ever emitted by the block above, so a class-scoped absence check passes
    // wherever the credit renders and proves nothing.
    await expect(credit.locator('img')).toHaveCount(0);
    await expect(
      page.locator('[data-section="staff-instructors"]').getByText(SITE_CREDIT),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-section="staff-leadership"]').getByText(SITE_CREDIT),
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
 * #152 — an instructor's bio, behind their name.
 *
 * The interaction contract itself (hover opens, click sticks, Escape closes,
 * one at a time) belongs to `<disclosure-group>` and is proved on the homepage
 * and the class grid. What is asserted here is what this surface adds: that the
 * staff page uses *that* element rather than a second one of its own, that an
 * instructor with nothing written about them offers no interaction at all, and
 * that opening a bio moves nothing a parent was reaching for.
 */
test.describe('an instructor’s biography', () => {
  const entryFor = (slug: string) => `[data-section="staff-instructors"] #${slug}`;

  test('opens on the portrait as well as the name', async ({ page }) => {
    // AC 1 names both — "pointing at their photograph or name". The trigger is
    // the name, because a heading cannot go inside a button; the photograph is
    // covered because the group opens on the whole *cell* being hovered.
    // Mrs. Saint is what makes this assertable: hers is the one entry in this
    // list with a face and a paragraph both.
    await page.setViewportSize(DESKTOP);
    await page.goto(STAFF_PATH);

    const entry = page.locator(entryFor(WITH_PORTRAIT.slug));
    const portrait = entry.locator('img.portrait');
    const panel = entry.locator('[data-disclosure-panel]');

    await expect(portrait).toHaveCount(1);
    await expect(panel).not.toBeVisible();

    await portrait.hover();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(WITH_PORTRAIT.bio!);
  });

  test('opens on hover, sticks on a click, and closes on Escape', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(STAFF_PATH);

    const entry = page.locator(entryFor(WITH_BIO.slug));
    const trigger = entry.locator('[data-disclosure-trigger]');
    const panel = entry.locator('[data-disclosure-panel]');

    await expect(panel).not.toBeVisible();

    await trigger.hover();
    await expect(panel).toBeVisible();
    // The school's own paragraph, not a summary of it: the reveal changed where
    // the bio is, not what it says.
    await expect(panel).toContainText(WITH_BIO.bio!);

    await page.mouse.move(2, 2);
    await expect(panel).not.toBeVisible();

    await trigger.hover();
    await trigger.click();
    await page.mouse.move(2, 2);
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
  });

  test('is the site’s one reveal rather than a second one that behaves nearly the same', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(STAFF_PATH);

    // AC 7. Asserted structurally, because "it behaves the same today" is what
    // a second implementation also does, right up until one of them is changed.
    const group = page.locator('disclosure-group[data-disclosure-group="instructors"]');
    await expect(group).toHaveCount(1);
    await expect(group.locator(`#${WITH_BIO.slug}[data-disclosure-cell]`)).toHaveCount(1);

    // And nothing on this page opens a panel any other way: every trigger and
    // every panel here belongs to that group.
    await expect(page.locator('[data-disclosure-trigger]')).toHaveCount(
      await group.locator('[data-disclosure-trigger]').count(),
    );
    await expect(page.locator('[data-disclosure-panel]')).toHaveCount(
      await group.locator('[data-disclosure-panel]').count(),
    );
  });

  // At both widths, not only the desktop: a phone is where the panel's layout
  // changes least gracefully, and a keyboard is not a desktop-only device —
  // an external one, or a switch control, reaches this page at 390px too.
  for (const [name, viewport] of [
    ['a desktop', DESKTOP],
    ['a phone', PHONE],
  ] as const) {
    test(`opens on focus and can be dismissed from the keyboard on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(STAFF_PATH);

      const entry = page.locator(entryFor(WITH_BIO.slug));
      const trigger = entry.locator('[data-disclosure-trigger]');
      const panel = entry.locator('[data-disclosure-panel]');

      await trigger.focus();
      await expect(panel).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(panel).not.toBeVisible();
      // Escape dismisses the panel and leaves focus where it was, so the next
      // Tab carries on down the page rather than starting again from the top.
      await expect(trigger).toBeFocused();
    });
  }

  test('is announced rather than merely shown', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(STAFF_PATH);

    const entry = page.locator(entryFor(WITH_BIO.slug));
    const trigger = entry.locator('[data-disclosure-trigger]');
    const panel = entry.locator('[data-disclosure-panel]');

    // AC 4: a real control that says what it controls and whether it is open —
    // not a paragraph revealed by CSS with nothing telling a screen reader.
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const controls = await trigger.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(panel).toHaveAttribute('id', controls!);

    await trigger.click();
    await expect(
      entry.getByRole('button', { name: WITH_BIO.name, expanded: true }),
    ).toHaveCount(1);
    // And the paragraph is in the accessibility tree once it is open, rather
    // than hidden from it by an `aria-hidden` left on the panel.
    await expect(entry.getByText(WITH_BIO.bio!)).toBeVisible();
  });

  test('offers nothing to open for an instructor the school has written nothing about', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(STAFF_PATH);

    const entry = page.locator(entryFor(WITHOUT_BIO.slug));
    await expect(entry).toHaveCount(1);

    // AC 5: no trigger, no panel, and not even a cell — hovering the entry must
    // do nothing at all rather than open an empty box.
    await expect(entry.locator('[data-disclosure-trigger]')).toHaveCount(0);
    await expect(entry.locator('[data-disclosure-panel]')).toHaveCount(0);
    await expect(entry).not.toHaveAttribute('data-disclosure-cell', /.*/);

    // Their name is still their name, still a heading, just not a control.
    await expect(entry.getByRole('heading', { name: WITHOUT_BIO.name })).toBeVisible();
    await expect(entry.getByRole('button')).toHaveCount(0);
  });

  for (const [name, viewport] of [
    ['a desktop', DESKTOP],
    ['a phone', PHONE],
  ] as const) {
    test(`does not move what the visitor was about to click on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(STAFF_PATH);

      const entry = page.locator(entryFor(WITH_BIO.slug));
      const trigger = entry.locator('[data-disclosure-trigger]');

      // AC 6. The class links sit directly under the name and are what a parent
      // on this page is reaching for, so they are the thing measured — a panel
      // that expanded in the flow would push them down the page between the
      // pointer arriving and the click landing.
      //
      // Measured in *document* coordinates rather than from `boundingBox()`:
      // clicking scrolls the trigger into view, which moves every viewport-
      // relative rect on the page and would fail a correct implementation.
      const placement = () =>
        page.locator('.staff-teaching').evaluate((list) => {
          const at = (element: Element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x + scrollX, y: box.y + scrollY, w: box.width, h: box.height };
          };
          return {
            list: at(list),
            links: [...list.querySelectorAll('.staff-classes')].map(at),
          };
        });

      const before = await placement();

      await trigger.click();
      await expect(entry.locator('[data-disclosure-panel]')).toBeVisible();

      expect(await placement()).toEqual(before);
    });
  }

  test('opens on a tap where there is no pointer to hover with', async ({ browser }) => {
    // AC 2. A real touch, not a click at a phone's width: on a touch device
    // there is no `mouseenter` to open with, and the tap has to carry it.
    const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(STAFF_PATH);

    const entry = page.locator(entryFor(WITH_BIO.slug));
    const panel = entry.locator('[data-disclosure-panel]');
    await expect(panel).not.toBeVisible();

    await entry.locator('[data-disclosure-trigger]').tap();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(WITH_BIO.bio!);

    // And a tap somewhere else puts it away — the only dismissal a touch device
    // has, since there is no Escape key and nowhere to move a pointer to.
    await page.locator('[data-section="staff-header"] h1').tap();
    await expect(panel).not.toBeVisible();

    await context.close();
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
