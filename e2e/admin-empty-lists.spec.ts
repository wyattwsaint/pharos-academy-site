import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { AXE_TAGS } from './axe.js';
import { signIn } from './suite-admin.js';

/**
 * The four list screens, empty, say what emptiness means (#197).
 *
 * Runs from `playwright.empty-lists.config.ts` alone: its dev server sets
 * `E2E_EMPTY_LISTS`, which is the only way People, Classes, Announcements and
 * Policies can be empty — the migrations seed all four and no screen deletes.
 * The main suite's server is fully seeded, so this spec would fail there, which
 * is why the `admin` project's testMatch does not name it.
 *
 * Each screen is held to a phrase of its own rather than to a shared one. The
 * point of the ticket is that an empty Policies screen does not read like an
 * empty People screen, and one sentence asserted on all four would pass a
 * change that made them identical again.
 */
const SCREENS = [
  {
    path: '/admin/people',
    testId: 'no-people',
    add: 'Add a person',
    says: 'The staff page and the name printed on every class are read from this list',
  },
  {
    path: '/admin/courses',
    testId: 'no-courses',
    add: 'Add a course',
    says: 'The first class added fills all of them at once.',
  },
  {
    path: '/admin/announcements',
    testId: 'no-announcements',
    add: 'Post an announcement',
    says: 'goes to the top of the news page the moment it is saved',
  },
  {
    path: '/admin/policies',
    testId: 'no-policies',
    add: 'Add a policy',
    says: 'the policies page has nothing for a family to read or sign',
  },
] as const;

for (const screen of SCREENS) {
  test(`${screen.path} says what an empty list means`, async ({ page }) => {
    await signIn(page, screen.path);

    const message = page.getByTestId(screen.testId);
    await expect(message).toBeVisible();
    await expect(message).toContainText(screen.says);

    // No hollow list alongside the sentence, and still a way to add.
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(page.getByRole('link', { name: screen.add })).toBeVisible();
  });

  test(`${screen.path} has zero axe violations when it is empty`, async ({ page }) => {
    await signIn(page, screen.path);

    const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

    expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}

test('the Policies screen does not claim every policy has a document when there are none', async ({
  page,
}) => {
  await signIn(page, '/admin/policies');

  await expect(page.getByTestId('awaiting-count')).toHaveCount(0);
});
