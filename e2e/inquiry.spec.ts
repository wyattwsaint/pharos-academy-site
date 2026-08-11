import { expect, test, type Page } from '@playwright/test';

import { BELIEFS_PATH } from '../src/lib/about/beliefs.js';
import { NEWS_PATH } from '../src/lib/announcements/views.js';
import { INQUIRY_PATH, RECEIVED_MESSAGE } from '../src/lib/inquiry/inquiry.js';
import { STAFF_PATH } from '../src/lib/people/views.js';

/**
 * The inquiry, over real HTTP (#25 AC 8).
 *
 * The domain rules are unit-tested in `src/lib/inquiry/inquiry.test.ts` and the
 * rows in `store.test.ts`. What only a browser can settle is the part this
 * ticket is actually about: a form on an ISR page posting **across** to the one
 * page that renders on request, and coming back with an answer specific to that
 * one submission. A `method="post"` that reaches nothing fails no unit test.
 *
 * The suite runs with no mail credentials, so a valid submission here takes the
 * **store succeeds / send fails** path — which is the case worth asserting,
 * because it is the one a real deployment is in today (there is no Resend
 * account yet). The parent must still be told we have their question, because
 * the row is the backing for that sentence; `admin.spec.ts` then proves the
 * school's copy is flagged as un-emailed rather than quietly assumed sent.
 *
 * Names and addresses here are obviously the suite's own: a valid submission
 * writes a real row, and a row a person has to guess about is a row somebody
 * replies to.
 */

/**
 * Whether this run is allowed to submit anything.
 *
 * `PLAYWRIGHT_BASE_URL` points the suite at a real deployment, and
 * `deployed-accessibility.yml` sets it for **production** as well as for
 * previews. A valid submission there is a junk lead in the list Jill reads and,
 * once Resend is provisioned, a real email to the school and to a made-up
 * address at example.com. So the tests that write are local only; everything
 * that merely reads — including a *refused* submission, which stores and mails
 * nothing — runs against the deployment, where it is worth far more.
 */
const MAY_SUBMIT = !process.env.PLAYWRIGHT_BASE_URL;

/**
 * A response-time promise, in the shapes it would actually be written in.
 * Mirrors the scan in `inquiry.test.ts`, which covers the emails; this covers
 * the page, which is the other place the sentence could be added.
 */
const CLOCKS =
  /\b(within|in)\s+(a|an|one|two|three|24|48|72|\d+)\s*(hour|hours|day|days|week|weeks|business)/i;

/** The pages the button has to work from — a nav destination, a leaf, the longest prose. */
const ANYWHERE = ['/', '/classes', '/classes/algebra-1', '/admissions', BELIEFS_PATH, NEWS_PATH];

/** Fill the copy of the form namespaced by `idPrefix`. */
async function fill(
  page: Page,
  idPrefix: string,
  fields: { name?: string; email?: string; ages?: string; message?: string },
): Promise<void> {
  for (const [field, value] of Object.entries(fields)) {
    await page.fill(`#${idPrefix}-${field}`, value!);
  }
}

test.describe('the inquiry page', () => {
  test('answers 200 and is the form and nothing else', async ({ page }) => {
    const response = await page.goto(INQUIRY_PATH);

    expect(response?.status()).toBe(200);
    await expect(page.locator('form[data-inquiry-form]')).toHaveCount(1);
    await expect(page.locator('#ask-ages')).toBeVisible();
  });

  test('asks for no phone number, on either copy of the form', async ({ page }) => {
    // AC 6. Not "is not required" — it must not exist. A phone field raises the
    // perceived commitment of the form more than any other, and a parent who
    // wants a call says so in the message.
    await page.goto(INQUIRY_PATH);
    await expect(page.locator('input[name="phone"], input[type="tel"]')).toHaveCount(0);

    await page.goto('/');
    await expect(page.locator('input[name="phone"], input[type="tel"]')).toHaveCount(0);
  });

  test('refuses an incomplete submission and gives back what was typed', async ({ page }) => {
    await page.goto(INQUIRY_PATH);

    await fill(page, 'ask', { name: 'Suite Parent' });
    await page.getByRole('button', { name: 'Send my question' }).click();

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    // Nothing was thrown away — a form that clears itself is a family who does
    // not fill it in twice.
    await expect(page.locator('#ask-name')).toHaveValue('Suite Parent');
    await expect(page.locator('#ask-email-error')).toBeVisible();
    await expect(page.locator('#ask-ages-error')).toBeVisible();
    await expect(page.locator('#ask-email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('refuses an address that is not one', async ({ page }) => {
    await page.goto(INQUIRY_PATH);

    await fill(page, 'ask', { name: 'Suite Parent', email: 'not-an-address', ages: '6 and 9' });
    await page.getByRole('button', { name: 'Send my question' }).click();

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#ask-email-error')).toContainText('does not look like');
    await expect(page.locator('#ask-ages')).toHaveValue('6 and 9');
  });

  test('takes a real submission and says we have it', async ({ page }) => {
    test.skip(!MAY_SUBMIT, 'a real submission writes a row and emails the school');
    await page.goto(INQUIRY_PATH);

    await fill(page, 'ask', {
      name: 'Suite Parent',
      email: 'suite-parent@example.com',
      ages: '6, 9 and 13',
      message: 'Is there room in Latin?',
    });
    await page.getByRole('button', { name: 'Send my question' }).click();

    // AC 2, as a family experiences it: the row is the backing for the
    // sentence, so the send failing does not change what is said.
    const outcome = page.locator('[data-outcome]');
    await expect(outcome).toHaveAttribute('data-outcome', 'received');
    await expect(outcome).toHaveText(RECEIVED_MESSAGE);

    // And what to read next, which is the confirmation email's content on the
    // screen for the family who never opens it.
    await expect(page.getByRole('link', { name: 'See the classes' })).toHaveAttribute(
      'href',
      '/classes',
    );
    await expect(page.getByRole('link', { name: 'Read what we believe' })).toHaveAttribute(
      'href',
      BELIEFS_PATH,
    );
  });

  /*
   * The cross-page POST, which is the whole architecture of this ticket. Every
   * public page is ISR (#18 §1) and a cached page cannot take a POST, so the
   * homepage's copy submits across to `/inquire`. Nothing but a browser proves
   * that the answer comes back on the page the parent is now looking at.
   */
  test('carries a submission from the home page across to the answer', async ({ page }) => {
    await page.goto('/');

    // The `action` is the half that can be checked anywhere, and it is the half
    // that regresses: a form that quietly posts to itself is a form on an ISR
    // page that reaches nothing.
    await expect(page.locator('#inquiry form')).toHaveAttribute('action', INQUIRY_PATH);
    test.skip(!MAY_SUBMIT, 'a real submission writes a row and emails the school');

    await fill(page, 'inquiry', {
      name: 'Suite Homepage Parent',
      email: 'suite-homepage@example.com',
      ages: '4 and 17',
    });
    await page.locator('#inquiry').getByRole('button', { name: 'Send my question' }).click();

    await expect(page).toHaveURL(new RegExp(`${INQUIRY_PATH}$`));
    await expect(page.locator('[data-outcome="received"]')).toHaveText(RECEIVED_MESSAGE);
  });

  test('promises no response time on the page as it is reached', async ({ page }) => {
    // AC 5. A named clock would need George's sign-off; the ticket says the
    // words must not appear, so this reads the page rather than one string.
    await page.goto(INQUIRY_PATH);
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
  });

  test('promises no response time in the answer either', async ({ page }) => {
    // The state the promise would actually be written into — "thanks, we'll
    // reply within two days" is a sentence somebody adds to a thank-you, not to
    // a form.
    test.skip(!MAY_SUBMIT, 'a real submission writes a row and emails the school');
    await page.goto(INQUIRY_PATH);

    await fill(page, 'ask', {
      name: 'Suite Clockwatcher',
      email: 'suite-clock@example.com',
      ages: '11',
    });
    await page.getByRole('button', { name: 'Send my question' }).click();

    await expect(page.locator('[data-outcome="received"]')).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
  });
});

/**
 * AC 1 — "reachable from every scroll position on every page".
 *
 * The header is `position: fixed`, so the button is on screen at the foot of a
 * page as much as at the head of it. That is a CSS claim until something
 * scrolls to the bottom of a real page and looks, which is what these do — at
 * 390px as well, where the nav is hidden and the button is not.
 */
test.describe('the “Ask us about Pharos” button', () => {
  for (const path of ANYWHERE) {
    test(`is on screen at the foot of ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const button = page.locator('.site-header').getByRole('link', {
        name: 'Ask us about Pharos',
      });
      await expect(button).toBeInViewport();
    });
  }

  test('is a button rather than one of five equals in the nav', async ({ page }) => {
    await page.goto(STAFF_PATH);

    const header = page.locator('.site-header');
    await expect(header.getByRole('link', { name: 'Ask us about Pharos' })).toHaveClass(/btn/);
    await expect(header.locator('.site-nav').getByRole('link', { name: /Ask us/ })).toHaveCount(0);
  });

  test('survives the nav collapsing on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(BELIEFS_PATH);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expect(page.locator('.site-header .site-nav')).not.toBeVisible();
    await expect(
      page.locator('.site-header').getByRole('link', { name: 'Ask us about Pharos' }),
    ).toBeInViewport();
  });

  test('reaches the form from a page that is not the home page', async ({ page }) => {
    await page.goto(BELIEFS_PATH);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await page.locator('.site-header').getByRole('link', { name: 'Ask us about Pharos' }).click();

    // The form itself, not merely the page it is on.
    await expect(page.locator('#inquiry form[data-inquiry-form]')).toBeVisible();
    await expect(page.locator('#inquiry-ages')).toBeVisible();
  });
});
