import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { SUITE_ADMIN, signIn } from './suite-admin.js';

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
    await page.goto('/staff');
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
 * Announcements, and the disappearing homepage section (#27).
 *
 * This is where AC 1 and AC 2 are actually settled, because the admin is the
 * only place a posted date can be changed — and the posted date is the whole of
 * the freshness rule. Nothing here depends on the wall clock: the section is
 * emptied by aging every announcement through the form and brought back by
 * posting one dated today.
 *
 * Serial, because these tests share one database with each other and the last
 * of them changes what every announcement's date is.
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

  // AC 1, the half without a file, and AC 2's showing branch in the same pass.
  test('posts an announcement with no PDF, onto the news page and the homepage', async ({
    page,
  }) => {
    const headline = 'Suite notice, no file';
    await post(page, { headline, body: 'Posted by the browser suite, with nothing attached.' });

    const banner = page.getByTestId('save-banner');
    await expect(banner).toHaveAttribute('data-ok', 'true');
    await expect(banner).toContainText('Saved and live.');
    await expect(page.getByTestId('stamp')).toContainText('Last edited by Suite Admin');

    // The news page carries it in full…
    await page.goto('/news');
    const entry = page.locator('#news li', { hasText: headline });
    await expect(entry.getByRole('heading', { name: headline })).toBeVisible();
    await expect(entry.locator('a[href$=".pdf"]')).toHaveCount(0);

    // …and the homepage band is showing it, because it was posted today.
    await page.goto('/');
    const band = page.locator('[data-section="announcements"]');
    await expect(band).toBeVisible();
    await expect(band.getByRole('link', { name: headline })).toBeVisible();
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

    await page.goto('/news');
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

    await page.goto('/news');
    await expect(page.getByRole('heading', { name: 'Suite notice, bad file' })).toHaveCount(0);
  });

  /*
   * AC 2's other branch, and the reason this file's announcements are serial.
   *
   * Every announcement is aged past six weeks through the form — the only lever
   * that exists, and the honest one, because it is what Jill would do. The
   * section then has to be gone from the page rather than merely empty of
   * items, and the news page has to still have every one of them, which is the
   * pair of behaviours the whole ticket is about.
   *
   * A fresh announcement at the end brings the band back, so the database is
   * left in a state the rest of the suite recognises, and proves the transition
   * runs both ways.
   */
  test('hides the homepage section entirely once every announcement is stale', async ({ page }) => {
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

    await page.goto('/');
    const band = page.locator('[data-section="announcements"]');
    // Still in the document, because the section order is asserted as a
    // sequence — and carrying nothing, and not visible.
    await expect(band).toHaveCount(1);
    await expect(band).not.toBeVisible();
    await expect(band.locator('li')).toHaveCount(0);

    // Nothing was lost: the record is all still on the news page.
    await page.goto('/news');
    for (const slug of slugs) {
      await expect(page.locator(`[id="${slug}"]`), slug).toHaveCount(1);
    }

    // And one posted today brings the section back.
    await post(page, { headline: 'Suite notice, back again', body: 'Dated today.' });
    await page.goto('/');
    await expect(band).toBeVisible();
    await expect(band.getByRole('link', { name: 'Suite notice, back again' })).toBeVisible();
  });
});

test.describe('accessibility', () => {
  for (const path of [
    '/admin/login',
    '/admin/school-details',
    '/admin/users',
    '/admin/people',
    '/admin/people/jill-kilker',
    '/admin/people/new',
    '/admin/announcements',
    '/admin/announcements/new',
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
