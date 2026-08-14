import { expect, test, type Page } from '@playwright/test';

import { signIn } from './suite-admin.js';

/**
 * The two progressive enhancements every admin form carries (#199).
 *
 * They belong to the layout rather than to a screen, so they are proved once
 * here instead of a screen at a time; School details is simply the nearest form
 * to drive.
 *
 * **Nothing here saves.** The save is answered at the browser, so the throwaway
 * database this suite shares is never written and the specs that pin its
 * contents — running beside these, against the same server — cannot be
 * disturbed by them. What is under test is the browser's half anyway: what the
 * button does, and what the form puts on the wire.
 */

const SCREEN = '/admin/school-details';

/** Where an intercepted save is sent, so that "it finished" is observable. */
const ANSWERED = `${SCREEN}?answered=1`;

/**
 * Sign in, and wait for the enhancements to be listening.
 *
 * The script is deferred, so every admin screen is briefly the plain form it is
 * with scripts off. Without this wait these specs would sometimes drive that
 * form and report the enhancement missing when it was merely late.
 */
async function openScreen(page: Page): Promise<void> {
  await signIn(page, SCREEN);
  await expect(page.locator('html[data-admin-forms]')).toBeAttached();
}

/**
 * Answer the screen's saves here instead of at the server, and keep what each
 * one put on the wire.
 *
 * Answered with the redirect a save ends in, to a URL the screen ignores but
 * the spec can wait for — that is what makes "the response arrived" a moment
 * rather than a guess.
 */
async function interceptSaves(page: Page): Promise<string[]> {
  const posts: string[] = [];
  await page.route(`**${SCREEN}`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postData() ?? '');
    await route.fulfill({ status: 303, headers: { location: ANSWERED } });
  });
  return posts;
}

/**
 * What the Save button looked like at the moment the form was submitted.
 *
 * Recorded from inside the page rather than asked for from outside, because the
 * pending state lives entirely inside a navigation, and every way Playwright
 * has of reading the DOM waits for that navigation to finish first — which is
 * exactly when the pending state ends.
 *
 * Registered on the loaded page rather than at document start, so it runs after
 * the layout's own `submit` handler and reads what that handler left: listeners
 * fire in the order they were added. `sessionStorage` survives the navigation,
 * which is what makes the reading legible afterwards.
 */
async function recordPendingState(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener('submit', () => {
      const button = document.querySelector<HTMLButtonElement>('main form button[type=submit]');
      sessionStorage.setItem(
        'spec:pending',
        JSON.stringify({
          label: button?.textContent?.trim() ?? '',
          disabled: button?.disabled ?? false,
        }),
      );
    });
  });
}

function pendingState(page: Page): Promise<unknown> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('spec:pending') ?? 'null'));
}

test.describe('a save', () => {
  test('disables its button and says it is saving until the response arrives', async ({ page }) => {
    await openScreen(page);
    await interceptSaves(page);
    await recordPendingState(page);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`**${ANSWERED}`);

    // What the office sees between the click and the answer.
    expect(await pendingState(page)).toEqual({ label: 'Saving…', disabled: true });

    // And the answer redraws the form, so the button is a button again.
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('is one POST however many times Save is clicked', async ({ page }) => {
    await openScreen(page);
    const posts = await interceptSaves(page);

    await page.getByRole('button', { name: 'Save' }).dblclick();
    await page.waitForURL(`**${ANSWERED}`);

    expect(posts).toHaveLength(1);
  });

  test('still sends the form it was pressed on', async ({ page }) => {
    await openScreen(page);
    const posts = await interceptSaves(page);

    // Disabling a control takes it out of the submission, so the enhancement
    // has to leave the rest of the form — and anything the pressed button
    // itself carried — intact. Asserted on the wire: what the server would
    // receive is the only version of this that matters.
    await page.getByLabel('Mission').fill('What the office typed.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`**${ANSWERED}`);

    expect(posts).toHaveLength(1);
    expect(new URLSearchParams(posts[0]).get('mission')).toBe('What the office typed.');
  });
});

test.describe('leaving a form', () => {
  test('warns when a field has been edited', async ({ page }) => {
    await openScreen(page);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });

    await page.getByLabel('Mission').fill('An edit that has not been saved.');
    await page.getByRole('link', { name: 'People' }).click();

    // Dismissed, so the browser stays put and the typing survives.
    await expect(page).toHaveURL(new RegExp(`${SCREEN}$`));
    expect(dialogs).toEqual(['beforeunload']);
  });

  test('says nothing about a form that was only looked at', async ({ page }) => {
    await openScreen(page);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });

    // Focus and a click, but no change: looking at a form is not editing it.
    await page.getByLabel('Mission').click();
    await page.getByRole('link', { name: 'People' }).click();

    await expect(page).toHaveURL(/\/admin\/people$/);
    expect(dialogs).toEqual([]);
  });

  test('says nothing on the way out of a save', async ({ page }) => {
    await openScreen(page);
    await interceptSaves(page);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });

    // Typing arms the guard, and the save is what disarms it — a warning here
    // would fire on every save the admin ever makes.
    await page.getByLabel('Mission').fill('An edit that is about to be saved.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`**${ANSWERED}`);

    expect(dialogs).toEqual([]);
  });
});
