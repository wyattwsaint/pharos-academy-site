import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

import { LABELS } from '../src/lib/admin/policies.js';
import { SUITE_ADMIN, signIn } from './suite-admin.js';
import {
  APPLICATION_PATH,
  FAITH_QUESTIONS,
  faithKey,
} from '../src/lib/application/application.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';
import { INQUIRY_PATH } from '../src/lib/inquiry/inquiry.js';
import { STAFF_PATH } from '../src/lib/people/views.js';
import { POLICIES_PATH } from '../src/lib/policies/views.js';

/**
 * The admin, in a browser (#20).
 *
 * Login, save, and the guard, driven the way Jill drives them. The store's own
 * behaviour is proved against real Postgres in `src/lib/admin/store.test.ts`;
 * what is only true in a browser is proved here — that the form posts, that the
 * cookie comes back, that the guard bounces, and that what the screen *says*
 * after a save is the truth about the live site.
 *
 * The failed-revalidation half lives in `admin-revalidation.spec.ts`, which
 * needs a server pointed at an origin that is genuinely down.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The admin screens, and the widths #18 names. Same bar as the public site. */
const ADMIN_WIDTHS = [390, 1440];

test.describe('the guard', () => {
  test('bounces an anonymous visitor to the login page, and back afterwards', async ({ page }) => {
    await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fusers$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Username').fill(SUITE_ADMIN.username);
    await page.getByLabel('Password').fill(SUITE_ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Landed on the page that was asked for, not on a dashboard.
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test('keeps the admin out of search results', async ({ page }) => {
    const response = await page.goto('/admin/login');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  });
});

test.describe('signing in', () => {
  test('says one thing about a wrong password, and does not say which half was wrong', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Username').fill(SUITE_ADMIN.username);
    await page.getByLabel('Password').fill('not-the-right-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('That username and password do not match an account.');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('signs out again, and the guard means it', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.goto('/admin/school-details');
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  });
});

test.describe('saving school details', () => {
  // One row, and a save posts the whole form: in parallel these two would
  // overwrite each other's fields.
  test.describe.configure({ mode: 'serial' });

  test('saves, says the live site is up to date, and stamps who did it', async ({ page }) => {
    await signIn(page);

    const phone = '717-497-1234';
    await page.getByLabel('Phone').fill(phone);
    await page.getByRole('button', { name: 'Save' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    await expect(banner).toContainText('Saved and live.');

    // The stamp is the attribution that flat permissions lean on (#18 §4).
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');

    // And it is a real write: it survives coming back to the page.
    await page.goto('/admin/school-details');
    await expect(page.getByLabel('Phone')).toHaveValue(phone);
  });

  test('refuses a submission that would empty the footer, and says which field', async ({
    page,
  }) => {
    await signIn(page);

    // `novalidate` is not set, so the browser catches an empty required field
    // and a malformed email before either ever posts. A field of spaces is
    // what gets past the browser — `required` sees a non-empty value — and it
    // is the server's trim that has to catch it. That is the case worth a
    // browser test: the others never reach the code being defended.
    await page.getByLabel('Address').fill('   ');
    await page.getByRole('button', { name: 'Save' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'false');
    await expect(banner).toContainText('Nothing was saved');
    await expect(page.locator('#address')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#address-error')).toContainText('Address cannot be empty.');
  });

  /*
   * The home page's announcement banner, both ways round (#15).
   *
   * Driven from the admin rather than seeded, because the point of the ticket
   * is that the office changes what a visitor sees without a developer: a
   * seeded banner would prove the bar renders and nothing about the path that
   * puts words in it. It lives in this file rather than in `homepage.spec.ts`
   * for the same reason the rest of this describe does — it needs an account,
   * and the account only exists on a server this config started.
   */

  /**
   * Put the row into a known banner state, or switch the banner off.
   *
   * Every test below opens with this, including the ones that then assert the
   * bar is absent. Inheriting "off" from whichever test ran last is what makes
   * a suite that passes in isolation fail in a full run: the public project
   * shares this dev server, `fullyParallel` is on, and an absence assertion
   * that leans on someone else's cleanup is an assertion about scheduling.
   */
  async function setBanner(
    page: Page,
    banner: { message: string; date: string; link: string } | null,
  ): Promise<void> {
    await page.goto('/admin/school-details');
    const shown = page.getByLabel('Show the banner on the home page');

    if (banner === null) {
      await shown.uncheck();
    } else {
      await shown.check();
      await page.getByLabel('Banner message').fill(banner.message);
      await page.getByLabel('Banner date').fill(banner.date);
      await page.getByLabel('Banner link').fill(banner.link);
    }

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
  }

  const REGISTER = {
    message: 'Register now! Classes begin',
    date: '2026-08-31',
    link: 'https://example.org/register',
  };

  test('puts the banner on the home page, and takes it off again', async ({ page }) => {
    await signIn(page);
    await setBanner(page, REGISTER);

    await page.goto('/');
    const bar = page.locator('[data-announcement-bar]');
    // American, no ordinal suffix, and the date after the words the office
    // typed — "Register now! Classes begin August 31".
    await expect(bar).toContainText('Register now! Classes begin August 31');
    await expect(bar.getByRole('link')).toHaveAttribute('href', REGISTER.link);

    // Beneath the header's row, not floating over it.
    const row = await page.locator('[data-site-header] > .wide').boundingBox();
    const box = await bar.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(row!.y + row!.height - 1);

    await setBanner(page, null);

    // Off is nothing at all, not an empty bar: the hero still starts at the top
    // of the document, so the region leaves no space behind it.
    await page.goto('/');
    await expect(page.locator('[data-announcement-bar]')).toHaveCount(0);
    const hero = await page.locator('[data-section="hero"]').boundingBox();
    expect(hero!.y).toBeCloseTo(0, 0);
  });

  /*
   * Both widths, because the focus hand-off after a dismissal is width-sensitive
   * and silently so: `.site-nav` is `display: none` below 860px, and `.focus()`
   * on a hidden element does nothing and reports nothing. A desktop-only run of
   * this test passed against a target that did not exist on a phone.
   */
  for (const width of [1280, 390]) {
    test(`lets a visitor dismiss the banner from the keyboard at ${width}px, and remembers it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await signIn(page);
      await setBanner(page, { message: 'Snow day — no classes', date: '2027-01-05', link: '' });

      await page.goto('/');
      const bar = page.locator('[data-announcement-bar]');
      // Named, so a screen reader announces a region called Announcement rather
      // than an unlabelled group of two controls.
      await expect(bar).toHaveAttribute('aria-label', 'Announcement');
      await expect(bar).toContainText('Snow day — no classes January 5');
      // With no link set, the message is not a link to nowhere.
      await expect(bar.getByRole('link')).toHaveCount(0);

      const heroBefore = await page.locator('[data-section="hero"]').boundingBox();
      await page.getByRole('button', { name: 'Dismiss this announcement' }).focus();
      await page.keyboard.press('Enter');

      await expect(bar).toHaveCount(0);
      // Nothing moved: the bar hangs off a fixed header and is not in the flow.
      const heroAfter = await page.locator('[data-section="hero"]').boundingBox();
      expect(heroAfter!.y).toBeCloseTo(heroBefore!.y, 0);
      // Focus did not fall to <body>; the keyboard visitor is still in the
      // header. The header's CTA, not the nav — the nav is `display: none`
      // below 860px, and `.focus()` on a hidden element is a silent no-op.
      await expect(page.locator('[data-site-header] .btn')).toBeFocused();

      // And it stays dismissed, which is the whole reason a dismissal is stored.
      await page.reload();
      await expect(page.locator('[data-announcement-bar]')).toHaveCount(0);

      await setBanner(page, null);
    });
  }

  test('has no accessibility failures with the banner live', async ({ page }) => {
    await signIn(page);
    await setBanner(page, REGISTER);

    // Navy ink on gold, over a header that is transparent above the hero. The
    // contrast is the thing most likely to have been got wrong by eye, and the
    // public axe run never sees this state because the banner ships off.
    await page.goto('/');
    await expect(page.locator('[data-announcement-bar]')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);

    await setBanner(page, null);
  });

  test('refuses a banner with no date, and one whose link is not a link', async ({ page }) => {
    await signIn(page);
    await setBanner(page, null);

    await page.getByLabel('Show the banner on the home page').check();
    await page.getByLabel('Banner message').fill('Register now! Classes begin');
    await page.getByLabel('Banner date').fill('');
    // `type="url"` catches most of these in the browser before they ever post.
    // A scheme the browser accepts is what proves the server's own check runs.
    await page.getByLabel('Banner link').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#bannerDate-error')).toBeVisible();
    await expect(page.locator('#bannerLink-error')).toBeVisible();

    // Nothing was saved, so the home page is still the one the school ships.
    await page.goto('/');
    await expect(page.locator('[data-announcement-bar]')).toHaveCount(0);
  });
});

test.describe('editing a person', () => {
  // One row per person and a save posts the whole form, as school details does.
  test.describe.configure({ mode: 'serial' });

  test('saves, republishes the site, and stamps who did it', async ({ page }) => {
    await signIn(page, '/admin/people');

    await page.getByRole('link', { name: 'Mrs. Angela Fecteau' }).click();

    const role = 'Instructor, Life Science';
    await page.getByLabel('Role').fill(role);
    await page.getByRole('button', { name: 'Save' }).click();

    // AC 5: the screen reports what actually happened to the live site, not
    // what it hopes happened. This name is printed on the staff page and on
    // every class she teaches, so a save that did not republish is a site
    // disagreeing with itself.
    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    await expect(banner).toContainText('Saved and live.');
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');

    // A real write, and it reaches the public page it is printed on.
    await page.goto(STAFF_PATH);
    await expect(page.locator('#angela-fecteau .role')).toHaveText(role);
  });

  test('refuses a person with no role, and says so without saving', async ({ page }) => {
    await signIn(page, '/admin/people');
    await page.getByRole('link', { name: 'Mrs. Chelsea Miller' }).click();

    // A field of spaces is what gets past the browser's own `required`, so it
    // is the server's trim that has to catch it.
    await page.getByLabel('Role').fill('   ');
    await page.getByRole('button', { name: 'Save' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'false');
    await expect(banner).toContainText('Nothing was saved');
    await expect(page.locator('#role')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#role-error')).toContainText('cannot be empty');
  });

  // AC 4, defended where a photograph can actually get in: a face nobody at the
  // school can vouch for or take down does not go on the staff page.
  test('refuses a photograph that does not live in this site', async ({ page }) => {
    await signIn(page, '/admin/people');
    await page.getByRole('link', { name: 'Mrs. Chelsea Miller' }).click();

    await page.getByLabel('Photograph').fill('https://example.org/somebody.jpg');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#photo')).toHaveAttribute('aria-invalid', 'true');
  });

  test('adds somebody with no bio and no photograph, which is a complete person', async ({
    page,
  }) => {
    await signIn(page, '/admin/people');
    await page.getByRole('link', { name: 'Add a person' }).click();

    await page.getByLabel('Name').fill('Mrs. Suite Newcomer');
    await page.getByLabel('Role').fill('Instructor');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');

    await page.goto('/admin/people');
    await expect(page.getByRole('link', { name: 'Mrs. Suite Newcomer' })).toBeVisible();
  });
});

/**
 * Resetting and deleting are proved against real Postgres in
 * `src/lib/admin/store.test.ts`, not here: every spec in this file shares one
 * dev server and therefore one database, and a browser test that reset the
 * suite's own password would sign every other spec out. What is asserted here
 * is what only a browser can see — that the screen offers the two actions #18
 * §4 asks for, and nothing else.
 */
test.describe('the Users screen', () => {
  test('offers reset and delete, and no way to create an account', async ({ page }) => {
    await signIn(page, '/admin/users');

    await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete / })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add account' })).toHaveCount(0);
  });
});

/**
 * Announcements (#27), now on the news page alone (#109).
 *
 * The homepage band this block used to drive is gone, and with it the pair of
 * tests that watched it appear and disappear. What is left is what the admin is
 * for: a notice saved here reaches the news page, its PDF comes back byte for
 * byte, and a file that is not a PDF is refused. The six-week rule itself is
 * proved in vitest, which is now its only consumer.
 *
 * Serial, because these tests share one database with each other and post
 * against it.
 */
test.describe('announcements', () => {
  test.describe.configure({ mode: 'serial' });

  /** A real PDF, small enough to compare byte for byte in an assertion. */
  const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n', 'latin1');

  /** Today, as the date input wants it. */
  function today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async function post(
    page: Page,
    fields: { headline: string; body: string; postedOn?: string; file?: boolean },
  ): Promise<void> {
    await signIn(page, '/admin/announcements');
    await page.getByRole('link', { name: 'Post an announcement' }).click();

    await page.getByLabel('Headline').fill(fields.headline);
    await page.getByLabel('What it says').fill(fields.body);
    await page.getByLabel('Posted on').fill(fields.postedOn ?? today());
    if (fields.file) {
      await page
        .getByLabel('PDF')
        .setInputFiles({ name: 'suite-notice.pdf', mimeType: 'application/pdf', buffer: PDF });
    }
    await page.getByRole('button', { name: 'Save' }).click();
  }

  // AC 1, the half without a file — and #109's absence, checked at the moment it
  // is most likely to be wrong: an announcement posted today, which is exactly
  // what used to put a band on the home page.
  test('posts an announcement with no PDF, onto the news page and nowhere else', async ({
    page,
  }) => {
    const headline = 'Suite notice, no file';
    await post(page, { headline, body: 'Posted by the browser suite, with nothing attached.' });

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    await expect(banner).toContainText('Saved and live.');
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');

    // The news page carries it in full…
    await page.goto(NEWS_PATH);
    const entry = page.locator('#news li', { hasText: headline });
    await expect(entry.getByRole('heading', { name: headline })).toBeVisible();
    await expect(entry.locator('a[href$=".pdf"]')).toHaveCount(0);

    // …and the homepage carries neither a band nor the headline, dated today or
    // not (#109).
    await page.goto('/');
    await expect(page.locator('[data-section="announcements"]')).toHaveCount(0);
    await expect(page.getByText(headline)).toHaveCount(0);
  });

  // AC 1, the half with a file. The bytes are the assertion: a PDF that comes
  // back as anything but itself is a download that opens on nothing.
  test('posts one with a PDF, and serves back exactly the bytes it was given', async ({
    page,
    request,
  }) => {
    const headline = 'Suite notice, with a file';
    await post(page, { headline, body: 'Posted by the browser suite, with a PDF.', file: true });

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    await page.goto(NEWS_PATH);
    const link = page
      .locator('#news li', { hasText: headline })
      .locator('a[href$=".pdf"]');
    await expect(link).toContainText('suite-notice.pdf');

    const href = await link.getAttribute('href');
    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['content-disposition']).toContain('suite-notice.pdf');
    expect(Buffer.from(await response.body()).equals(PDF)).toBe(true);
  });

  test('refuses a file that is not a PDF, and says so without saving', async ({ page }) => {
    await signIn(page, '/admin/announcements');
    await page.getByRole('link', { name: 'Post an announcement' }).click();

    await page.getByLabel('Headline').fill('Suite notice, bad file');
    await page.getByLabel('What it says').fill('This one should not save.');
    await page.getByLabel('Posted on').fill(today());
    await page
      .getByLabel('PDF')
      .setInputFiles({
        name: 'notice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('<html>not a pdf at all</html>'),
      });
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#attachment-error')).toContainText('not a PDF');

    await page.goto(NEWS_PATH);
    await expect(page.getByRole('heading', { name: 'Suite notice, bad file' })).toHaveCount(0);
  });

  /*
   * The record, and the reason this file's announcements are serial.
   *
   * Every announcement is aged past six weeks through the form — the only lever
   * that exists, and the honest one, because it is what Jill would do. What #27
   * cared about on the far side of that was the news page keeping every one of
   * them, and that is still the behaviour: the date is editable, nothing is lost
   * by editing it, and since #109 no value of it puts anything on the home page.
   *
   * A fresh announcement at the end leaves the database in a state the rest of
   * the suite recognises.
   */
  test('keeps every announcement on the news page once they are all stale', async ({ page }) => {
    await signIn(page, '/admin/announcements');

    const slugs = await page
      .locator('a[href^="/admin/announcements/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute('href')!.replace('/admin/announcements/', ''))
          .filter((slug) => slug !== 'new'),
      );
    expect(slugs.length).toBeGreaterThan(0);

    for (const slug of slugs) {
      await page.goto(`/admin/announcements/${slug}`);
      await page.getByLabel('Posted on').fill('2020-01-01');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
    }

    // Nothing was lost: the record is all still on the news page.
    await page.goto(NEWS_PATH);
    for (const slug of slugs) {
      await expect(page.locator(`[id="${slug}"]`), slug).toHaveCount(1);
    }

    // And one posted today lands on the news page and on nothing else (#109).
    const fresh = 'Suite notice, back again';
    await post(page, { headline: fresh, body: 'Dated today.' });
    await page.goto(NEWS_PATH);
    await expect(page.getByRole('heading', { name: fresh })).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-section="announcements"]')).toHaveCount(0);
  });
});

/**
 * Policies — created, uploaded, and replaced (#28).
 *
 * This is where four of the acceptance criteria are actually settled, because
 * the admin is the only place a document can be replaced and the only place a
 * date could have been typed. The store proves the same properties against real
 * Postgres in `src/lib/policies/store.test.ts`; what only a browser can show is
 * that the *screens* offer no way to do the wrong thing — three fields on the
 * create form, no date control on either form, and no delete anywhere.
 *
 * Serial, and all on one policy of the suite's own: the tests replace its file
 * and then read the version it replaced, so they are a sequence rather than a
 * set. The seeded four are left alone so the public suite has a stable list.
 */
test.describe('policies', () => {
  test.describe.configure({ mode: 'serial' });

  /** Two real PDFs, small enough to compare byte for byte in an assertion. */
  const FIRST = Buffer.from('%PDF-1.7\n1 0 obj\n<<(first)>>\nendobj\ntrailer\n%%EOF\n', 'latin1');
  const SECOND = Buffer.from('%PDF-1.7\n1 0 obj\n<<(second)>>\nendobj\ntrailer\n%%EOF\n', 'latin1');

  const TITLE = 'Suite Transport Policy';
  const SLUG = 'suite-transport-policy';
  const PATH = `/policies/${SLUG}.pdf`;
  const DESCRIPTION = 'How the suite gets to school, written by a browser test.';

  async function upload(page: Page, bytes: Buffer, filename: string): Promise<void> {
    await page.getByLabel(LABELS.file).setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: bytes });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
  }

  // AC 4, and the reason this screen is not the same form twice: creating a
  // policy mints a permanent address, so it asks the three structural questions
  // and offers nothing else to get wrong.
  test('creates one from a title, a position and a tick, and asks nothing else', async ({
    page,
  }) => {
    await signIn(page, '/admin/policies');
    await page.getByRole('link', { name: 'Add a policy' }).click();

    await expect(page.getByLabel(LABELS.title)).toBeVisible();
    await expect(page.getByLabel(LABELS.position)).toBeVisible();
    await expect(page.getByLabel(LABELS.signed)).toBeVisible();
    // Not on the create form: a description, a document, and — anywhere, ever —
    // a date. AC 2 is that the updated date cannot be typed, and the strongest
    // form of that is that there is no control for it.
    await expect(page.getByLabel(LABELS.description)).toHaveCount(0);
    await expect(page.getByLabel(LABELS.file)).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await page.getByLabel(LABELS.title).fill(TITLE);
    await page.getByLabel(LABELS.position).fill('9');
    await page.getByRole('button', { name: 'Create' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    // Created is not published: a policy is published by its file.
    await expect(banner).toContainText('not on the policies page yet');
    await expect(page.getByTestId('versions-empty')).toBeVisible();

    // The address was minted from the title and is now permanent — which is
    // what the create form's three questions are protecting.
    await page.goto('/admin/policies');
    await expect(page.locator(`a[href="/admin/policies/${SLUG}"]`)).toBeVisible();
  });

  // AC 2 and AC 5: the first upload publishes it, and the date it prints is the
  // day the bytes arrived rather than anything a person entered.
  test('publishes it on the first upload, and stamps the date from the file', async ({
    page,
    request,
  }) => {
    await signIn(page, `/admin/policies/${SLUG}`);

    // Still no date control on the edit form either.
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await page.getByLabel(LABELS.description).fill(DESCRIPTION);
    await upload(page, FIRST, 'transport-v1.pdf');

    const today = new Date().toISOString().slice(0, 10);
    await page.goto(POLICIES_PATH);
    const entry = page.locator(`[id="${SLUG}"]`);
    await expect(entry).toContainText(DESCRIPTION);
    await expect(entry.locator('time')).toHaveAttribute('datetime', today);

    const response = await request.get(PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(Buffer.from(await response.body()).equals(FIRST)).toBe(true);
  });

  /*
   * AC 1 and AC 3 together, which is the whole ticket in one test.
   *
   * The replacement has to land at the address that was already printed — same
   * URL, answering for itself rather than redirecting — and the document it
   * replaced has to still be openable, because "what did the family who
   * enrolled in August sign?" is a question the school has to be able to
   * answer.
   */
  test('replaces the file at the same address, and keeps the one it replaced', async ({
    page,
    request,
  }) => {
    await signIn(page, `/admin/policies/${SLUG}`);
    await upload(page, SECOND, 'transport-v2.pdf');

    // The address did not move…
    await expect(page.getByTestId('current-file')).toHaveAttribute('href', PATH);
    const replaced = await request.get(PATH, { maxRedirects: 0 });
    expect(replaced.status()).toBe(200);
    expect(Buffer.from(await replaced.body()).equals(SECOND)).toBe(true);

    // …and version 1 is still there, at its own address, with its own bytes.
    const versions = page.getByTestId('versions').locator('li');
    await expect(versions).toHaveCount(2);
    await expect(versions.first()).toContainText('this is the current one');

    const prior = await request.get(`/policies/${SLUG}/v1.pdf`);
    expect(prior.status()).toBe(200);
    expect(Buffer.from(await prior.body()).equals(FIRST)).toBe(true);
    expect(prior.headers()['cache-control']).toContain('immutable');
  });

  // The address is on printed paper, so nothing here may take it away. Delete
  // is not merely unimplemented — it must not appear.
  test('offers no way to delete a policy or take its document down', async ({ page }) => {
    await signIn(page, `/admin/policies/${SLUG}`);

    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /remove/i })).toHaveCount(0);
  });

  test('refuses a file that is not a PDF, and says so without replacing anything', async ({
    page,
    request,
  }) => {
    await signIn(page, `/admin/policies/${SLUG}`);

    await page
      .getByLabel(LABELS.file)
      .setInputFiles({
        name: 'transport-v3.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('<html>not a pdf at all</html>'),
      });
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#file-error')).toContainText('not a PDF');

    // And the document families are being served is untouched.
    const response = await request.get(PATH);
    expect(Buffer.from(await response.body()).equals(SECOND)).toBe(true);
  });
});

/**
 * The money screen (#29 ACs 2, 5, 6).
 *
 * The confirmation is the thing worth a browser: it is a two-step POST with no
 * JavaScript, so what has to be true is that the first Save does not write, the
 * screen names the change in both directions, and the second post does. The
 * arithmetic and the diff are proved in `src/lib/money/`; what only a browser
 * can show is that a fee changed here reaches the public page a family reads
 * before writing a cheque.
 */
test.describe('saving money', () => {
  // One row, one database across the suite, and each save posts the whole form.
  test.describe.configure({ mode: 'serial' });

  test('will not save until the school confirms it affects every family', async ({ page }) => {
    await signIn(page, '/admin/money');

    const field = page.getByLabel('Deposit, per class');
    const before = await field.inputValue();
    const after = String(Number(before) + 5);

    await field.fill(after);
    await page.getByRole('button', { name: 'Save' }).click();

    // Step one: a confirmation naming the change, not a save.
    const confirm = page.getByTestId('confirm');
    await expect(confirm).toContainText('This affects every family.');
    await expect(confirm.locator('[data-change="classDeposit"]')).toContainText(`$${before}`);
    await expect(confirm.locator('[data-change="classDeposit"]')).toContainText(`$${after}`);
    // And it says the thing that makes the change safe to make at all.
    await expect(confirm).toContainText('keep the terms they agreed to');

    // Nothing was written: coming back shows the old figure.
    await page.goto('/admin/money');
    await expect(page.getByLabel('Deposit, per class')).toHaveValue(before);

    // Step two: confirm, and now it writes and says so.
    await page.getByLabel('Deposit, per class').fill(after);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Yes, change it for everyone' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');
    await expect(page.getByLabel('Deposit, per class')).toHaveValue(after);

    // AC 1 and AC 6 together: the figure a family is quoted follows the row.
    await page.goto('/admissions');
    await expect(page.locator('#cost')).toContainText(`$${after}`);

    // Put it back, the same way a person would have to.
    await page.goto('/admin/money');
    await page.getByLabel('Deposit, per class').fill(before);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Yes, change it for everyone' }).click();
    await expect(page.getByLabel('Deposit, per class')).toHaveValue(before);
  });

  test('lets the school back out of the confirmation without saving', async ({ page }) => {
    await signIn(page, '/admin/money');

    const field = page.getByLabel('Late fee, per class');
    const before = await field.inputValue();

    await field.fill(String(Number(before) + 5));
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('link', { name: 'Go back without saving' }).click();

    await expect(page.getByTestId('confirm')).toHaveCount(0);
    await expect(page.getByLabel('Late fee, per class')).toHaveValue(before);
  });

  test('does not stamp the row when nothing actually changed', async ({ page }) => {
    await signIn(page, '/admin/money');

    await page.getByRole('button', { name: 'Save' }).click();

    const banner = page.getByTestId('save-banner');
    await expect(banner).toContainText('Nothing changed');
    await expect(page.getByTestId('confirm')).toHaveCount(0);
  });

  test('holds more than one address for application notifications', async ({ page }) => {
    await signIn(page, '/admin/money');

    const addresses = 'jkilker@enolacog.com\ngeorge@enolacog.com';
    await page.getByLabel('Application notifications go to').fill(addresses);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Yes, change it for everyone' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
    await page.goto('/admin/money');
    await expect(page.getByLabel('Application notifications go to')).toHaveValue(addresses);
  });

  test('refuses a rate of zero, and never offers to confirm one', async ({ page }) => {
    await signIn(page, '/admin/money');

    await page.getByLabel('Standard rate, per hour').fill('0');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('confirm')).toHaveCount(0);
    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#standardRate-error')).toContainText('cannot be zero');
  });

  test('prints the study hall contradiction the school still owes an answer on', async ({
    page,
  }) => {
    await signIn(page, '/admin/money');

    // #29 AC 7. The handbook says $10 on page 3 and $60 on page 8; this surface
    // holds one number, so the disagreement is stated beside the field rather
    // than quietly averaged away.
    await expect(page.locator('#studyHallFee-hint')).toContainText('page 3');
    await expect(page.locator('#studyHallFee-hint')).toContainText('page 8');
  });
});

/**
 * Download everything (#33, AC 3).
 *
 * `export.test.ts` already opens the archive with an independent unzipper and
 * checks what is in it. What only a browser can settle is the other half of the
 * criterion: that the button is reachable by a signed-in admin who has never
 * been told a URL, that clicking it produces a *download* rather than a page,
 * and that the bytes which arrive over HTTP are still a readable ZIP — which is
 * the thing a wrong content type or a mangled response body would break without
 * failing a single unit test.
 */
test.describe('Download everything', () => {
  test('downloads a ZIP the school can open, from a button in the nav', async ({ page }) => {
    await signIn(page, '/admin/school-details');

    // Found by navigating, because a backup nobody can find is the same as no
    // backup.
    await page.getByRole('link', { name: 'Backup' }).click();
    await expect(page).toHaveURL(/\/admin\/backup$/);

    const downloading = page.waitForEvent('download');
    await page.getByTestId('download-everything').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(/^pharos-academy-backup-\d{4}-\d{2}-\d{2}\.zip$/);

    const path = await download.path();
    const bytes = await readFile(path!);
    // "Readable without Postgres" — opened here with fflate, the independent
    // implementation, on the bytes that actually came down the wire.
    const files = unzipSync(bytes);
    expect(files['README.txt']).toBeDefined();
    expect(files['manifest.json']).toBeDefined();
    expect(Object.keys(files).some((name) => name.startsWith('content/'))).toBe(true);
    expect(Buffer.from(files['content/people.json']).toString('utf8')).toContain('Jill');
  });

  /*
   * The archive is the whole school's content, so the address it comes from is
   * the most valuable one in the app. The guard is the middleware's rather than
   * this route's, which is exactly why it is worth proving from outside: an
   * endpoint under `/admin` inherits it by existing, and "by existing" is a
   * claim, not an assertion, until something checks.
   */
  test('hands nothing to anybody who is not signed in', async ({ page, context }) => {
    await context.clearCookies();

    const response = await page.goto('/admin/backup.zip');

    expect(response?.status()).toBe(200); // The login page, having followed the redirect.
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fbackup\.zip$/);
    expect(response?.headers()['content-type']).toContain('text/html');
  });

  test('says where the monthly copy goes, and reads it from the settings', async ({ page }) => {
    await signIn(page, '/admin/school-details');
    const email = await page.getByLabel('Email').inputValue();

    await page.goto('/admin/backup');

    // AC 4 as the school sees it: the screen names the address the send
    // actually uses, so the two cannot disagree.
    await expect(page.getByRole('heading', { name: 'This also arrives by email' })).toBeVisible();
    await expect(page.locator('main')).toContainText(email);
    await expect(page.locator('main')).toContainText('1st of every month');
  });
});

/**
 * Inquiries, as Jill reads them (#25 AC 7, and the other half of AC 2).
 *
 * Folded into this file rather than given its own, because a spec of its own
 * would have to be named in the `admin` project's `testMatch` list — and that
 * list is enumerated one file at a time for a reason
 * (`admin-revalidation.spec.ts` needs a different server), so a file added to
 * `e2e/` and forgotten there would silently never run.
 *
 * The inquiry is submitted through the public form on the same dev server, so
 * this is genuinely end to end: what the admin shows is what a parent typed,
 * not a row this test inserted. The suite has no `RESEND_API_KEY`, so it also
 * lands on the case the ticket cares most about — saved, but nobody emailed —
 * which is invisible everywhere else on the site, because the parent was
 * correctly told we have their question.
 */
test.describe('inquiries', () => {
  test('shows what a family asked, and says when nobody was emailed', async ({ page }) => {
    const name = 'Suite Admin Reader';
    const email = 'suite-admin-reader@example.com';

    await page.goto(INQUIRY_PATH);
    await page.fill('#ask-name', name);
    await page.fill('#ask-email', email);
    await page.fill('#ask-ages', '7 and 15');
    await page.fill('#ask-message', 'Do you take a child mid-year?');
    await page.getByRole('button', { name: 'Send my question' }).click();
    await expect(page.locator('[data-outcome="received"]')).toBeVisible();

    // Found by navigating, because a screen nobody can find is not a screen
    // Jill can read.
    await signIn(page, '/admin/school-details');
    await page.getByRole('link', { name: 'Inquiries' }).click();
    await expect(page).toHaveURL(/\/admin\/inquiries$/);

    // Newest first, so the one just submitted is the one at the top.
    const entry = page.getByTestId('inquiry').first();
    await expect(entry.getByTestId('inquiry-name')).toHaveText(name);
    await expect(entry.getByTestId('inquiry-email')).toHaveText(email);
    await expect(entry.getByTestId('inquiry-ages')).toContainText('7 and 15');
    await expect(entry.getByTestId('inquiry-message')).toHaveText('Do you take a child mid-year?');

    // AC 2's other direction: the send failed, and the screen says so rather
    // than letting the school assume an email went out.
    await expect(entry.getByTestId('inquiry-delivery')).toContainText('Nobody was emailed');
    await expect(entry.getByTestId('inquiry-delivery')).toContainText('RESEND_API_KEY');
  });

  test('names the address list it is read at, and where that list is edited', async ({ page }) => {
    // AC 3 as the school sees it: the recipients are settings, and the screen
    // says which settings — so the two cannot drift apart in Jill's head.
    await signIn(page, '/admin/money');
    const addresses = await page.getByLabel('Application notifications go to').inputValue();

    await page.goto('/admin/inquiries');
    for (const address of addresses.split('\n').filter(Boolean)) {
      await expect(page.locator('main')).toContainText(address.trim());
    }
    await expect(page.locator('main')).toContainText('Money screen');
  });

  test('offers no way to edit or delete what a family typed', async ({ page }) => {
    await signIn(page, '/admin/inquiries');

    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
  });
});

/**
 * Applications, as the school reads them (#32).
 *
 * Folded into this file for the reason the inquiries are: a spec of its own
 * would have to be named in the `admin` project's `testMatch` list, and a file
 * added to `e2e/` and forgotten there silently never runs.
 *
 * Every application here is submitted through the public form on the same dev
 * server, so what the admin shows is what a family sent rather than a row the
 * test inserted — which is the only way the tally is genuinely being tested,
 * since the tally's whole job is to reconcile rows nobody wrote on purpose.
 */
test.describe('applications', () => {
  /** Send one application through the public form, as a family would. */
  async function apply(
    page: Page,
    family: {
      name: string;
      email: string;
      child: string;
      offering: string;
      objection?: string;
      /** The two agreements (#71), when the test is about them. */
      handbook?: 'student' | 'parent' | 'neither';
      codeOfConduct?: 'student' | 'parent' | 'neither';
    },
  ): Promise<void> {
    await page.goto(APPLICATION_PATH);
    await page.fill('#apply-family-name', family.name);
    await page.fill('#apply-email', family.email);
    await page.fill('#apply-child-0-name', family.child);
    await page.fill('#apply-child-0-age', '13');
    await page.check(`input[name="child-0-classes"][value="${family.offering}"]`);
    if (family.objection) await page.fill('#apply-objections', family.objection);

    /*
     * What #85 added to a sendable application: one respondent's whole column of
     * the Statement of Faith grid, and an answer to each published document.
     * "Neither agrees" is the default here because the gate is about having
     * answered — a test that had to agree to send would be testing the wrong
     * thing.
     */
    for (const question of FAITH_QUESTIONS) {
      await page.check(`input[name="${faithKey('Father', question.id)}"][value="yes"]`);
    }
    await page.check(
      `[data-agreement="handbook"] input[value="${family.handbook ?? 'neither'}"]`,
    );
    await page.check(
      `[data-agreement="code-of-conduct"] input[value="${family.codeOfConduct ?? 'neither'}"]`,
    );

    await page.getByRole('button', { name: 'Send the application' }).click();
    await expect(page.locator('[data-outcome="received"]')).toBeVisible();
  }

  /** The application the school is looking at, found by the family's name. */
  const rowFor = (page: Page, family: string) =>
    page.getByTestId('application').filter({ hasText: family }).first();

  test('moves the money without moving the application, and back (AC 2)', async ({ page }) => {
    const family = 'Suite Two Axes';
    await apply(page, {
      name: family,
      email: 'suite-two-axes@example.com',
      child: 'Axis Child',
      offering: 'algebra-1:year',
    });

    // Found by navigating: a screen nobody can find is not a screen Jill reads.
    await signIn(page, '/admin/school-details');
    await page.getByRole('link', { name: 'Applications' }).click();
    await expect(page).toHaveURL(/\/admin\/applications$/);

    const row = rowFor(page, family);
    await expect(row.getByTestId('application-state')).toContainText('Submitted');
    await expect(row.getByTestId('application-payment')).toContainText('Awaiting cheque');

    // The cheque arrives. The application has not moved.
    await row.getByRole('button', { name: 'Cheque has arrived' }).click();
    await expect(rowFor(page, family).getByTestId('application-payment')).toContainText(
      'Cheque received',
    );
    await expect(rowFor(page, family).getByTestId('application-state')).toContainText('Submitted');

    // The family enrols. The money has not moved.
    await rowFor(page, family).getByRole('button', { name: 'Enrol this family' }).click();
    await expect(rowFor(page, family).getByTestId('application-state')).toContainText('Enrolled');
    await expect(rowFor(page, family).getByTestId('application-payment')).toContainText(
      'Cheque received',
    );
  });

  test('counts a family that applied twice once, and says so (AC 1)', async ({ page }) => {
    const family = 'Suite Twice';
    const once = {
      name: family,
      email: 'suite-twice@example.com',
      child: 'Twice Child',
      offering: 'beginner-latin-grades-5-6:year',
    };

    await apply(page, once);
    await apply(page, once);

    await signIn(page, '/admin/applications');

    // Both applications are kept — nothing was blocked on the email address.
    await expect(page.getByTestId('application').filter({ hasText: family })).toHaveCount(2);

    // And the tally counts the child once, with the note that explains it.
    await expect(page.getByTestId('class-tally')).toContainText('second submission');
    await expect(rowFor(page, family).getByTestId('application-resubmitted')).toBeVisible();
  });

  test('raises the conversation flag, and never calls it a rejection (AC 5)', async ({ page }) => {
    const family = 'Suite Objection';
    await apply(page, {
      name: family,
      email: 'suite-objection@example.com',
      child: 'Objecting Child',
      offering: 'algebra-1:year',
      objection: 'We would like to talk about article 9.',
    });

    await signIn(page, '/admin/applications');
    const flag = rowFor(page, family).getByTestId('application-flag');

    await expect(flag).toBeVisible();
    await expect(flag).toContainText('article 9');
    await expect(flag).toContainText('not a refusal');
    // The family is told the same thing on the way out — an objection routes to
    // a conversation and stops nothing.
    await expect(rowFor(page, family).getByTestId('application-state')).toContainText('Submitted');
  });

  test('reads both agreements by hand, each in the family’s own words (#71 AC 6)', async ({
    page,
  }) => {
    const family = 'Suite Agreements';
    await apply(page, {
      name: family,
      email: 'suite-agreements@example.com',
      child: 'Agreeing Child',
      offering: 'algebra-1:year',
      handbook: 'neither',
      codeOfConduct: 'student',
    });

    await signIn(page, '/admin/applications');
    const agreements = rowFor(page, family).getByTestId('application-agreements');

    /*
     * Each answer in the family's own words, against the version they were
     * shown, and the two read independently of one another.
     *
     * #85 closed the case this test used to cover — an application arriving with
     * a published document left blank — because a question the family was asked
     * now has to be answered before it can be sent. "Not answered" is still what
     * the screen says for a document nobody was asked about, and
     * `agreements.test.ts` holds that: it is no longer producible through the
     * public form, so asserting it here would be asserting a state the form
     * cannot reach.
     */
    await expect(agreements.locator('[data-agreement="handbook"]')).toContainText('Neither agrees');
    await expect(agreements.locator('[data-agreement="handbook"]')).toContainText('version');
    await expect(agreements.locator('[data-agreement="code-of-conduct"]')).toContainText(
      'Student agrees',
    );
    await expect(agreements.locator('[data-agreement="code-of-conduct"]')).toContainText('version');

    // "Neither agrees" is not a conversation flag, and never was on the live
    // form either — the application goes through like any other.
    await expect(rowFor(page, family).getByTestId('application-flag')).toHaveCount(0);
    await expect(rowFor(page, family).getByTestId('application-state')).toContainText('Submitted');
  });

  test('says when nobody at the school was emailed', async ({ page }) => {
    // The suite has no `RESEND_API_KEY`, which is exactly the case #32 AC 6
    // cares about: the application saved, the family was told on screen, and
    // only this line says the school's own copy never went.
    const family = 'Suite Undelivered';
    await apply(page, {
      name: family,
      email: 'suite-undelivered@example.com',
      child: 'Quiet Child',
      offering: 'algebra-1:year',
    });

    await signIn(page, '/admin/applications');
    const delivery = rowFor(page, family).getByTestId('application-delivery');

    await expect(delivery).toContainText('Nobody at the school was emailed');
    await expect(delivery).toContainText('RESEND_API_KEY');
  });

  test('names the address list it is read at, and where that list is edited', async ({ page }) => {
    await signIn(page, '/admin/money');
    const addresses = await page.getByLabel('Application notifications go to').inputValue();

    await page.goto('/admin/applications');
    for (const address of addresses.split('\n').filter(Boolean)) {
      await expect(page.locator('main')).toContainText(address.trim());
    }
    await expect(page.locator('main')).toContainText('Money screen');
  });

  test('offers no way to edit or delete what a family sent', async ({ page }) => {
    await signIn(page, '/admin/applications');

    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
  });
});

test.describe('accessibility', () => {
  for (const path of [
    '/admin/login',
    '/admin/money',
    '/admin/school-details',
    '/admin/users',
    '/admin/people',
    '/admin/people/jill-kilker',
    '/admin/people/new',
    '/admin/announcements',
    '/admin/announcements/new',
    '/admin/policies',
    '/admin/policies/handbook',
    '/admin/policies/new',
    '/admin/backup',
    // #23. The School Year screen is the densest form on the site — eight date
    // and week pairs, a repeating closure row and a table redrawn by script —
    // and the preview is the only region here whose content changes without a
    // navigation.
    '/admin/school-year',
    '/admin/events',
    '/admin/events/new',
    // #24. The course editor is the School Year screen's rival for density —
    // three groups of checkboxes, four selects and a computed price that is
    // read-only text rather than a disabled input, which is the part a
    // screen reader has to be told correctly.
    '/admin/courses',
    '/admin/courses/algebra-1',
    '/admin/courses/new',
    // #25. A list of what families typed, with a warning line on any inquiry
    // the school was not emailed about — and the one admin screen whose content
    // comes from the public site rather than from an admin form.
    '/admin/inquiries',
    // #32. Two rows of buttons under every application — the application's own
    // state and the money's — which is the screen's densest interactive region
    // and the one where a screen reader has to be able to tell them apart.
    '/admin/applications',
  ]) {
    for (const width of ADMIN_WIDTHS) {
      test(`${path} has zero axe violations at ${width}px`, async ({ page }) => {
        if (path !== '/admin/login') await signIn(page, path);

        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        expect(violations.map(describeViolation)).toEqual([]);
      });
    }
  }

  test('the save banner is announced without stealing focus', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('save-banner')).toHaveAttribute('role', 'status');
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
