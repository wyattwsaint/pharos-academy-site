import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

import { LABELS } from '../src/lib/admin/policies.js';
import { SUITE_ADMIN, signIn } from './suite-admin.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';
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
    await page.goto(NEWS_PATH);
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
    await page.goto(NEWS_PATH);
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
