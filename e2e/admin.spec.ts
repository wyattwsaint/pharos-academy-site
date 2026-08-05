import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

test.describe('accessibility', () => {
  for (const path of ['/admin/login', '/admin/school-details', '/admin/users']) {
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
