import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { signIn } from './suite-admin.js';

/**
 * The four list screens, empty, say what emptiness means (#197).
 *
 * Runs from `playwright.empty-lists.config.ts` alone: its dev server sets
 * `E2E_EMPTY_LISTS`, which is the only way People, Classes, Announcements and
 * Policies can be empty — the migrations seed all four and no screen deletes.
 * The main suite's server is fully seeded, so this spec would fail there,
 * which is why the `admin` project's testMatch does not name it.
 *
 * What is asserted is the shape of the promise, not the prose: each screen
 * answers its own empty list with a sentence instead of a blank, and still
 * offers its Add link — an empty database is the one place a first row could
 * be needed.
 */
const SCREENS = [
  { path: '/admin/people', testId: 'no-people', add: 'Add a person' },
  { path: '/admin/courses', testId: 'no-courses', add: 'Add a course' },
  {
    path: '/admin/announcements',
    testId: 'no-announcements',
    add: 'Post an announcement',
  },
  { path: '/admin/policies', testId: 'no-policies', add: 'Add a policy' },
] as const;

/** The same bar the seeded admin screens are held to (`admin.spec.ts`). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const screen of SCREENS) {
  test(`${screen.path} says what an empty list means`, async ({ page }) => {
    await signIn(page, screen.path);

    const message = page.getByTestId(screen.testId);
    await expect(message).toBeVisible();
    await expect(message).toContainText('has not been set up yet');

    // No hollow list alongside the sentence, and still a way to add.
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(page.getByRole('link', { name: screen.add })).toBeVisible();
  });

  test(`${screen.path} has zero axe violations when it is empty`, async ({ page }) => {
    await signIn(page, screen.path);

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}

test('the Policies screen does not claim every policy has a document when there are none', async ({
  page,
}) => {
  await signIn(page, '/admin/policies');

  await expect(page.getByTestId('awaiting-count')).toHaveCount(0);
});
