import { expect, type Page } from '@playwright/test';

/**
 * The account the admin specs sign in as, and the act of signing in.
 *
 * Not a secret and not meant to be. Setting `E2E_ADMIN_USERNAME` and
 * `E2E_ADMIN_PASSWORD` makes the server open a throwaway in-process database
 * and put exactly this account in it (`src/lib/db/client.ts`), and it refuses
 * to do that on a deployed environment — so these specs only ever run against a
 * server `playwright.config.ts` started.
 *
 * The password clears `MIN_PASSWORD_LENGTH`, because it is created through the
 * same `createUser` a real account is.
 */
export const SUITE_ADMIN = {
  username: 'suite-admin',
  password: 'a-long-enough-suite-passphrase',
};

/**
 * The account that exists so the delete confirmation can be measured (#202).
 *
 * Seeded beside Suite Spare by `src/lib/db/client.ts` and never deleted: the
 * spare is removed by `admin.spec.ts`, so an axe spec aimed at the
 * confirmation screen could not rely on it still being there.
 */
export const SUITE_KEPT = 'Suite Kept';

/**
 * The class the throwaway database retires, so the retired states can be
 * measured (#263).
 *
 * Written out rather than imported from `src/lib/db/client.ts`, the way
 * `SUITE_KEPT` is: `playwright.config.ts` loads this module to build its
 * environment, and re-exporting from the client would drag the database driver
 * and every migration into the config's own import graph.
 */
export const SUITE_RETIRED_COURSE = 'suite-retired-class';

/**
 * The person the throwaway database retires, so the People screen's retired
 * section can be measured (#266). Written out here for the reason above.
 *
 * They teach nothing: a retired person who taught a seeded class would unname
 * it on four public surfaces the rest of this suite pins against the seed.
 */
export const SUITE_RETIRED_PERSON = {
  slug: 'suite-departed-instructor',
  name: 'Mrs. Suite Departed',
} as const;

/** Sign in and land on `next`. Fails loudly rather than leaving a spec adrift. */
export async function signIn(page: Page, next = '/admin/school-details'): Promise<void> {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Username').fill(SUITE_ADMIN.username);
  await page.getByLabel('Password').fill(SUITE_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(next)}$`));
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
