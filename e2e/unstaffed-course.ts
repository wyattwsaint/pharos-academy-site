import { expect, type Page } from '@playwright/test';

import { signIn } from './suite-admin.js';

/**
 * A class the school has scheduled and not staffed, in the suite's database
 * (#257).
 *
 * There is no seeded course without an instructor and there must not be: the
 * ticket changes no data, so every course in `catalogue.ts` keeps the person it
 * names. The state the public surfaces have to render honestly therefore has to
 * be *made*, and the only honest way to make it is the way Jill would — through
 * the add form, leaving the instructor unpicked. That the save succeeds at all
 * is itself the acceptance criterion.
 *
 * Placed on **Thursday at 11:20**, and both halves of that are load-bearing.
 * The hour is one the school already meets at — Algebra 1 runs then on Monday
 * and Wednesday — so the editor's list of pickable times is the same list it
 * was, which `the add form` asserts. The day is the one whose geometry nothing
 * measures: the lane and height specs are all Monday and Wednesday. Thursday is
 * not free at that hour — Backyard Botany runs 11:10 to 12:10, so this class
 * genuinely overlaps it, takes the second lane and draws a clash warning on
 * save. All three are the school's ordinary state (CONTEXT.md, "clash"), the
 * save succeeds regardless, and no spec reads Thursday's lanes.
 *
 * It is not put back afterwards, and cannot be: a course has no delete, for the
 * reason the admin has none (a row other rows point at). The suite's database
 * is thrown away with the server, so the class lives for one run.
 *
 * Created once and reused. Two spec files want this course and Playwright runs
 * them in parallel, so the helper checks before it posts and tolerates losing
 * the race — a duplicate insert leaves the row that won, which is the row both
 * callers wanted. It never asserts the save banner for that reason; what it
 * asserts is that the course is there afterwards.
 *
 * It signs in, so every caller must skip when `PLAYWRIGHT_BASE_URL` is set:
 * against a real deployment there is no suite account, and this would be adding
 * a class to the school's own site.
 */
export const UNSTAFFED = {
  slug: 'a-class-awaiting-its-teacher',
  title: 'A Class Awaiting Its Teacher',
  description:
    'The school means to run this class and has not yet decided who teaches it. Added by the ' +
    'suite to prove that no page invents a name for one.',
  start: '11:20',
  end: '12:20',
  day: 'Thursday',
} as const;

/**
 * Make sure the course exists, and answer with its public address.
 *
 * Where the browser is left is not part of the promise — the sign-in and the
 * form take it elsewhere — so a caller that wants a page navigates to the
 * address this hands back.
 */
export async function ensureUnstaffedCourse(page: Page): Promise<string> {
  const path = `/classes/${UNSTAFFED.slug}`;
  const existing = await page.goto(path);
  if (existing?.status() === 200) return path;

  /*
   * Signed in only if this session is not already. The admin specs sign in
   * before every test and the public ones never have, and both call this — so
   * the form is asked for first and the login is the fallback, rather than a
   * sign-in that fails for having nothing to sign in to.
   */
  await page.goto('/admin/courses/new');
  if (page.url().includes('/admin/login')) await signIn(page, '/admin/courses/new');

  await page.locator('#title').fill(UNSTAFFED.title);
  await page.locator('#description').fill(UNSTAFFED.description);
  await page.locator('input[name="stages"][value="Elementary (Grammar Stage)"]').check();
  await page.locator(`input[name="days"][value="${UNSTAFFED.day}"]`).check();
  // A slot the school already meets at, picked rather than typed — so this
  // fixture adds no new time to the editor's list.
  await page.locator('#time').selectOption(`${UNSTAFFED.start}-${UNSTAFFED.end}`);
  await page.locator('input[name="enrolment"][value="year"]').check();
  await page.locator('input[name="enrolmentUnits"][value="year"]').check();
  await page.locator('#weeks').fill('10');
  await page.locator('#ageLabel').fill('Ages 6-10');
  await page.locator('#ageMin').fill('6');
  await page.locator('#ageMax').fill('10');
  await page.locator('#rateTier').selectOption('standard');
  await page.locator('#prerequisites').fill('None');

  // And the instructor is left alone. That is the whole point of the fixture:
  // nothing is picked, and the form is posted anyway.
  await expect(page.locator('#instructorSlug')).toHaveValue('');
  await page.getByRole('button', { name: 'Save' }).click();

  const created = await page.goto(path);
  expect(created?.status(), 'the unstaffed class should have saved').toBe(200);
  return path;
}
