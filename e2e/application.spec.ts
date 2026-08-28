import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { APPLICATION_PATH, FAITH_QUESTIONS, faithKey } from '../src/lib/application/application.js';
import { REFERENCE_SHAPE } from '../src/lib/application/reference.js';
import { AXE_TAGS, describeViolation } from './axe.js';
import { fillContactDetails } from './contact-details.js';
import { previewTotals } from './preview.js';

/**
 * The application, over real HTTP (#31, #85).
 *
 * The clash rule, the totals and the parser are unit-tested as pure functions
 * in `src/lib/application/*.test.ts` (#31 AC 10). What only a browser can
 * settle is the page as a family meets it: that the form reaches the one route
 * that renders on request, that a clash is shown *before* anything is sent,
 * that nothing on the page is gated behind a scroll, that the gate greys and
 * ungreys the Send button as the form fills in, that a refused send lands the
 * family on the thing that needs them, and that none of the fields this ticket
 * forbids ever renders (#31 AC 9) — a type can keep a field out of the row, but
 * only the DOM proves it is out of the form.
 *
 * **Both paths, every time** (#85). The gate is the one place where a browser
 * and a server could silently disagree, so anything asserted with scripting on
 * has a counterpart in the scripting-off block at the bottom of this file.
 *
 * **The preview button is gone from the scripting-on page** (#264). The totals
 * follow the family as they choose, so the round trip that used to re-render
 * them is now only offered where nothing follows anything: "Update the totals"
 * lives in `<noscript>`. It posts with `intent=check`, which re-renders the
 * warnings and the totals and **writes nothing** — so every check-flow test in
 * the scripting-off block is safe against a real deployment, junk-row free.
 * With scripting on, a clash is read where a browser can read it: the warnings
 * the server rendered, and the totals that moved without a POST. Only the tests
 * that click "Send the application" with a valid form are local-only.
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
 *
 * Two lists since #312, and the difference between them is ADR-0024's whole
 * decision. The words below are barred everywhere on the page. The address
 * parts are barred **against a child** and asked for once, of the household —
 * an address is a fact about the people the school corresponds with rather than
 * about a student. Reopening a door is not removing the wall.
 */
const controlsNamed = (words: string[]): string =>
  words
    .flatMap((word) => [
      `input[name*="${word}" i]`,
      `textarea[name*="${word}" i]`,
      `select[name*="${word}" i]`,
    ])
    .join(', ');

const FORBIDDEN_FIELDS = controlsNamed([
  'dob',
  'birth',
  'custody',
  'medical',
  'medicat',
  'allerg',
  'diagnos',
  'evaluation',
  'adhd',
  'iep',
]);

/** And these, anywhere inside a child's row. */
const FORBIDDEN_PER_CHILD = controlsNamed([
  'address',
  'street',
  'city',
  'state',
  'zip',
  'postcode',
]);

/**
 * Tick Algebra 1 (year) and Beginner Latin 5-6 (year) for the first child —
 * the #31 AC 3 pair. Both meet Monday 11:20–12:20, so the collision is a
 * certainty (`severity: 'clash'`), not a `possible`.
 */
async function tickClashingPair(page: Page) {
  await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
  await page.check('input[name="child-0-classes"][value="beginner-latin-grades-5-6:year"]');
}

/**
 * Open the application, and wait for the page to be the one being tested.
 *
 * The page's script is a deferred module, so for a moment after paint the form
 * is the server's form — a correct page, but not the enhanced one. Clicking into
 * that window tests neither, so every scripting-on test waits for the marker the
 * script sets when it is live. The scripting-off block deliberately does not.
 */
async function open(page: Page, path = APPLICATION_PATH) {
  const response = await page.goto(path);
  await page.locator('form[data-enhanced]').waitFor();
  return response;
}

/** The Send button, whose greyness is the gate (#85). */
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send the application' });

/** Whether the gate is holding the application back. */
async function greyed(page: Page): Promise<boolean> {
  return (await sendButton(page).getAttribute('aria-disabled')) === 'true';
}

/**
 * Press Send, greyed or not.
 *
 * `force` because Playwright reads `aria-disabled="true"` as not-enabled and
 * refuses to click — which is a fair reading of the attribute and, incidentally,
 * the clearest evidence available that the greying is announced rather than
 * merely painted. A person's pointer and a person's Enter key are not bound by
 * it, and being able to activate the button and be told what is missing is the
 * whole reason #85 chose `aria-disabled` over `disabled`.
 */
const clickSend = (page: Page) => sendButton(page).click({ force: true });

/**
 * Ask the server for a preview — the `<noscript>` button, and so the
 * scripting-off block only (#264).
 *
 * It posts `intent=check`, which re-renders the totals, the clash warnings and
 * the greyed send and writes no row.
 */
const clickCheck = (page: Page) =>
  page.getByRole('button', { name: 'Update the totals' }).click();

/**
 * Leave a field, the way a family does — by going to the next one.
 *
 * Blur is the event the live checking turns on (#90), and there is no "blur"
 * gesture: a family arrives somewhere else. Every test that means "and then
 * they moved on" says it this way.
 */
const leave = (page: Page, next = '#apply-family-name') => page.locator(next).focus();

/** One line of the still-needed list, by the rule it belongs to. */
const stillNeeded = (page: Page, field: string) =>
  page.locator(`[data-missing-for="${field}"]`);

/** Answer one respondent's whole column of the Statement of Faith grid. */
async function answerFaith(page: Page, answer: 'yes' | 'no' = 'yes') {
  for (const question of FAITH_QUESTIONS) {
    await page.check(`input[name="${faithKey('Father', question.id)}"][value="${answer}"]`);
  }
}

/** Answer both published agreements. Either answer will do — that is the point. */
async function answerAgreements(page: Page, answer = 'yes') {
  for (const slug of ['code-of-conduct', 'handbook']) {
    await page.check(`[data-agreement="${slug}"] input[value="${answer}"]`);
  }
}

/**
 * Say how this family is paying (#219).
 *
 * Conditional, because whether the question is asked at all is a fact about
 * the deployment: with no Vanco page pasted into the school details there is
 * one way to pay, the page states it in a hidden field, and there is no radio
 * to check. Both branches leave the gate satisfied, which is the point — the
 * two states of that row are driven from the admin, in `admin.spec.ts`.
 */
async function statePaymentMethod(page: Page, method: 'online' | 'check' = 'online') {
  const radio = page.locator(`[data-payment-method] input[value="${method}"]`);
  if ((await radio.count()) > 0) await radio.check();
}

/**
 * Everything #85 requires, in the order the page reads.
 *
 * `except` leaves one rule unmet, so a test can be about that rule and nothing
 * else — the whole form minus one thing is the only honest way to prove that
 * one thing is what the gate is holding out for.
 */
async function fillSendable(page: Page, except?: string) {
  if (except !== 'faith') await answerFaith(page);
  if (except !== 'familyName') await page.fill('#apply-family-name', 'Suite Family');
  if (except !== 'email') await page.fill('#apply-email', 'suite-family@example.com');
  // The two #312 added. Filled together, because they are one thing a family
  // does — and left out together when a test is about one of them.
  if (except !== 'phone' && except !== 'address') await fillContactDetails(page);
  else if (except === 'address') await page.fill('#apply-phone', '717-555-0142');
  else {
    await page.fill('#apply-street', '12 Oak Lane');
    await page.fill('#apply-city', 'Gettysburg');
    await page.fill('#apply-zip', '17325');
  }
  if (except !== 'children') {
    await page.fill('#apply-child-0-name', 'Suite Child');
    await page.fill('#apply-child-0-age', '13');
  }
  if (except !== 'classes') {
    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
  }
  if (except !== 'agreements') await answerAgreements(page);
  if (except !== 'paymentMethod') await statePaymentMethod(page);
}

/**
 * A figure on the page, as a number (#261).
 *
 * Read back off the rendered text rather than off a data attribute, because
 * what a family reads is the text — a page that keeps a correct number in an
 * attribute and prints a stale one beside "Pay online" is the failure these
 * tests exist for.
 */
const dollars = (text: string): number => Number(text.replace(/[^0-9.]/g, ''));

/** Every money figure the family can see, including the child's own. */
async function allFigures(page: Page): Promise<number[]> {
  const texts = await page
    .locator('form [data-total], form fieldset[data-child-row]:not([disabled]) [data-child-total]')
    .allTextContents();
  return texts.map(dollars);
}

/** One line of the four-line breakdown. */
async function figure(page: Page, field: string): Promise<number> {
  return dollars(await page.locator(`form [data-total="${field}"]`).first().innerText());
}

/** The grand total, everywhere it is printed. They are meant to be one number. */
async function grandTotals(page: Page): Promise<number[]> {
  const texts = await page.locator('form [data-total="total"]').allTextContents();
  return texts.map(dollars);
}

/**
 * What the page says one class costs, off the box that carries it (#261).
 *
 * Read rather than written down, because the rate card is the school's to
 * change from the admin: a test with $840 in it would fail the day Jill raises
 * the standard rate, and it is the arithmetic these tests are about, not the
 * rates. `settings.test.ts` is where a rate is a number.
 */
async function classPrice(page: Page, value: string): Promise<number> {
  const box = page.locator(`input[name="child-0-classes"][value="${value}"]`);
  return Number(await box.getAttribute('data-price'));
}

/** One child's own figure, by their row. */
async function childFigure(page: Page, index: number): Promise<number> {
  const row = page.locator(`fieldset[data-child-row="${index}"]`);
  return dollars(await row.locator('[data-child-total]').innerText());
}

test.describe('the application page', () => {
  test('answers 200 and is the stages on one document', async ({ page }) => {
    const response = await open(page);

    expect(response?.status()).toBe(200);
    await expect(page.locator('form[data-application-form]')).toHaveCount(1);
    // The stage anchors — the ids a stepped variant would navigate by.
    for (const anchor of ['#faith', '#classes', '#agreements', '#payment', '#confirmation']) {
      await expect(page.locator(anchor)).toHaveCount(1);
    }
  });

  test('asks one Yes-or-No question per document, and blocks nothing', async ({ page }) => {
    // #71 AC 1, 2 and 4 as #255 asks them: one question per document, two
    // answers and no third, a link to the *fixed* address of each, and a form
    // that stays sendable whichever is picked.
    await open(page);

    for (const slug of ['code-of-conduct', 'handbook']) {
      const question = page.locator(`[data-agreement="${slug}"]`);
      await expect(question).toHaveCount(1);
      await expect(question.locator(`a[href="/policies/${slug}.pdf"]`)).toBeVisible();
      await expect(question).toContainText('Does your family agree to the Pharos Academy');

      await expect(question.getByRole('radio')).toHaveCount(2);
      for (const label of ['Yes', 'No']) {
        await expect(question.getByRole('radio', { name: label, exact: true })).toBeVisible();
      }
      // The third radio ADR-0020 removed: an untouched question is already
      // unanswered, and nothing offers a family a way to un-answer one.
      await expect(question.getByRole('radio', { name: 'Not answered' })).toHaveCount(0);
    }

    // "No" answers the question, and answering is all #85 asks: the requirement
    // leaves the still-needed list rather than becoming one.
    await answerAgreements(page, 'no');
    await expect(stillNeeded(page, 'agreements')).toBeHidden();
  });

  test('gates nothing behind a scroll', async ({ page }) => {
    // AC 7, the half of it that survives #85. A scroll-gate would show up as
    // something hidden, something waiting on the Statement's disclosure being
    // opened, or a submit removed from the tab order. None of the three: the
    // children's section is visible and editable from the first paint, the
    // Statement opens with a click, and the greyed Send button is `aria-disabled`
    // rather than `disabled` — reachable, focusable, and able to explain itself.
    await open(page);

    await expect(page.locator('button[type="submit"][disabled]')).toHaveCount(0);
    await expect(sendButton(page)).toBeVisible();
    await expect(page.locator('fieldset[data-child-row]:visible')).toHaveCount(1);
    await expect(page.locator('#apply-child-0-name')).toBeEditable();
    await expect(page.locator('input[name="child-0-classes"]').first()).toBeVisible();

    // The Statement is behind a click, not a scroll: a closed <details> whose
    // summary is focusable, with nothing on the page waiting on it being open.
    await expect(page.locator('details.statement > summary')).toBeVisible();
    await expect(page.locator('details.statement[open]')).toHaveCount(0);

    // The gate holds a fresh form, and it holds it without the disclosure ever
    // being opened: filling the form in is the only thing that releases it.
    expect(await greyed(page)).toBe(true);
    await sendButton(page).focus();
    await expect(sendButton(page)).toBeFocused();

    await fillSendable(page);
    await expect(page.locator('details.statement[open]')).toHaveCount(0);
    expect(await greyed(page)).toBe(false);
  });

  test('greys the send until the last thing is answered, and names each one', async ({ page }) => {
    // #85 as a family meets it: a greyed button with a list beside it, one line
    // per outstanding rule, each line a link to the control it is about.
    await open(page);

    const fields = [
      'faith',
      'familyName',
      'email',
      // The two #312 added, held to the same bar as the six before them: named
      // in the list from the first paint, linked to a control that exists, and
      // enough on their own to keep the button grey.
      'phone',
      'address',
      'children',
      'classes',
      'agreements',
    ];
    for (const field of fields) await expect(stillNeeded(page, field)).toBeVisible();

    // Each line goes somewhere, and somewhere that exists.
    for (const field of fields) {
      const href = await stillNeeded(page, field).locator('a').getAttribute('href');
      expect(href).toMatch(/^#/);
      await expect(page.locator(href ?? '#')).toHaveCount(1);
    }

    // One rule at a time. The button stays grey until the last of them is met.
    for (const field of fields) {
      await open(page);
      await fillSendable(page, field);

      expect(await greyed(page), `${field} alone does not hold the gate`).toBe(true);
      await expect(stillNeeded(page, field)).toBeVisible();
    }
  });

  test('answers the greyed button rather than submitting it', async ({ page }) => {
    // AC 9 and 10 of the ticket: the button is reachable, activating it says
    // what is missing and puts the family on it, and nothing is sent.
    await open(page);

    await fillSendable(page, 'email');
    await clickSend(page);

    // No round trip — the page a family is on is the page they were on.
    await expect(page.locator('[data-outcome]')).toHaveCount(0);
    await expect(page.locator('#apply-email-error')).toBeVisible();
    await expect(page.locator('#apply-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-email')).toBeFocused();
  });

  test('answers the Enter key the way it answers the greyed button', async ({ page }) => {
    // #264. With the preview button gone the form's default submit is Send, so
    // Enter in a text field now asks to send where it used to ask for a
    // preview. Implicit submission clicks the default button, so the greyed
    // gate catches it — asserted rather than assumed, because a gate that held
    // for a pointer and not for a keyboard would post a form the page has just
    // called incomplete, for the users least able to work around it.
    await open(page);

    await page.fill('#apply-family-name', 'Suite Family');
    await page.locator('#apply-family-name').press('Enter');

    // No round trip — the page a family is on is the page they were on.
    await expect(page.locator('[data-outcome]')).toHaveCount(0);
    await expect(page.locator('#apply-family-name')).toHaveValue('Suite Family');
    // And they are put on the first thing that needs them, which on this form
    // is the Statement of Faith grid, above everything else.
    await expect(page.locator('[data-faith-grid] input').first()).toBeFocused();
  });

  test('says what is still needed in the colour it says everything else in', async ({ page }) => {
    // #254. The list is the page telling a family something is outstanding, and
    // every other outstanding thing on the page is red — so the intro, the
    // items and the rule down their left are read off the field error sentence
    // rather than off a colour written down here, which would pass while the
    // two drifted apart.
    await open(page);

    await fillSendable(page, 'email');
    await clickSend(page);

    const colourOf = (locator: Locator) =>
      locator.evaluate((element) => getComputedStyle(element).color);

    // Stated, so that everything below is a comparison rather than two things
    // agreeing on the colour they both inherited. The ratio this red holds on
    // the grounds it is painted on is measured in `src/styles/tokens.test.ts`.
    const red = await colourOf(page.locator('#apply-email-error'));
    expect(red).toBe('rgb(140, 43, 25)');

    expect(await colourOf(page.locator('[data-missing-intro]'))).toBe(red);

    const item = stillNeeded(page, 'email');
    await expect(item).toBeVisible();
    expect(await colourOf(item)).toBe(red);
    expect(await colourOf(item.locator('a'))).toBe(red);

    const rule = await item.evaluate((element) => getComputedStyle(element).borderLeftColor);
    expect(rule).toBe(red);

    // The quiet sentence that replaces the list is not an error, and does not
    // borrow the colour of one.
    await fillSendable(page);
    await expect(page.locator('[data-missing-intro]')).toBeHidden();
    expect(await colourOf(page.locator('[data-missing-done]'))).not.toBe(red);
  });

  test('checks a field when the family leaves it, and clears it as they fix it', async ({
    page,
  }) => {
    // Stories 4, 5 and 6: nothing is said while the first word is being typed,
    // something is said the moment the field is left, and it goes as they type.
    await open(page);

    await page.fill('#apply-family-name', 'Suit');
    await expect(page.locator('#apply-family-name-error')).toBeHidden();

    await page.fill('#apply-family-name', '');
    await page.locator('#apply-email').focus();
    await expect(page.locator('#apply-family-name-error')).toBeVisible();

    await page.fill('#apply-family-name', 'S');
    await expect(page.locator('#apply-family-name-error')).toBeHidden();
  });

  test('says nothing to a second child whose name is still being typed', async ({ page }) => {
    // Story 6 on the one field where it is easy to get wrong (#90). The
    // children's rule is one rule over eight rows: a family who has finished
    // the first child has "left" that rule, and a rule-wide reveal would shout
    // "Second needs an age" at the second child's *name* box, mid-word, before
    // they have reached the age box at all.
    await open(page);

    await page.selectOption('#apply-child-count', '2');
    await page.fill('#apply-child-0-name', 'First Child');
    await page.fill('#apply-child-0-age', '13');
    await leave(page);
    await expect(page.locator('#apply-children-error')).toBeHidden();

    // Typed, rather than filled: a keystroke is the event this rule is about.
    await page.locator('#apply-child-1-name').pressSequentially('Second Child');
    await expect(page.locator('#apply-children-error')).toBeHidden();

    // Tabbing on to the age box is not being told about the age box. The
    // family is standing in it, with nothing typed in it yet — the sentence
    // belongs to the box they have left, not to the one they have reached.
    await page.locator('#apply-child-1-age').focus();
    await expect(page.locator('#apply-children-error')).toBeHidden();

    // Left with no age, and the sentence arrives — naming the row it is about.
    await leave(page);
    await expect(page.locator('#apply-children-error')).toHaveText(/Second Child/);

    // And it goes as the age arrives, without another blur.
    await page.locator('#apply-child-1-age').pressSequentially('9');
    await expect(page.locator('#apply-children-error')).toBeHidden();
  });

  test('answers a radio and a checkbox the moment they change', async ({ page }) => {
    // AC 4: there is no half-made choice to interrupt, so a group evaluates on
    // change rather than waiting to be left.
    await open(page);

    // One faith cell answered is not a column, and the grid says so at once —
    // with no blur, and with focus still inside the grid.
    await page.check(`input[name="${faithKey('Father', FAITH_QUESTIONS[0].id)}"][value="yes"]`);
    await expect(page.locator('#apply-faith-error')).toBeVisible();
    await answerFaith(page);
    await expect(page.locator('#apply-faith-error')).toBeHidden();

    // A checkbox ticked and unticked leaves the class rule outstanding, and
    // says so on the change rather than on the way out.
    const box = page.locator('input[name="child-0-classes"][value="algebra-1:year"]');
    await box.check();
    await expect(page.locator('#apply-classes-error')).toBeHidden();
    await box.uncheck();
    await expect(page.locator('#apply-classes-error')).toBeVisible();
  });

  test('raises a browser error in the same markup the server raises one in', async ({
    browser,
    page,
  }) => {
    // AC 5. Two ways to the same wrong answer — a field left empty here, and a
    // refused round trip there — must be one thing to a screen reader: the same
    // paragraph, the same sentence, the same `aria-invalid`, the same
    // `aria-describedby`. Both halves are in one test because the comparison is
    // the assertion; a pair of tests either side of the file could each pass
    // while the two drifted apart.
    await open(page);

    await page.locator('#apply-email').focus();
    await leave(page);

    const live = page.locator('#apply-email-error');
    await expect(live).toBeVisible();
    const sentence = ((await live.textContent()) ?? '').trim();
    await expect(page.locator('#apply-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-email')).toHaveAttribute(
      'aria-describedby',
      'apply-email-error',
    );

    // The same rule, raised by the server. Scripting off, so the click is a
    // real POST rather than the page's own refusal — and a refused POST stores
    // nothing, which is why this one runs against a deployment too.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const served = await context.newPage();
    await served.goto(APPLICATION_PATH);
    await fillSendable(served, 'email');
    await clickSend(served);

    // A real round trip, and a refused one: nothing was stored.
    await expect(served.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(served.locator('#apply-email-error')).toHaveText(sentence);
    await expect(served.locator('#apply-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(served.locator('#apply-email')).toHaveAttribute(
      'aria-describedby',
      'apply-email-error',
    );
    await context.close();
  });

  /**
   * The household's own contact details (#312, ADR-0024).
   *
   * The rules are proved in `address.test.ts` and `forms.test.ts`. What these
   * are about is the *treatment*: one sentence over five controls, the marks
   * landing on the parts that are actually short of something, and the dashes
   * appearing as a parent types.
   */
  test('marks only the part of the address that is missing', async ({ page }) => {
    await open(page);

    await page.fill('#apply-street', '12 Oak Lane');
    await page.fill('#apply-city', 'Gettysburg');
    await page.fill('#apply-zip', '173');
    await leave(page);

    // One sentence, under the block, for the whole address.
    const error = page.locator('#apply-address-error');
    await expect(error).toBeVisible();
    await expect(page.locator('#apply-zip')).toHaveAttribute('aria-invalid', 'true');
    // The parts that are right are not marked wrong, and the optional line is
    // never marked at all.
    await expect(page.locator('#apply-street')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-city')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-street2')).not.toHaveAttribute('aria-invalid', 'true');
    // And every part is told where the sentence is, which is what a screen
    // reader needs whichever box the family is standing in.
    for (const part of ['#apply-street', '#apply-city', '#apply-state', '#apply-zip']) {
      await expect(page.locator(part)).toHaveAttribute('aria-describedby', 'apply-address-error');
    }

    // Corrected, and the mark goes with the sentence rather than lingering.
    await page.fill('#apply-zip', '17325');
    await expect(error).toBeHidden();
    await expect(page.locator('#apply-zip')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('opens the state on Pennsylvania, with all fifty-one to choose from', async ({ page }) => {
    await open(page);

    const state = page.locator('#apply-state');
    await expect(state).toHaveValue('PA');
    await expect(state.locator('option')).toHaveCount(51);

    // A preselection and not a lock.
    await state.selectOption('MD');
    await expect(state).toHaveValue('MD');
  });

  test('inserts the dashes in the phone number as the parent types', async ({ page }) => {
    // The inquiry's behaviour, on the form that asks for the same number
    // (#312). Bound from one module, so it cannot drift.
    await open(page);

    await page.fill('#apply-phone', '7175550142');
    await expect(page.locator('#apply-phone')).toHaveValue('717-555-0142');

    // A pasted number with a country code is handed back exactly as typed, so
    // the family meets the error rather than a well-formed, different number.
    await page.fill('#apply-phone', '1-717-555-0142');
    await expect(page.locator('#apply-phone')).toHaveValue('1-717-555-0142');
    await leave(page);
    await expect(page.locator('#apply-phone-error')).toBeVisible();
    await expect(page.locator('#apply-phone')).toHaveAttribute('aria-invalid', 'true');
  });

  test('never raises an error against the objections box, or against a “No”', async ({ page }) => {
    // AC 7. Saying what you think costs a family nothing, at any point in the
    // filling in — not on blur, not on a keystroke, not on the way out.
    await open(page);

    await page.locator('#apply-objections').focus();
    await leave(page);
    await expect(page.locator('#apply-objections')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-objections')).not.toHaveAttribute(
      'aria-describedby',
      /error/,
    );

    // And not when the greyed button is asked for everything at once, which is
    // the one moment every other rule speaks.
    await clickSend(page);
    await expect(page.locator('#apply-objections')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-objections')).not.toHaveAttribute(
      'aria-describedby',
      /error/,
    );

    await fillSendable(page, 'faith');
    await answerFaith(page, 'no');
    await page.fill('#apply-objections', 'We disagree with the third article.');
    await leave(page);

    await expect(page.locator('#apply-faith-error')).toBeHidden();
    expect(await greyed(page)).toBe(false);
  });

  test('ignores a row the family has hidden, and checks one they bring back', async ({ page }) => {
    // Stories 25 and 26. Stale text in a row nobody is applying for must not
    // hold the gate, and a row brought back must come under it at once.
    await open(page);

    await page.selectOption('#apply-child-count', '2');
    await fillSendable(page);
    await page.fill('#apply-child-1-name', 'Second Child');

    expect(await greyed(page)).toBe(true);
    await expect(stillNeeded(page, 'children')).toBeVisible();

    await page.selectOption('#apply-child-count', '1');
    expect(await greyed(page)).toBe(false);

    await page.selectOption('#apply-child-count', '2');
    expect(await greyed(page)).toBe(true);
  });

  test('lands on the child who is short, not on the first child there is', async ({ page }) => {
    // The one place the two gates could quietly disagree: the browser walks the
    // rows and the server used to answer row 0 whatever the form said. A family
    // whose first child is done and whose second has no age must not be sent
    // back to a box they already filled in. Counterpart below, scripting off.
    await open(page);

    await fillSendable(page);
    await page.selectOption('#apply-child-count', '2');
    await page.fill('#apply-child-1-name', 'Second Child');

    await clickSend(page);
    await expect(page.locator('#apply-child-1-age')).toBeFocused();
    await expect(stillNeeded(page, 'children').locator('a')).toHaveAttribute(
      'href',
      '#apply-child-1-age',
    );
  });

  test('lands on the document nobody has answered, not on the first one', async ({ page }) => {
    await open(page);

    await fillSendable(page, 'agreements');
    await page.check('[data-agreement="code-of-conduct"] input[value="yes"]');

    await clickSend(page);

    const handbook = page.locator('[data-agreement="handbook"] input').first();
    await expect(handbook).toBeFocused();
    // Near the bottom of a long document, and on screen rather than scrolled
    // past — the banner is above and stays there (#88). Counterpart below.
    await expect(handbook).toBeInViewport();
    await expect(page.locator('[data-outcome="failed"]')).not.toBeInViewport();
  });

  test('lands on the empty class list above the child who is short (#88)', async ({ page }) => {
    // The children's section is the one place where "first in reading order"
    // and the rule order part company: each child's classes are inside that
    // child's row, so the first child's empty list is above the second child's
    // age box. Counterpart below, scripting off.
    await open(page);

    await fillSendable(page, 'classes');
    await page.selectOption('#apply-child-count', '2');
    await page.fill('#apply-child-1-name', 'Second Child');

    await clickSend(page);
    await expect(page.locator('input[name="child-0-classes"]').first()).toBeFocused();
  });

  test('asks for none of what moves to paper', async ({ page }) => {
    // AC 9, over the rendered DOM. The source scan in `application.test.ts`
    // covers the template; this covers what a browser actually built.
    await open(page);
    await expect(page.locator(FORBIDDEN_FIELDS)).toHaveCount(0);

    // And the address, which the household is asked for once (#312), is asked
    // of no child. Every control inside a child row is measured, including the
    // rows the count picker has hidden — a field that only appears at seven
    // children is still a field.
    const rows = page.locator('fieldset[data-child-row]');
    await expect(rows).not.toHaveCount(0);
    await expect(rows.locator(FORBIDDEN_PER_CHILD)).toHaveCount(0);

    // The other half of the same criterion: the household is asked, once.
    await expect(page.locator('[data-address] input, [data-address] select')).toHaveCount(5);
  });

  test('leaves the send ungreyed when the classes collide', async ({ page }) => {
    // #89 AC 8, and the line #85 draws between the two things this page says
    // about a selection. Completeness is about questions answered; a collision
    // is about a choice made, and the family may have a reason for it. A gate
    // that refused to release the button until the timetable was tidy would
    // turn every warning into a block by the back door — the thing #31 AC 3-5
    // set out not to do — and it would do it silently, because the collision is
    // not a line the still-needed list can even raise.
    await open(page);

    await fillSendable(page);
    await tickClashingPair(page);

    expect(await greyed(page)).toBe(false);
    // And the clash is not a line the still-needed list can raise, so a family
    // is never told to go and fix something the page has already said they may
    // keep. Counterpart below, scripting off, where the warning is on screen.
    await expect(stillNeeded(page, 'classes')).toBeHidden();
  });

  test('shows the number of children the family picks, and sends only those', async ({ page }) => {
    // The count picker. Only a browser can test it: the rows are all in the
    // HTML either way, and what changes is which of them a family can see and
    // which of them the POST carries.
    await open(page);

    const rows = page.locator('fieldset[data-child-row]');
    await expect(rows).toHaveCount(8);
    // One is where a form with nothing behind it opens — the honest default.
    await expect(page.locator('fieldset[data-child-row]:visible')).toHaveCount(1);

    await page.selectOption('#apply-child-count', '3');
    await expect(page.locator('fieldset[data-child-row]:visible')).toHaveCount(3);

    for (const index of [0, 1, 2]) {
      await page.fill(`input[name="child-${index}-name"]`, `Child ${index}`);
      await page.check(`input[name="child-${index}-classes"][value="algebra-1:year"]`);
      await page.check(
        `input[name="child-${index}-classes"][value="beginner-latin-grades-5-6:year"]`,
      );
    }
    // Three rows, and none of them held back from the POST.
    await expect(page.locator('fieldset[data-child-row]:not([disabled])')).toHaveCount(3);

    // Down to two: the third row is disabled as well as hidden, so it posts
    // nothing — a child the family is no longer applying for does not arrive
    // with a timetable collision the school would then ask them about.
    await page.selectOption('#apply-child-count', '2');
    await expect(page.locator('fieldset[data-child-row]:visible')).toHaveCount(2);
    await expect(page.locator('fieldset[data-child-row]:not([disabled])')).toHaveCount(2);

    // And the POST proves it rather than the attribute: two children come back,
    // and the third one's name comes back empty. The preview button is gone
    // from this page (#264), so the request is made the way `previewTotals`
    // makes it — the same `intent=check`, which writes no row.
    await previewTotals(page);

    await expect(page.locator('[data-child-clashes]')).toHaveCount(2);
    await expect(page.locator('#apply-child-count')).toHaveValue('2');
    await expect(page.locator('input[name="child-2-name"]')).toHaveValue('');
  });

  test('previews the totals with no button pressed, and reports no missing fields', async ({
    page,
  }) => {
    // What the preview button used to be asked for, now answered by the page
    // itself (#264, ADR-0019): a family half way through has the totals of what
    // they have chosen so far, and is told nothing about the questions they
    // have not reached. Nothing was submitted, so nothing may be reported —
    // there is no press that could report it and none that #85 could require.
    await open(page);

    await tickClashingPair(page);

    await expect(page.locator('.totals')).toBeVisible();
    expect((await allFigures(page)).every((amount) => amount > 0)).toBe(true);
    await expect(page.locator('[data-outcome="failed"]')).toHaveCount(0);
    await expect(page.locator('[data-outcome="checked"]')).toHaveCount(0);
    await expect(page.locator('.error:visible')).toHaveCount(0);
    // And no button to press: the form's only submit is the one that sends.
    await expect(page.locator('form button[type="submit"]')).toHaveCount(1);
    await expect(sendButton(page)).toBeVisible();
  });

  test('never needs a check pressed, before or after a change of mind', async ({ page }) => {
    // Stories 29 and 30. The button reflects the form, not the last button
    // press: there is no "checked" state for a later edit to leave stale.
    await open(page);

    await fillSendable(page);
    expect(await greyed(page)).toBe(false);

    await page.uncheck('input[name="child-0-classes"][value="algebra-1:year"]');
    expect(await greyed(page)).toBe(true);

    await page.check('input[name="child-0-classes"][value="kingdom-math:year"]');
    expect(await greyed(page)).toBe(false);
  });

  /**
   * The figures follow the family as they choose (#261, ADR-0019).
   *
   * The arithmetic is unit-tested in `money/live.test.ts` and the import graph
   * is guarded in `validation.test.ts`. What only a browser can settle is the
   * figure somebody forgot to wire up: a total beside "Pay online" that still
   * reads $0 while the list above it reads $445 is the number a family types
   * into the giving page.
   */
  test('moves every figure on the page as a class is ticked', async ({ page }) => {
    await open(page);

    const before = await allFigures(page);
    expect(before.every((amount) => amount === 0)).toBe(true);

    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');

    // Every one of them, not the first one: the four-line list, the total
    // beside Pay online, the amount the family is asked to enter themselves,
    // the check-by-post amount inside the disclosure, and the child's own.
    // Whichever of those the deployment renders — which of the two payment
    // sections is on screen is a fact about the school details, so the sweep
    // reads what is there rather than naming the figures one by one.
    const after = await allFigures(page);
    expect(after).toHaveLength(before.length);
    expect(after.every((amount) => amount > 0)).toBe(true);

    // And they agree with each other. Registration, deposits and the tuition
    // that is left are the working; the grand total is the sum of them, and it
    // reads the same wherever it appears.
    const grand = await grandTotals(page);
    expect(new Set(grand).size).toBe(1);
    expect(grand[0]).toBe(
      (await figure(page, 'registration')) +
        (await figure(page, 'deposits')) +
        (await figure(page, 'tuitionDue')),
    );

    // The credit, live and capped: one deposit comes off the tuition for the
    // one class, and the clause beside it says so.
    await expect(page.locator('[data-credit]')).toContainText('the deposits come off this');
    expect(await figure(page, 'tuitionDue')).toBe(
      (await classPrice(page, 'algebra-1:year')) - (await figure(page, 'deposits')),
    );
  });

  test('takes a child’s registration fee off when their last class goes', async ({ page }) => {
    // The fee is once per student *with a class* — an empty row is not a
    // student, and a family who changes their mind about a second child must
    // not be left paying $25 for them.
    await open(page);
    await page.selectOption('#apply-child-count', '2');
    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
    await page.check('input[name="child-1-classes"][value="algebra-1:year"]');

    // Their own figure is the class and their fee — the deposit is credited
    // against the tuition, so the family pays it once.
    const registration = (await figure(page, 'registration')) / 2;
    const theirs = await childFigure(page, 1);
    expect(theirs).toBe((await classPrice(page, 'algebra-1:year')) + registration);

    const both = await grandTotals(page);
    await page.uncheck('input[name="child-1-classes"][value="algebra-1:year"]');
    const one = await grandTotals(page);

    // All of it comes off, the fee with it: a row with no class is not a
    // student, and $25 for a child nobody is enrolling is the bug.
    expect(both[0]! - one[0]!).toBe(theirs);
    expect(await childFigure(page, 1)).toBe(0);
  });

  test('leaves a hidden child’s classes out of what the family owes', async ({ page }) => {
    // A row the family has hidden posts nothing, so it must cost nothing —
    // the same reading the server makes of it, one round trip later.
    await open(page);
    await page.selectOption('#apply-child-count', '2');
    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');

    const alone = await grandTotals(page);
    await page.check('input[name="child-1-classes"][value="kingdom-math:year"]');
    expect((await grandTotals(page))[0]).toBeGreaterThan(alone[0]!);

    await page.selectOption('#apply-child-count', '1');
    expect((await grandTotals(page))[0]).toBe(alone[0]);
  });

  test('announces the grand total, and does not read the working back', async ({ page }) => {
    // The fourth line is what the choice cost. The three above it are how it
    // was arrived at, and re-reading them on every tick is noise.
    await open(page);

    await expect(page.locator('.totals > li.due[aria-live="polite"]')).toHaveCount(1);
    await expect(page.locator('.totals[aria-live], .totals > li:not(.due)[aria-live]')).toHaveCount(
      0,
    );
  });

  test('opens as a clean slate with no inquiry in the link', async ({ page }) => {
    // AC 1's other half: the prefill is unit-tested; what HTTP has to prove is
    // that arriving without one is the same form, not an error.
    await open(page);
    await expect(page.locator('#apply-family-name')).toHaveValue('');
  });

  test('treats a mangled inquiry link as no inquiry at all', async ({ page }) => {
    // The link Jill pastes gets wrapped by email clients. A malformed id must
    // be the same clean slate over HTTP — a 200, not a 500 from a uuid cast.
    const response = await open(page, `${APPLICATION_PATH}?inquiry=not-a-uuid`);

    expect(response?.status()).toBe(200);
    await expect(page.locator('form[data-application-form]')).toHaveCount(1);
    await expect(page.locator('#apply-family-name')).toHaveValue('');
    // And it says so rather than opening silently blank (#317). An expired link
    // reaches exactly this line — one state, not two.
    await expect(page.locator('[data-prefill="unopened"]')).toContainText('90 days');
  });

  test('tells a family who arrived with no link nothing about a prefill', async ({ page }) => {
    // The notice is owed to somebody who followed a link, not to a family
    // browsing the site from the Admissions page (#317).
    await open(page);
    await expect(page.locator('[data-prefill]')).toHaveCount(0);
  });

  test('promises no response time on the page as it is reached', async ({ page }) => {
    await open(page);
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
  });

  /*
   * The payment buttons wait for the reference (#304).
   *
   * Vanco ignores every memo parameter, so the reference is typed into the Memo
   * box by hand — and it does not exist until the application is a row. A
   * family who pays first sends money that arrives attached to nobody, so the
   * stage shows the shape of the payment with no way to act on it: real
   * `disabled` buttons, which a link cannot be.
   *
   * Whether either line is on screen at all is a fact about the school's fee
   * links and not about this test, which is why it reads what is there.
   */
  test('greys the payment buttons while the application is still being filled in', async ({
    page,
  }) => {
    await open(page);

    const payment = page.locator('[data-section="apply-payment"]');
    const buttons = payment.locator('[data-pay-online]');
    const offered = await buttons.count();
    test.skip(offered === 0, 'this deployment has no fee payment links, so there is no button');

    for (const button of await buttons.all()) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveJSProperty('tagName', 'BUTTON');
      // A disabled button is skipped by the keyboard; a link dressed to look
      // inert is not, which is the whole reason this is a button.
      await expect(button).toHaveJSProperty('disabled', true);
    }

    // With a reason beside them, so a wait reads as a wait and not as a page
    // that is broken.
    await expect(payment.locator('[data-pay-waiting]')).toContainText(
      'open when you send this application',
    );
    await expect(payment.locator('[data-pay-waiting]')).toContainText('reference number');

    // And the check is still where it was, behind its own disclosure.
    const byCheck = payment.locator('[data-pay-by-check]');
    await expect(byCheck).toHaveJSProperty('open', false);
    await expect(byCheck.locator('summary')).toHaveText('Prefer to pay by check?');
  });

  test('takes a real application and holds the reference', async ({ page }) => {
    test.skip(!MAY_SUBMIT, 'a real send writes an application row');
    await open(page);

    // A bare application no longer sends (#85): the faith column and the two
    // agreement answers are part of what the school asked for.
    await fillSendable(page);
    expect(await greyed(page)).toBe(false);
    await clickSend(page);

    // The row is the backing for the sentence, and the reference is the short
    // code derived from its id — never the uuid, which nobody retypes (#218).
    const outcome = page.locator('[data-outcome="received"]');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText(new RegExp(`Reference ${REFERENCE_SHAPE}\\.`));

    // The confirmation replays the choice and what to pay, and promises no
    // clock. Which of the two payment branches is on screen is a fact about the
    // school's own fee links (#303) and not about this application, so the
    // assertion is that exactly one of them is there.
    const confirmation = page.locator('[data-section="apply-confirmation"]');
    await expect(confirmation).toContainText('Suite Child');
    await expect(confirmation).toContainText('Algebra 1');
    await expect(confirmation.getByRole('heading', { name: 'What to Pay' })).toBeVisible();
    await expect(
      confirmation.locator('[data-paying="online"], [data-paying="check"]'),
    ).toHaveCount(1);
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);

    /*
     * And where the stage greyed its buttons, this screen hands over live ones
     * (#304): the reference exists now, and it is printed beside them for the
     * Memo box. Nothing is greyed here and nothing waits.
     */
    for (const link of await confirmation.locator('[data-pay-online]').all()) {
      await expect(link).toHaveJSProperty('tagName', 'A');
      await expect(link).toHaveAttribute('href', /^https?:/);
      await expect(link).toBeEnabled();
    }
    await expect(confirmation.locator('[data-pay-waiting]')).toHaveCount(0);

    /*
     * And the bar the form stage is held to (#304).
     *
     * `accessibility.spec.ts` sweeps the form stage at five widths, but it
     * cannot reach this one: the confirmation exists only after an application
     * has been sent, which is a row written, which is why it is measured here
     * where a send is already happening.
     */
    const audit = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(audit.violations.map(describeViolation)).toEqual([]);

    // The suite has no mail credentials, so no email went — and the page must
    // not claim one did (#136). The family has everything they need on screen.
    await expect(page.locator('[data-outcome="emailed"]')).toHaveCount(0);
    // The claim, not the word: "email" may legitimately appear on this page.
    expect(await confirmation.innerText()).not.toMatch(/(on its way to|we have emailed|sent you)/i);
  });

  test('sends an application that answers No to both documents (#255)', async ({ page }) => {
    test.skip(!MAY_SUBMIT, 'a real send writes an application row');
    await open(page);

    await fillSendable(page);
    await answerAgreements(page, 'no');

    // A "no" routes to a conversation, and routing is not delaying: the send is
    // open before the click and the row exists after it (ADR-0009).
    expect(await greyed(page)).toBe(false);
    await clickSend(page);

    const outcome = page.locator('[data-outcome="received"]');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText(new RegExp(`Reference ${REFERENCE_SHAPE}\\.`));
  });
});

/**
 * The same gate, with scripting off (#85, story 11).
 *
 * The gate is the one place a browser and a server could silently disagree, so
 * every rule asserted above is asserted here again by round trip. What changes
 * is *when* a family is told, never *whether* — and a refused POST lands them on
 * the same first outstanding control rather than on a banner at the top of a
 * five-thousand-word document.
 */
test.describe('the application page without scripting', () => {
  test.use({ javaScriptEnabled: false });

  test('greys the send from the server, and ungreys it from the server', async ({ page }) => {
    await page.goto(APPLICATION_PATH);
    expect(await greyed(page)).toBe(true);

    await fillSendable(page);
    // Nothing re-derives in the page, so the round trip is the derivation. A
    // check writes nothing, which is why it is the one used here.
    await clickCheck(page);

    expect(await greyed(page)).toBe(false);
    await expect(page.locator('[data-missing-for="faith"]')).toBeHidden();
  });

  test('is told the same figures, one round trip later (#261)', async ({ page }) => {
    // ADR-0019's promise to a family with scripting off: the browser's copy of
    // the arithmetic is an enhancement and never the source, so every figure is
    // still right on first paint and still right after a POST — later, never
    // wrong. A check writes nothing, so this is safe against a real deployment.
    await page.goto(APPLICATION_PATH);
    expect((await allFigures(page)).every((amount) => amount === 0)).toBe(true);

    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
    // Nothing has moved yet, and that is the correct page: no script has run.
    expect((await grandTotals(page))[0]).toBe(0);

    await clickCheck(page);
    // The round trip is the derivation here, so the figures are only readable
    // once the page it brings back has arrived. Everything below reads the DOM
    // once rather than retrying, which is the point — a figure that settles a
    // moment later is a figure a family can catch stale.
    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();

    // Every figure has moved off zero — internal agreement alone would be
    // satisfied by a page that had quietly dropped the class — and the grand
    // total reads the same wherever it is printed.
    const figures = await allFigures(page);
    expect(figures.every((amount) => amount > 0)).toBe(true);

    const grand = await grandTotals(page);
    expect(new Set(grand).size).toBe(1);
    expect(grand[0]).toBe(
      (await figure(page, 'registration')) +
        (await figure(page, 'deposits')) +
        (await figure(page, 'tuitionDue')),
    );
    expect(grand[0]).toBe(
      (await classPrice(page, 'algebra-1:year')) + (await figure(page, 'registration')),
    );
    expect(await childFigure(page, 0)).toBe(grand[0]);
  });

  test('prints each child’s figure on the row their classes are on (#261)', async ({ page }) => {
    // A POST closes the gaps in the children: a family who leaves the first row
    // blank and fills the second gets one row back, with that child's name, age
    // and boxes on it. The figure has to travel with them — a row showing one
    // child's classes beside another child's money is the failure this asserts
    // against, and it is only reachable through the round trip.
    await page.goto(APPLICATION_PATH);
    await page.selectOption('#apply-child-count', '2');
    await clickCheck(page);

    await page.fill('#apply-child-1-name', 'Suite Child');
    await page.fill('#apply-child-1-age', '13');
    await page.check('input[name="child-1-classes"][value="algebra-1:year"]');
    await clickCheck(page);
    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();

    for (const row of await page.locator('fieldset[data-child-row]:not([disabled])').all()) {
      const chosen = await row.locator('input[name$="-classes"]:checked').count();
      const owed = dollars(await row.locator('[data-child-total]').innerText());
      expect(chosen > 0).toBe(owed > 0);
    }
  });

  test('leaves the send ungreyed when the classes collide', async ({ page }) => {
    // The server's half of #89 AC 8, and the one that matters most: with
    // scripting off the warning and the button are decided by the same render,
    // so a completeness rule that had quietly learned about the timetable would
    // show up here as a greyed button beside a warning that says "you can send
    // this anyway". A check writes nothing, so this is safe against a real
    // deployment.
    await page.goto(APPLICATION_PATH);

    await fillSendable(page);
    await tickClashingPair(page);
    await clickCheck(page);

    await expect(page.locator('li[data-severity="clash"]').first()).toBeVisible();
    expect(await greyed(page)).toBe(false);
    await expect(stillNeeded(page, 'classes')).toBeHidden();
  });

  test('warns about the Algebra 1 and Latin collision before anything is sent', async ({
    page,
  }) => {
    // AC 3, as a family without scripting experiences it: tick the pair, ask
    // for the totals, and be told about the collision while the check is still
    // in the drawer. The clash rule needs the timetable, which is deliberately
    // kept out of the bundle (#261), so the round trip is where a warning can
    // arrive before a send — and it writes nothing, so this runs against a real
    // deployment too.
    await page.goto(APPLICATION_PATH);

    await tickClashingPair(page);
    await clickCheck(page);

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-clashes]')).not.toHaveAttribute('data-clashes', '0');
    const clash = page.locator('li[data-severity="clash"]').first();
    await expect(clash).toBeVisible();
    await expect(clash).toContainText('Algebra 1');
    await expect(clash).toContainText('Beginner Latin');

    // A warning and never a block: no submit is disabled, and a collision is
    // not one of the things the still-needed list can name (#85).
    await expect(page.locator('button[type="submit"][disabled]')).toHaveCount(0);
    await expect(stillNeeded(page, 'classes')).toBeHidden();
    // And what was ticked is still ticked — a preview that cleared the form
    // would cost a family their whole selection for having asked a question.
    await expect(
      page.locator('input[name="child-0-classes"][value="algebra-1:year"]'),
    ).toBeChecked();
  });

  test('says nothing when two children hold that slot between them', async ({ page }) => {
    // AC 5, the sibling case. Two children in two rooms at 11:20 on a Monday is
    // not a collision, and a family of two told it was would be talked out of a
    // choice that was right all along.
    await page.goto(APPLICATION_PATH);

    // No script, so the second row arrives by round trip — and the round trip
    // that opens it writes nothing.
    await page.selectOption('#apply-child-count', '2');
    await clickCheck(page);

    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
    await page.check('input[name="child-1-classes"][value="beginner-latin-grades-5-6:year"]');
    await clickCheck(page);

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-clashes]')).toHaveAttribute('data-clashes', '0');
    await expect(page.locator('li[data-severity]')).toHaveCount(0);
  });

  test('names the child a warning belongs to when both have one', async ({ page }) => {
    await page.goto(APPLICATION_PATH);

    // The second row arrives by round trip, and that round trip writes nothing.
    await page.selectOption('#apply-child-count', '2');
    await clickCheck(page);

    await page.fill('input[name="child-0-name"]', 'Ada');
    await page.fill('input[name="child-1-name"]', 'Obi');
    for (const index of [0, 1]) {
      await page.check(`input[name="child-${index}-classes"][value="algebra-1:year"]`);
      await page.check(
        `input[name="child-${index}-classes"][value="beginner-latin-grades-5-6:year"]`,
      );
    }
    await clickCheck(page);

    await expect(page.locator('[data-child-clashes]')).toHaveCount(2);
    await expect(page.locator('[data-child-clashes="0"]')).toContainText('Ada');
    await expect(page.locator('[data-child-clashes="1"]')).toContainText('Obi');
  });

  test('carries the number of children through the POST', async ({ page }) => {
    // The browser's half of this is the picker showing and hiding rows; the
    // server's half is what the POST then carried. Three go, three come back,
    // and the picker survives the round trip rather than snapping back to one.
    // Dropping a row is the script's half and is asserted there: with scripting
    // off no row is ever disabled, and a child already typed in is never
    // silently removed by a smaller count.
    await page.goto(APPLICATION_PATH);

    // Two round trips: one to open the rows, one to carry what was typed into
    // them. Neither writes a row.
    await page.selectOption('#apply-child-count', '3');
    await clickCheck(page);

    for (const index of [0, 1, 2]) {
      await page.fill(`input[name="child-${index}-name"]`, `Child ${index}`);
      await page.check(`input[name="child-${index}-classes"][value="algebra-1:year"]`);
      await page.check(
        `input[name="child-${index}-classes"][value="beginner-latin-grades-5-6:year"]`,
      );
    }
    await clickCheck(page);

    await expect(page.locator('[data-child-clashes]')).toHaveCount(3);
    await expect(page.locator('#apply-child-count')).toHaveValue('3');
    await expect(page.locator('input[name="child-2-name"]')).toHaveValue('Child 2');
  });

  test('refuses an incomplete send, gives back what was typed, and lands on it', async ({
    page,
  }) => {
    // A refused send stores nothing, so this is safe against a real deployment.
    await page.goto(APPLICATION_PATH);

    await page.fill('#apply-family-name', 'Suite Family');
    await clickSend(page);

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#apply-family-name')).toHaveValue('Suite Family');
    await expect(page.locator('#apply-email-error')).toBeVisible();
    await expect(page.locator('#apply-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#apply-children-error')).toBeVisible();
    await expect(page.locator('#apply-classes-error')).toBeVisible();
    await expect(page.locator('#apply-faith-error')).toBeVisible();

    // Not the banner. The first thing that needs them, in reading order — which
    // on this form is the Statement of Faith grid, above everything else.
    await expect(page.locator('[data-faith-grid] input').first()).toBeFocused();

    // The banner is still there and still announced — it is what a screen
    // reader hears. It is just no longer where the family is put (#88).
    await expect(page.locator('[data-outcome="failed"]')).toHaveAttribute('role', 'status');
  });

  test('lands on the field that is missing, not on the first field there is', async ({ page }) => {
    await page.goto(APPLICATION_PATH);

    await fillSendable(page, 'email');
    await clickSend(page);

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#apply-email')).toBeFocused();
    // An error near the top of the document, and it is on screen (#88).
    await expect(page.locator('#apply-email')).toBeInViewport();
  });

  test('lands on the child who is short, not on the first child there is', async ({ page }) => {
    await page.goto(APPLICATION_PATH);

    // No script, so the second row arrives by round trip. A check writes
    // nothing, which is why it is the one used to open it.
    await fillSendable(page);
    await page.selectOption('#apply-child-count', '2');
    await clickCheck(page);

    await page.fill('#apply-child-1-name', 'Second Child');
    await clickSend(page);

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('#apply-child-1-age')).toBeFocused();
    // And the still-needed line points there too, rather than at a filled box.
    await expect(stillNeeded(page, 'children').locator('a')).toHaveAttribute(
      'href',
      '#apply-child-1-age',
    );
  });

  test('lands on the document nobody has answered, not on the first one', async ({ page }) => {
    await page.goto(APPLICATION_PATH);

    await fillSendable(page, 'agreements');
    await page.check('[data-agreement="code-of-conduct"] input[value="yes"]');
    await clickSend(page);

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();

    // An error near the *bottom* of a document that runs from eleven articles
    // through eight child rows to the totals (#88). The banner still renders
    // and is still announced, but the family is not parked on it: it is off
    // screen, above where they have been put.
    const handbook = page.locator('[data-agreement="handbook"] input').first();
    await expect(handbook).toBeFocused();
    await expect(handbook).toBeInViewport();
    await expect(page.locator('[data-outcome="failed"]')).not.toBeInViewport();
  });

  test('lands on the empty class list above the child who is short (#88)', async ({ page }) => {
    await page.goto(APPLICATION_PATH);

    // No script, so the second row arrives by round trip, and a check writes
    // nothing.
    await fillSendable(page, 'classes');
    await page.selectOption('#apply-child-count', '2');
    await clickCheck(page);

    await page.fill('#apply-child-1-name', 'Second Child');
    await clickSend(page);

    await expect(page.locator('[data-outcome="failed"]')).toBeVisible();
    await expect(page.locator('input[name="child-0-classes"]').first()).toBeFocused();
  });

  test('sends a complete application by round trip', async ({ page }) => {
    test.skip(!MAY_SUBMIT, 'a real send writes an application row');
    await page.goto(APPLICATION_PATH);

    await fillSendable(page);
    await clickSend(page);

    await expect(page.locator('[data-outcome="received"]')).toBeVisible();
  });
});
