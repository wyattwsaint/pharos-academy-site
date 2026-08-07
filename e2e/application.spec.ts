import { expect, test, type Page } from '@playwright/test';

import { APPLICATION_PATH } from '../src/lib/application/application.js';

/**
 * The application, over real HTTP (#31).
 *
 * The clash rule, the totals and the parser are unit-tested as pure functions
 * in `src/lib/application/*.test.ts` (#31 AC 10). What only a browser can
 * settle is the page as a family meets it: that the form reaches the one route
 * that renders on request, that a clash is shown *before* anything is sent,
 * that nothing on the page is gated behind a scroll, and that none of the
 * fields this ticket forbids ever renders (#31 AC 9) — a type can keep a field
 * out of the row, but only the DOM proves it is out of the form.
 *
 * "Check these choices" posts with `intent=check`, which re-renders the
 * warnings and the totals and **writes nothing** — so every check-flow test
 * here is safe against a real deployment, junk-row free. Only the tests that
 * click "Send the application" with a valid form are local-only.
 */

/**
 * Whether this run is allowed to submit anything.
 *
 * Same rule as `inquiry.spec.ts`: `PLAYWRIGHT_BASE_URL` points the suite at a
 * real deployment, where a valid submission is a junk application in the list
 * the school reads. A *refused* send stores nothing and a *check* stores
 * nothing by design, so both run everywhere.
 */
const MAY_SUBMIT = !process.env.PLAYWRIGHT_BASE_URL;

/**
 * A response-time promise, in the shapes it would actually be written in.
 * Mirrors `inquiry.spec.ts` — this page ends on "we will be in touch", and the
 * clock somebody adds to that sentence is the regression being scanned for.
 */
const CLOCKS =
  /\b(within|in)\s+(a|an|one|two|three|24|48|72|\d+)\s*(hour|hours|day|days|week|weeks|business)/i;

/**
 * Fields #31 AC 9 forbids, as they would be named. The unit-side scan reads
 * `apply.astro`'s source; this reads the rendered DOM, which is what actually
 * reaches a family — and what a client-side island could add without ever
 * appearing in the source scan.
 */
const FORBIDDEN_FIELDS = [
  'dob',
  'birth',
  'address',
  'street',
  'city',
  'state',
  'zip',
  'postcode',
  'custody',
  'medical',
  'medicat',
  'allerg',
  'diagnos',
  'evaluation',
  'adhd',
  'iep',
]
  .flatMap((word) => [`input[name*="${word}" i]`, `textarea[name*="${word}" i]`, `select[name*="${word}" i]`])
  .join(', ');

/**
 * Tick Algebra 1 (year) and Beginner Latin 5-6 (year) for the first child —
 * the #31 AC 3 pair. Both meet Monday 11:20–12:20, so the collision is a
 * certainty (`severity: 'clash'`), not a `possible`.
 */
async function tickClashingPair(page: Page) {
  await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
  await page.check('input[name="child-0-classes"][value="beginner-latin-grades-5-6:year"]');
}

test.describe('the application page', () => {
  test('answers 200 and is four stages on one document', async ({ page }) => {
    const response = await page.goto(APPLICATION_PATH);

    expect(response?.status()).toBe(200);
    await expect(page.locator('form[data-application-form]')).toHaveCount(1);
    // The four stage anchors — the ids a stepped variant would navigate by.
    for (const anchor of ['#faith', '#classes', '#payment', '#confirmation']) {
      await expect(page.locator(anchor)).toHaveCount(1);
    }
  });

  test('gates nothing behind a scroll', async ({ page }) => {
    // AC 7. A scroll-gate would show up here as a disabled submit waiting on a
    // scroll event, so the strongest DOM-level claim is: no submit on this page
    // is disabled, ever — the page is reached with both buttons live.
    await page.goto(APPLICATION_PATH);

    await expect(page.locator('button[type="submit"][disabled]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check these choices' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Send the application' })).toBeEnabled();

    // The Statement is behind a click, not a scroll: a closed <details> whose
    // summary is focusable, with nothing on the page waiting on it being open.
    await expect(page.locator('details.statement > summary')).toBeVisible();
    await expect(page.locator('details.statement[open]')).toHaveCount(0);
  });

  test('asks for none of what moves to paper', async ({ page }) => {
    // AC 9, over the rendered DOM. The source scan in `application.test.ts`
    // covers the template; this covers what a browser actually built.
    await page.goto(APPLICATION_PATH);
    await expect(page.locator(FORBIDDEN_FIELDS)).toHaveCount(0);
  });

  test('warns about the Algebra 1 and Latin collision before anything is sent', async ({
    page,
  }) => {
    // AC 3, as a family experiences it: tick the pair, ask for a check, and be
    // told about the collision while the cheque is still in the drawer. A
    // check writes nothing, so this runs against a real deployment too.
    await page.goto(APPLICATION_PATH);

    await tickClashingPair(page);
    await page.getByRole('button', { name: 'Check these choices' }).click();

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-clashes]')).not.toHaveAttribute('data-clashes', '0');
    const clash = page.locator('li[data-severity="clash"]').first();
    await expect(clash).toBeVisible();
    await expect(clash).toContainText('Algebra 1');
    await expect(clash).toContainText('Beginner Latin');

    // A warning and never a block: the send button is as live as it ever was.
    await expect(page.getByRole('button', { name: 'Send the application' })).toBeEnabled();
    // And what was ticked is still ticked — a check that clears the form would
    // cost a family their whole selection for having asked a question.
    await expect(
      page.locator('input[name="child-0-classes"][value="algebra-1:year"]'),
    ).toBeChecked();
  });

  test('a check reports no missing fields on a form still being filled in', async ({ page }) => {
    // The check is "did I pick two classes that collide", not "you forgot your
    // name" — an empty check must come back clean, not covered in errors.
    await page.goto(APPLICATION_PATH);

    await page.getByRole('button', { name: 'Check these choices' }).click();

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-outcome="failed"]')).toHaveCount(0);
    await expect(page.locator('.error')).toHaveCount(0);
  });

  test('refuses an incomplete send and gives back what was typed', async ({ page }) => {
    // A refused send stores nothing, so this too is safe anywhere.
    await page.goto(APPLICATION_PATH);

    await page.fill('#apply-family-name', 'Suite Family');
    await page.getByRole('button', { name: 'Send the application' }).click();

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#apply-family-name')).toHaveValue('Suite Family');
    await expect(page.locator('#apply-email-error')).toBeVisible();
    await expect(page.locator('#apply-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-children-error')).toBeVisible();
    await expect(page.locator('#apply-classes-error')).toBeVisible();
  });

  test('opens as a clean slate with no inquiry in the link', async ({ page }) => {
    // AC 1's other half: the prefill is unit-tested; what HTTP has to prove is
    // that arriving without one is the same form, not an error.
    await page.goto(APPLICATION_PATH);
    await expect(page.locator('#apply-family-name')).toHaveValue('');
  });

  test('treats a mangled inquiry link as no inquiry at all', async ({ page }) => {
    // The link Jill pastes gets wrapped by email clients. A malformed id must
    // be the same clean slate over HTTP — a 200, not a 500 from a uuid cast.
    const response = await page.goto(`${APPLICATION_PATH}?inquiry=not-a-uuid`);

    expect(response?.status()).toBe(200);
    await expect(page.locator('form[data-application-form]')).toHaveCount(1);
    await expect(page.locator('#apply-family-name')).toHaveValue('');
  });

  test('promises no response time on the page as it is reached', async ({ page }) => {
    await page.goto(APPLICATION_PATH);
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
  });

  test('takes a real application and holds the reference', async ({ page }) => {
    test.skip(!MAY_SUBMIT, 'a real send writes an application row');
    await page.goto(APPLICATION_PATH);

    await page.fill('#apply-family-name', 'Suite Family');
    await page.fill('#apply-email', 'suite-family@example.com');
    await page.fill('#apply-child-0-name', 'Suite Child');
    await page.fill('#apply-child-0-age', '13');
    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
    await page.getByRole('button', { name: 'Send the application' }).click();

    // The row is the backing for the sentence, and the reference is the row's id.
    const outcome = page.locator('[data-outcome="received"]');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText('Reference');

    // The confirmation replays the choice and the cheque, and promises no clock.
    const confirmation = page.locator('[data-section="apply-confirmation"]');
    await expect(confirmation).toContainText('Suite Child');
    await expect(confirmation).toContainText('Algebra 1');
    await expect(confirmation).toContainText('Pharos Academy');
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
  });
});
