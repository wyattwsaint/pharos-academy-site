import { expect, test, type Page, type Request } from '@playwright/test';

import { SEEDED_ANNOUNCEMENTS } from '../src/lib/announcements/announcement.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';

/**
 * The homepage's acceptance criteria from #21, one describe block each.
 *
 * These are behavioural, not visual: the design was signed off on #13 and the
 * prototype is the reference for how it *looks*. What is asserted here is the
 * set of things that were expensive to get right and are cheap to break —
 * the reduced-motion hard stop, the phone's exemption from the scroll work,
 * the blur being a crossfade rather than a filter, and the two disclosure
 * surfaces being one implementation rather than two.
 */

/** Where the hero's scroll ramp ends: one viewport, then it releases. */
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * Records every request the page makes for a video file.
 *
 * AC 2 is "no video bytes are fetched", which is stronger than "the video is
 * hidden" — a `<video>` with a `src` and `preload="metadata"` still costs a
 * range request. Counting requests is the only way to assert the strong form.
 */
async function watchVideoRequests(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('request', (request: Request) => {
    if (/\.mp4(\?|$)/.test(request.url())) seen.push(request.url());
  });
  return seen;
}

/** Scroll to an absolute offset and let the rAF-driven ramp settle. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((offset) => window.scrollTo(0, offset), y);
  // two frames: one for the listener, one for the rAF it schedules
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe('the hero', () => {
  test('under prefers-reduced-motion the video has no source and fetches nothing', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...DESKTOP,
      viewport: DESKTOP,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const videoRequests = await watchVideoRequests(page);

    await page.goto('/');
    await scrollTo(page, 400);

    const video = page.locator('[data-hero-video]');
    await expect(video).toHaveCount(1);
    // Not "src is empty" — the attribute must never have been set at all, and
    // the element must carry no <source> children to fall back to.
    expect(await video.evaluate((el) => el.hasAttribute('src'))).toBe(false);
    expect(await video.evaluate((el) => el.querySelectorAll('source').length)).toBe(0);
    expect(videoRequests).toEqual([]);

    await context.close();
  });

  test('under prefers-reduced-motion the parallax and the blur never run', async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await scrollTo(page, 500);

    const media = page.locator('[data-hero-media]');
    const blur = page.locator('[data-hero-blur]');
    expect(await media.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await blur.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);

    await context.close();
  });

  test('below 760px the video plays and neither parallax nor blur runs', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    await page.goto('/');

    const video = page.locator('[data-hero-video]');
    // The source is assigned by script, so wait for that rather than for load.
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.getAttribute('src')))
      .toBeTruthy();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);

    const media = page.locator('[data-hero-media]');
    const blur = page.locator('[data-hero-blur]');
    const before = await media.evaluate((el) => getComputedStyle(el).transform);

    await scrollTo(page, 600);

    expect(await media.evaluate((el) => getComputedStyle(el).transform)).toBe(before);
    expect(await blur.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);

    await context.close();
  });

  test('the blur is a crossfaded still, never a filter on the playing video', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const video = page.locator('[data-hero-video]');
    const blur = page.locator('[data-hero-blur]');

    const opacities: number[] = [];
    for (const y of [0, 200, 450, 700, 900]) {
      await scrollTo(page, y);
      // Re-blurring 24 frames a second is what turns this janky on a mid-range
      // phone. The filter must be absent at every point on the ramp.
      expect(await video.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
      opacities.push(await blur.evaluate((el) => Number(getComputedStyle(el).opacity)));
    }

    expect(opacities[0]).toBe(0);
    // monotonically rising across the ramp
    for (let i = 1; i < opacities.length; i += 1) {
      expect(opacities[i]).toBeGreaterThan(opacities[i - 1]);
    }
  });

  test('scroll is never trapped and the ramp releases after the first viewport', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const heroHeight = await page
      .locator('[data-section="hero"]')
      .evaluate((el) => (el as HTMLElement).offsetHeight);
    const blur = page.locator('[data-hero-blur]');

    await scrollTo(page, heroHeight);
    const atRelease = await blur.evaluate((el) => Number(getComputedStyle(el).opacity));

    await scrollTo(page, heroHeight + 900);
    const past = await page.evaluate(() => window.scrollY);

    // Scroll kept going — nothing pinned the page to the hero.
    expect(past).toBeGreaterThan(heroHeight);
    // And the ramp is done: it clamps at 1 rather than continuing to drive.
    expect(await blur.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(
      atRelease,
      3,
    );
    expect(atRelease).toBeCloseTo(1, 2);
  });

  test('keeps the school as the h1 even though the display line is larger', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText('Pharos Academy');

    const sizes = await page.evaluate(() => ({
      h1: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
      display: parseFloat(
        getComputedStyle(document.querySelector('[data-hero-display]')!).fontSize,
      ),
    }));
    expect(sizes.h1).toBeGreaterThan(0);
    expect(sizes.display).toBeGreaterThan(0);
  });
});

/**
 * #102's two layout defects, asserted as the rule rather than as a picture.
 *
 * Bounding boxes, not screenshots: what broke both times was a *relationship*
 * between two boxes — headings that no longer shared a top edge, a mark that
 * no longer stayed clear of the nav — and a screenshot asserts every pixel of
 * the page instead of the one relationship, so it fails on any repaint and
 * says nothing about which. The viewports are fixed for the same reason: both
 * defects were invisible at 1440×900 and plain at 1280×600.
 */
const SHORT_WIDE = { width: 1280, height: 600 };
const NARROW_SHORT = { width: 1100, height: 560 };

test.describe('the home layout', () => {
  for (const viewport of [DESKTOP, SHORT_WIDE, NARROW_SHORT]) {
    test(`the timetable's day headings share a top edge at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const tops = await page
        .locator('[data-section="week"] .grid .day h3')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));

      // Three day tracks run; a fourth is routinely empty and is not drawn.
      expect(tops.length).toBeGreaterThan(1);
      // Sub-pixel tolerance only. The regression this catches was 64px — a
      // margin from the /classes page's own `.day` sections reaching these.
      for (const top of tops) expect(top).toBeCloseTo(tops[0], 0);
    });

    test(`the hero mark stays clear of the navigation at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const mark = await page.locator('.hero-mark').boundingBox();
      const nav = await page.locator('.site-nav').boundingBox();
      expect(mark).not.toBeNull();
      expect(nav).not.toBeNull();

      // The rule is "the mark begins below the nav ends", which is stronger
      // than "the two rectangles do not intersect" — they also must not swap
      // order — and it holds however wide the nav's links happen to run.
      expect(mark!.y).toBeGreaterThan(nav!.y + nav!.height);
    });
  }

  test('the navigation still collapses below the narrow breakpoint', async ({ page }) => {
    // 860px is the existing breakpoint; asserted on both sides so a fix to the
    // hero above cannot quietly move it.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    await expect(page.locator('.site-nav')).toBeVisible();

    await page.setViewportSize({ width: 820, height: 700 });
    await expect(page.locator('.site-nav')).not.toBeVisible();
  });
});

test.describe('the header', () => {
  test('is chrome-less over the hero and takes the navy band once it is past', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const header = page.locator('[data-site-header]');
    await expect(header).not.toHaveClass(/\bstuck\b/);
    // The corner lockup is only shown once the hero lockup has gone.
    await expect(page.locator('[data-header-brand]')).not.toBeVisible();

    const heroHeight = await page
      .locator('[data-section="hero"]')
      .evaluate((el) => (el as HTMLElement).offsetHeight);

    // Pins the threshold in both directions, not just the end state. Asserting
    // only at `heroHeight` passes for *any* trigger at or below the hero's
    // height, so the halfway trigger this build actually uses was invisible to
    // it — and halfway is a knowing divergence from #21's "once the hero is
    // past" (see `STICK_AT`), which is exactly the kind of thing that must fail
    // loudly if someone moves it without re-measuring the contrast.
    await scrollTo(page, Math.round(heroHeight * 0.4));
    await expect(header).not.toHaveClass(/\bstuck\b/);

    await scrollTo(page, Math.round(heroHeight * 0.6));
    await expect(header).toHaveClass(/\bstuck\b/);
    await expect(page.locator('[data-header-brand]')).toBeVisible();
  });
});

/**
 * AC 6. The two surfaces are asserted with the *same* helper deliberately: if
 * the contract ever diverges, one of the two calls fails and names which.
 */
const DISCLOSURE_SURFACES = [
  { name: 'the H.O.P.E. cards', group: '[data-disclosure-group="hope"]' },
  { name: 'the class descriptions', group: '[data-disclosure-group="classes"]' },
];

for (const surface of DISCLOSURE_SURFACES) {
  test.describe(`${surface.name} disclosure`, () => {
    test('hover opens, click sticks, Escape closes', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto('/');

      const cells = page.locator(`${surface.group} [data-disclosure-cell]`);
      const first = cells.first();
      const trigger = first.locator('[data-disclosure-trigger]');
      const panel = first.locator('[data-disclosure-panel]');

      await expect(panel).not.toBeVisible();

      await trigger.hover();
      await expect(panel).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Hovering away releases it again while it is only hovered, not stuck.
      await page.mouse.move(2, 2);
      await expect(panel).not.toBeVisible();

      await trigger.hover();
      await trigger.click();
      await expect(panel).toBeVisible();
      // Now stuck: moving the mouse off must NOT close it. This is the bit that
      // makes a click read as "open" rather than as a second toggle.
      await page.mouse.move(2, 2);
      await expect(panel).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(panel).not.toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('an outside click closes a stuck panel', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto('/');

      const first = page.locator(`${surface.group} [data-disclosure-cell]`).first();
      const trigger = first.locator('[data-disclosure-trigger]');
      const panel = first.locator('[data-disclosure-panel]');

      await trigger.click();
      await expect(panel).toBeVisible();

      await page.locator('h1').click({ force: true });
      await expect(panel).not.toBeVisible();
    });

    test('is keyboard reachable and opens on focus', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto('/');

      const first = page.locator(`${surface.group} [data-disclosure-cell]`).first();
      const trigger = first.locator('[data-disclosure-trigger]');
      const panel = first.locator('[data-disclosure-panel]');

      await trigger.focus();
      await expect(trigger).toBeFocused();
      await expect(panel).toBeVisible();
    });

    test('opens one panel at a time', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto('/');

      const cells = page.locator(`${surface.group} [data-disclosure-cell]`);
      await cells.nth(0).locator('[data-disclosure-trigger]').click();
      await expect(cells.nth(0).locator('[data-disclosure-panel]')).toBeVisible();

      await cells.nth(1).locator('[data-disclosure-trigger]').click();
      await expect(cells.nth(1).locator('[data-disclosure-panel]')).toBeVisible();
      await expect(cells.nth(0).locator('[data-disclosure-panel]')).not.toBeVisible();
    });
  });
}

test.describe('the page', () => {
  test('runs the sections in the order #9 fixed', async ({ page }) => {
    await page.goto('/');

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-section]')].map((el) =>
        el.getAttribute('data-section'),
      ),
    );

    // #9's resolution, with its items 2 and 3 merged into the one timetable
    // section that variant E arrived at — real classes with real ages and
    // prices *is* "what a week looks like".
    expect(order).toEqual(['hero', 'week', 'teachers', 'costs', 'faith', 'inquiry']);
  });

  test('carries no announcements section, with an announcement live on the site', async ({
    page,
  }) => {
    // #109. An empty database would pass an absence assertion for the wrong
    // reason, so the precondition is asserted first: a seeded announcement is on
    // the news page. Seeded rather than posted, because the admin specs move the
    // dates around and this must not depend on their state — and it no longer
    // needs to, since no date puts a band back on this page.
    const announcement = SEEDED_ANNOUNCEMENTS[0];
    await page.goto(NEWS_PATH);
    await expect(page.getByRole('heading', { name: announcement.headline })).toBeVisible();

    await page.goto('/');
    await expect(page.locator('[data-section="announcements"]')).toHaveCount(0);
    await expect(page.locator('#announcements')).toHaveCount(0);
    await expect(page.getByText(announcement.headline)).toHaveCount(0);
  });

  test('carries the inquiry CTA in both the header and the footer', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    // Rooted rather than bare: the header and footer are on the class pages
    // too now (#22), where `#inquiry` would be a link that does nothing.
    //
    // The header row itself, not the whole header: since #139 the header also
    // carries the small-screen menu, whose panel repeats this call to action
    // for a phone. The claim is unchanged — the row offers it exactly once.
    await expect(page.locator('[data-site-header] > .wide > a[href="/#inquiry"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="/#inquiry"]')).toHaveCount(1);
  });
});
