import { expect, test, type Page } from '@playwright/test';

import { APPLICATION_PATH, FAITH_QUESTIONS, faithKey } from '../src/lib/application/application.js';
import { REFERENCE_SHAPE } from '../src/lib/application/reference.js';

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

/** Press Check, and wait for the page it brings back to be enhanced again. */
async function clickCheck(page: Page) {
  await page.getByRole('button', { name: 'Check these choices' }).click();
  await page.locator('form[data-enhanced]').waitFor();
}

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
    await expect(page.getByRole('button', { name: 'Check these choices' })).toBeEnabled();
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

    const fields = ['faith', 'familyName', 'email', 'children', 'classes', 'agreements'];
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
  });

  test('warns about the Algebra 1 and Latin collision before anything is sent', async ({
    page,
  }) => {
    // AC 3, as a family experiences it: tick the pair, ask for a check, and be
    // told about the collision while the check is still in the drawer. A
    // check writes nothing, so this runs against a real deployment too.
    await open(page);

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
    // And what was ticked is still ticked — a check that clears the form would
    // cost a family their whole selection for having asked a question.
    await expect(
      page.locator('input[name="child-0-classes"][value="algebra-1:year"]'),
    ).toBeChecked();
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

  test('says nothing when two children hold that slot between them', async ({ page }) => {
    // AC 5, the sibling case. Two children in two rooms at 11:20 on a Monday is
    // not a collision, and a family of two told it was would be talked out of a
    // choice that was right all along.
    await open(page);

    await page.selectOption('#apply-child-count', '2');
    await page.check('input[name="child-0-classes"][value="algebra-1:year"]');
    await page.check('input[name="child-1-classes"][value="beginner-latin-grades-5-6:year"]');
    await clickCheck(page);

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-clashes]')).toHaveAttribute('data-clashes', '0');
    await expect(page.locator('li[data-severity]')).toHaveCount(0);
  });

  test('names the child a warning belongs to when both have one', async ({ page }) => {
    await open(page);

    await page.selectOption('#apply-child-count', '2');
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
    await clickCheck(page);

    // Three children went, three came back, and the picker survived the POST.
    await expect(page.locator('[data-child-clashes]')).toHaveCount(3);
    await expect(page.locator('#apply-child-count')).toHaveValue('3');

    // Down to two: the third row is disabled as well as hidden, so it posts
    // nothing — a child the family is no longer applying for does not arrive
    // with a timetable collision the school would then ask them about.
    await page.selectOption('#apply-child-count', '2');
    await expect(page.locator('fieldset[data-child-row]:visible')).toHaveCount(2);
    await clickCheck(page);

    await expect(page.locator('[data-child-clashes]')).toHaveCount(2);
    await expect(page.locator('#apply-child-count')).toHaveValue('2');
    await expect(page.locator('input[name="child-2-name"]')).toHaveValue('');
  });

  test('a check previews the totals and the collisions, and reports no missing fields', async ({
    page,
  }) => {
    // The check is "did I pick two classes that collide", not "you forgot your
    // name" — an empty check must come back clean, not covered in errors. It is
    // a preview and never a step: passing it is not a thing #85 can require,
    // and failing to press it is not a thing #85 can hold against a family.
    await open(page);

    await tickClashingPair(page);
    await clickCheck(page);

    await expect(page.locator('[data-outcome="checked"]')).toBeVisible();
    await expect(page.locator('[data-outcome="failed"]')).toHaveCount(0);
    await expect(page.locator('.error:visible')).toHaveCount(0);
    // The preview it exists for: the totals and the collision, both still there.
    await expect(page.locator('li[data-severity="clash"]').first()).toBeVisible();
    await expect(page.locator('.totals')).toBeVisible();
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
  });

  test('promises no response time on the page as it is reached', async ({ page }) => {
    await open(page);
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);
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

    // The confirmation replays the choice and the check, and promises no clock.
    const confirmation = page.locator('[data-section="apply-confirmation"]');
    await expect(confirmation).toContainText('Suite Child');
    await expect(confirmation).toContainText('Algebra 1');
    await expect(confirmation).toContainText('Pharos Academy');
    expect(await page.locator('main').innerText()).not.toMatch(CLOCKS);

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
    await page.getByRole('button', { name: 'Check these choices' }).click();

    expect(await greyed(page)).toBe(false);
    await expect(page.locator('[data-missing-for="faith"]')).toBeHidden();
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
    await page.getByRole('button', { name: 'Check these choices' }).click();

    await expect(page.locator('li[data-severity="clash"]').first()).toBeVisible();
    expect(await greyed(page)).toBe(false);
    await expect(stillNeeded(page, 'classes')).toBeHidden();
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
    await page.getByRole('button', { name: 'Check these choices' }).click();

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
    await page.getByRole('button', { name: 'Check these choices' }).click();

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
