import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { SEEDED_ANNOUNCEMENTS } from '../src/lib/announcements/announcement.js';
import { eventSlug } from '../src/lib/calendar/event.js';
import { addDays, schoolToday } from '../src/lib/calendar/year.js';
import { AXE_TAGS, describeViolation } from './axe.js';
import { SUITE_ADMIN, SUITE_KEPT, signIn } from './suite-admin.js';

/**
 * The lock (#202).
 *
 * The adoption tickets (#194–#201) fixed the admin's accessibility wiring
 * structurally, by making every labeled control come from one component. This
 * suite is what stops it rotting again: every signed-in admin screen measured
 * by axe, each editor measured a second time **with its form refused**, and the
 * three confirmation screens measured as well.
 *
 * Refused states are here because that is where axe finds real violations. A
 * form at rest has no `aria-invalid`, no `aria-describedby` pointing at a
 * complaint and no error region to name — the wiring that rots is wiring that
 * only exists once something has been rejected, so measuring the resting form
 * measures the half that cannot fail.
 *
 * Everything here runs against the config-started server with its throwaway
 * in-process database, signed in as the suite account (`suite-admin.ts`).
 * Nothing measured writes to that database except the event editor, which
 * creates the event it measures and takes it away again.
 */

/**
 * The two widths the admin is held to.
 *
 * Not the public suite's five. The admin is a desk tool used by one or two
 * people, and #192 puts mobile work beyond "nothing broken at phone width" out
 * of scope — so what is asserted is the phone and the desk, the two ends where
 * a layout either holds or does not. The three widths in between are where the
 * public site's marketing layouts reflow; no admin screen has a breakpoint
 * there to be caught by them.
 */
const ADMIN_WIDTHS = [390, 1440];

/** The announcement the seed publishes, so there is an editor with a row in it. */
const SEEDED_ANNOUNCEMENT = `/admin/announcements/${SEEDED_ANNOUNCEMENTS[0]!.slug}`;

/**
 * Every admin screen a signed-in person can reach, at rest.
 *
 * One list, so a screen added to the admin is measured at both widths by
 * construction rather than by somebody remembering to copy a block. The login
 * page is the one screen not on it — there is nobody signed in to reach it, so
 * it is measured on its own below, at rest and refused together.
 */
const SCREENS = [
  '/admin/money',
  '/admin/school-details',
  '/admin/users',
  '/admin/people',
  '/admin/people/jill-kilker',
  '/admin/people/new',
  '/admin/announcements',
  SEEDED_ANNOUNCEMENT,
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
  // #24. The course editor is the School Year screen's rival for density —
  // three groups of checkboxes, four selects and a computed price that is
  // read-only text rather than a disabled input, which is the part a
  // screen reader has to be told correctly.
  '/admin/courses',
  '/admin/courses/algebra-1',
  '/admin/courses/new',
  // #25. A list of what families typed, with a warning line on any inquiry
  // the school was not emailed about — and the one admin screen whose content
  // comes from the public site rather than from an admin form.
  '/admin/inquiries',
  // #32. Two rows of buttons under every application — the application's own
  // state and the money's — which is the screen's densest interactive region
  // and the one where a screen reader has to be able to tell them apart.
  '/admin/applications',
];

test.describe('every admin screen', () => {
  for (const path of SCREENS) {
    for (const width of ADMIN_WIDTHS) {
      test(`${path} has zero axe violations at ${width}px`, async ({ page }) => {
        await openAt(page, path, width);

        await expectNoViolations(page);
      });
    }
  }
});

/**
 * Each editor with its form refused.
 *
 * Every recipe below has to get **past the browser** before it can be refused
 * by the server: `novalidate` is not set anywhere in the admin, so a cleared
 * required field never posts at all. A field of spaces is the usual way in —
 * `required` sees a non-empty value and the server's trim is what catches it —
 * and where a field has no HTML constraint the value is simply one the parser
 * rejects. None of these writes anything.
 */
const REFUSALS: { path: string; complains: string; refuse: (page: Page) => Promise<void> }[] = [
  {
    path: '/admin/school-details',
    complains: 'a required field emptied to spaces',
    refuse: async (page) => {
      await page.getByLabel('Address').fill('   ');
    },
  },
  {
    path: '/admin/money',
    complains: 'a rate of zero',
    refuse: async (page) => {
      await page.getByLabel('Standard rate, per hour').fill('0');
    },
  },
  {
    path: '/admin/people/jill-kilker',
    complains: 'a person with no role',
    refuse: async (page) => {
      await page.getByLabel('Role').fill('   ');
    },
  },
  {
    path: '/admin/people/new',
    complains: 'a person with neither name nor role',
    refuse: async (page) => {
      await page.getByLabel('Name').fill('   ');
      await page.getByLabel('Role').fill('   ');
    },
  },
  {
    path: SEEDED_ANNOUNCEMENT,
    complains: 'an announcement with no headline',
    refuse: async (page) => {
      await page.getByLabel('Headline').fill('   ');
    },
  },
  {
    // Three complaints at once, which is the state the shared field has to get
    // right: two empty required fields and a link with text but no address.
    path: '/admin/announcements/new',
    complains: 'an empty announcement carrying link text and no link',
    refuse: async (page) => {
      await page.getByLabel('Headline').fill('   ');
      await page.getByLabel('What it says').fill('   ');
      await page.getByLabel('Posted on').fill(schoolToday(new Date()));
      await page.getByLabel('Link text').fill('here');
    },
  },
  {
    path: '/admin/policies/new',
    complains: 'a policy with no title',
    refuse: async (page) => {
      await page.getByLabel('Title').fill('   ');
    },
  },
  {
    // The one refusal this screen actually has: a file the school believes is a
    // PDF and is not. Nothing is replaced — the document families are served
    // stays exactly as it was.
    path: '/admin/policies/handbook',
    complains: 'a document that is not a PDF',
    refuse: async (page) => {
      await page.getByLabel('The document').setInputFiles({
        name: 'handbook.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('<html>not a pdf at all</html>'),
      });
    },
  },
  {
    path: '/admin/school-year',
    complains: 'a first class date that is not that track’s weekday',
    // Scoped to the term's own fieldset rather than reached by id: every track
    // label appears twice on this screen, once per term, so the label alone is
    // ambiguous and the id is `AdminField`'s business rather than this spec's.
    refuse: async (page) => {
      await page
        .getByRole('group', { name: /Fall/ })
        .getByLabel('Wednesday — first class')
        .fill('2026-09-03');
    },
  },
  {
    path: '/admin/events/new',
    complains: 'an event with no name',
    refuse: async (page) => {
      await page.getByLabel('Date').fill(addDays(schoolToday(new Date()), 210));
      await page.getByLabel('What it is').fill('   ');
    },
  },
  {
    path: '/admin/courses/algebra-1',
    complains: 'a class with no title',
    refuse: async (page) => {
      await page.getByLabel('Title').fill('   ');
    },
  },
  {
    // Six complaints at once — stages, days, shape, units, rate and instructor
    // are all unanswered — which makes this the densest error state in the
    // admin and the one where a group-level complaint has to reach its
    // fieldset rather than float beside it.
    path: '/admin/courses/new',
    complains: 'every group left unanswered',
    refuse: async (page) => {
      await page.getByLabel('Title').fill('A class the suite never saves');
      await page.getByLabel('Description').fill('Typed, so the browser lets the form through.');
      await page.getByLabel('Ages, in the school’s words').fill('Any age');
      await page.getByLabel('Prerequisites').fill('None');
      await page.getByLabel('Weeks').fill('14');
    },
  },
];

test.describe('an editor with its form refused', () => {
  for (const { path, complains, refuse } of REFUSALS) {
    for (const width of ADMIN_WIDTHS) {
      test(`${path} has zero axe violations complaining about ${complains} at ${width}px`, async ({
        page,
      }) => {
        await openAt(page, path, width);

        await refuse(page);
        await save(page);

        // The state being measured is the refused one, so prove it is refused
        // before measuring — a recipe the browser silently swallowed would
        // otherwise measure a resting form and report it as covered.
        const banner = page.getByTestId('save-banner');
        await expect(banner).toHaveAttribute('data-ok', 'false');

        await expectNoViolations(page);
      });
    }
  }
});

/**
 * The login screen, which nobody is signed in to reach.
 *
 * Refused separately from `REFUSALS` because its refusal is a different shape:
 * no save banner and no field-level complaint, but one `role="alert"` for the
 * whole form, deliberately saying nothing about which half was wrong (#18 §4).
 * It is still a refused form and still where the wiring can rot.
 */
test.describe('the login screen', () => {
  for (const width of ADMIN_WIDTHS) {
    test(`has zero axe violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/login');

      await expectNoViolations(page);
    });

    test(`has zero axe violations refused at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/login');

      await page.getByLabel('Username').fill(SUITE_ADMIN.username);
      await page.getByLabel('Password').fill('not the passphrase at all');
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByRole('alert')).toBeVisible();

      await expectNoViolations(page);
    });
  }
});

/**
 * The screens that ask "are you sure?" (#200, #29).
 *
 * Each is a whole screen rather than a dialog, reached by a POST and rendered
 * in place of what asked for it — so none of them is measured by the screen
 * list above, and each is the last thing a person reads before an irreversible
 * click. Money's and the account delete are here; the event removal needs a
 * saved event and is measured with it below.
 */
test.describe('a confirmation screen', () => {
  for (const width of ADMIN_WIDTHS) {
    test(`Money’s confirmation has zero axe violations at ${width}px`, async ({ page }) => {
      await openAt(page, '/admin/money', width);

      // Asking is not saving: the first Save renders the confirmation and
      // writes nothing, so this measures the screen without moving the figure
      // every other spec reads.
      const deposit = page.getByLabel('Deposit, per class');
      await deposit.fill(String(Number(await deposit.inputValue()) + 5));
      await save(page);

      await expect(page.getByTestId('confirm')).toContainText('This affects every family.');

      await expectNoViolations(page);
    });

    test(`deleting an account has zero axe violations at ${width}px`, async ({ page }) => {
      await openAt(page, '/admin/users', width);

      // Suite Kept, not Suite Spare: the spare is deleted by `admin.spec.ts`
      // and would be gone by the time this ran. Nothing here confirms, so the
      // account is still there for the next width.
      await page.getByRole('button', { name: `Delete ${SUITE_KEPT}` }).click();
      await expect(page.getByTestId('confirm')).toContainText(`Delete ${SUITE_KEPT}?`);

      await expectNoViolations(page);
    });

  }
});

/**
 * The saved event: its editor, and the screen that asks before removing it.
 *
 * Both states need a row that exists, and `/admin/events/new` cannot supply
 * one — so one event is added for the whole file and taken away at the end,
 * rather than one per measurement. That is not tidiness: **every save and every
 * removal republishes the whole site**, and a dev server serving four workers
 * does not survive a dozen of them. One add and one removal is what this
 * costs.
 *
 * Serial, because the six measurements share that one event.
 */
test.describe('a saved event', () => {
  test.describe.configure({ mode: 'serial' });

  const TITLE = 'Suite axe event';
  const HELD_ON = addDays(schoolToday(new Date()), 300);
  const EDITOR = `/admin/events/${eventSlug(HELD_ON, TITLE)}`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page, '/admin/events/new');
    await addEvent(page, TITLE, HELD_ON);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page, '/admin/events');
    await removeEvent(page, EDITOR);
    await page.close();
  });

  for (const width of ADMIN_WIDTHS) {
    test(`its editor has zero axe violations at ${width}px`, async ({ page }) => {
      await openAt(page, EDITOR, width);

      await expectNoViolations(page);
    });

    /*
     * The edit path's refused state, which `/admin/events/new` does not stand
     * in for: this form carries a Publishing section, a stamp and the removal
     * control, so a complaint here is rendered among markup the add form does
     * not have.
     */
    test(`its editor has zero axe violations refused at ${width}px`, async ({ page }) => {
      await openAt(page, EDITOR, width);

      await page.getByLabel('What it is').fill('   ');
      await save(page);

      await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'false');

      await expectNoViolations(page);
    });

    test(`taking it off the calendar has zero axe violations at ${width}px`, async ({ page }) => {
      await openAt(page, EDITOR, width);

      // Asking is not removing: the first press renders the confirmation and
      // writes nothing, so the event is still there for the next measurement.
      await page.getByRole('button', { name: 'Take this off the calendar' }).click();
      await expect(page.getByTestId('confirm')).toContainText('subscribe to');

      await expectNoViolations(page);
    });
  }
});

/**
 * The keyboard pass (#192 story 18).
 *
 * Spot-checked rather than exhaustive, and deliberately so: axe already proves
 * every control is a control, and a browser proves keys reach it. What is
 * checked here is the three places where a keyboard user is most easily
 * stranded — the sign-in that starts everything, the navigation that is the
 * only way between screens, and the confirmation whose primary control is
 * reached across a form boundary.
 */
test.describe('the keyboard', () => {
  test('signs in without a mouse', async ({ page }) => {
    await page.goto('/admin/login?next=%2Fadmin%2Fpeople');

    // Tabbed to rather than focused programmatically: what is being claimed is
    // that the fields are in the tab order in the order they are read, which
    // `page.focus` would assume rather than prove.
    await page.keyboard.press('Tab'); // Skip to content
    await page.keyboard.press('Tab'); // Username
    await page.keyboard.type(SUITE_ADMIN.username);
    await page.keyboard.press('Tab'); // Password
    await page.keyboard.type(SUITE_ADMIN.password);
    // Enter in a text field submits the form, which is how a person signs in.
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/admin\/people$/);
  });

  test('moves between screens without a mouse', async ({ page }) => {
    await signIn(page, '/admin/people');

    await page.getByRole('link', { name: 'Skip to content' }).focus();
    // Every nav link is reachable by tabbing forward from the top of the page,
    // and Enter follows the one that is focused.
    await tabTo(page, page.getByRole('link', { name: 'Money', exact: true }));
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/admin\/money$/);
    await expect(page.getByRole('heading', { name: 'Money', level: 1 })).toBeVisible();
  });

  test('signs out without a mouse', async ({ page }) => {
    await signIn(page, '/admin/people');

    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await tabTo(page, page.getByRole('button', { name: 'Sign out' }));
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('declines a destructive confirmation without a mouse', async ({ page }) => {
    await signIn(page, '/admin/users');

    await tabTo(page, page.getByRole('button', { name: `Delete ${SUITE_KEPT}` }));
    await page.keyboard.press('Enter');

    const confirm = page.getByTestId('confirm');
    await expect(confirm).toContainText(`Delete ${SUITE_KEPT}?`);

    // The confirm and the decline sit in different elements — a form and a
    // link beside it — which is exactly the arrangement a keyboard user can be
    // stranded in if the decline is not in the tab order after the confirm.
    await tabTo(page, confirm.getByRole('button', { name: `Yes, delete ${SUITE_KEPT}` }));
    await tabTo(page, confirm.getByRole('link', { name: 'Go back without deleting' }));
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('confirm')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Delete ${SUITE_KEPT}` })).toBeVisible();
  });

  test('completes a save without a mouse', async ({ page }) => {
    // The events editor rather than one of the screens that holds a single
    // row: a saved event is the suite's one write that belongs to nobody else,
    // so a keyboard save here cannot land on top of what another spec is in
    // the middle of reading.
    await signIn(page, '/admin/events/new');

    const title = 'Suite axe keyboard';
    const heldOn = addDays(schoolToday(new Date()), 320);
    await page.getByLabel('Date').fill(heldOn);
    await page.getByLabel('What it is').fill(title);

    await tabTo(page, page.getByRole('button', { name: 'Save', exact: true }).first());
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');

    // Removed with the keyboard too, which is the other half of story 18: the
    // one destructive action in the admin is completable without a mouse.
    await page.goto(`/admin/events/${eventSlug(heldOn, title)}`);
    await tabTo(page, page.getByRole('button', { name: 'Take this off the calendar' }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: 'Yes, take it off the calendar' }));
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/admin\/events\?/);
  });
});

/**
 * Press whichever Save this screen calls its own.
 *
 * Three names, because two screens named it for what it does rather than for
 * what it is: the School Year saves a year, and a policy that does not exist
 * yet is created rather than saved.
 */
async function save(page: Page): Promise<void> {
  for (const name of ['Save the year', 'Create']) {
    const named = page.getByRole('button', { name, exact: true });
    if ((await named.count()) > 0) {
      await named.first().click();
      return;
    }
  }
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
}

/** Add an event far enough out that no other spec's calendar assertions see it. */
async function addEvent(page: Page, title: string, heldOn: string): Promise<void> {
  await page.goto('/admin/events/new');
  await page.getByLabel('Date').fill(heldOn);
  await page.getByLabel('What it is').fill(title);
  await save(page);
  await expect(page.getByTestId('save-banner')).toHaveAttribute('data-ok', 'true');
}

/** Take it away again, so a run leaves the calendar as it found it. */
async function removeEvent(page: Page, editor: string): Promise<void> {
  await page.goto(editor);
  await page.getByRole('button', { name: 'Take this off the calendar' }).click();
  await page.getByRole('button', { name: 'Yes, take it off the calendar' }).click();
  await expect(page).toHaveURL(/\/admin\/events\?/);
}

/**
 * Sign in, size the window, and land on the screen about to be measured.
 *
 * One helper because every measurement below opens the same way, and the
 * height is part of that opening: 900 is tall enough that no admin screen is
 * measured through a letterbox, and a screen measured at a different height is
 * a screen measured against a different bar.
 */
async function openAt(page: Page, path: string, width: number): Promise<void> {
  await signIn(page, path);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
}

/**
 * Tab forward until `target` has focus, failing loudly if it never does.
 *
 * The claim is reachability — that a person pressing Tab from the top of the
 * page arrives at this control — which `focus()` cannot make: it puts focus
 * where no key sequence might.
 */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let press = 0; press < 60; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('tabbing forward never reached the control');
}

/** Measure, and report a failure by rule and element rather than as a blob. */
async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

  expect(violations.map(describeViolation)).toEqual([]);
}
