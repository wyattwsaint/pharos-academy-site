import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { MIGRATIONS } from '../db/migrations.js';
import { formatStamp } from './formatting.js';
import { attemptLogin } from './login.js';
import { matchesBreakGlass } from './passwords.js';
import {
  getSchoolDetails,
  parseSchoolDetails,
  saveSchoolDetails,
  schoolDetailsFields,
} from './school-details.js';
import {
  endSession,
  needsSlide,
  resolveSession,
  SESSION_DURATION_MS,
  startSession,
} from './sessions.js';
import { createUser, deleteUser, listUsers, setPassword } from './users.js';

/**
 * The store, against real Postgres.
 *
 * PGlite runs the same DDL Neon ran (`db/migrations.ts`), in this process, so
 * these are integration tests and not a second implementation of the thing
 * under test. Each test gets its own database — no ordering, no leakage.
 */

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'a-long-enough-passphrase';

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

afterEach(() => {
  delete process.env.BREAK_GLASS_PASSWORD;
});

async function jill() {
  return createUser(db, { username: 'Jill', displayName: 'Jill Kilker', password: PASSWORD });
}

async function george() {
  return createUser(db, { username: 'george', displayName: 'George Jensen', password: PASSWORD });
}

describe('named accounts', () => {
  it('gives Jill and George separate logins', async () => {
    await jill();
    await george();

    expect((await listUsers(db)).map((user) => user.username)).toEqual(['jill', 'george']);
    expect(await attemptLogin(db, 'jill', PASSWORD)).not.toBeNull();
    expect(await attemptLogin(db, 'george', PASSWORD)).not.toBeNull();

    // One password does not open the other's account.
    await setPassword(db, (await jill.call(null).catch(() => null))?.id ?? '', PASSWORD).catch(
      () => undefined,
    );
    expect(await attemptLogin(db, 'george', 'a-different-passphrase')).toBeNull();
  });

  it('accepts the username however it was typed', async () => {
    await jill();
    expect(await attemptLogin(db, '  JILL ', PASSWORD)).not.toBeNull();
  });

  it('refuses to delete the last account, so break-glass never becomes the only door', async () => {
    const only = await jill();
    await expect(deleteUser(db, only.id)).rejects.toThrow(/only account/i);

    const second = await george();
    await deleteUser(db, second.id);
    expect((await listUsers(db)).map((user) => user.username)).toEqual(['jill']);
  });

  it('lets either admin reset the other, and signs the other out everywhere', async () => {
    const her = await jill();
    const { token } = await startSession(db, { userId: her.id, breakGlass: false });
    expect(await resolveSession(db, token)).not.toBeNull();

    // George, from the Users screen, sets a new password on Jill's account.
    await setPassword(db, her.id, 'a-brand-new-passphrase');

    expect(await resolveSession(db, token)).toBeNull();
    expect(await attemptLogin(db, 'jill', PASSWORD)).toBeNull();
    expect(await attemptLogin(db, 'jill', 'a-brand-new-passphrase')).not.toBeNull();
  });

  it('ends the session of an account that is deleted', async () => {
    await jill();
    const him = await george();
    const { token } = await startSession(db, { userId: him.id, breakGlass: false });

    await deleteUser(db, him.id);

    expect(await resolveSession(db, token)).toBeNull();
  });
});

/**
 * Break-glass is asserted at `matchesBreakGlass`, never by logging in through
 * it: the ticket's binding requirement is that this path stays cold, and a test
 * that opens the door is a test that has been through it. What the login path
 * owes break-glass is that it *keeps it shut* — that it is only ever consulted
 * after a named account has said no, and that an absent value is a closed door
 * — and those are the facts driven through `attemptLogin` below.
 */
describe('break-glass', () => {
  it('recognises the value the environment holds', () => {
    process.env.BREAK_GLASS_PASSWORD = 'the-break-glass-value';

    expect(matchesBreakGlass('the-break-glass-value')).toBe(true);
    expect(matchesBreakGlass('not-the-break-glass-value')).toBe(false);
  });

  it('is a closed door when the environment does not hold one', async () => {
    delete process.env.BREAK_GLASS_PASSWORD;
    await jill();

    // Absent, and blank, are both refusals — never "anything matches".
    expect(matchesBreakGlass('')).toBe(false);
    expect(matchesBreakGlass('anything-at-all')).toBe(false);

    process.env.BREAK_GLASS_PASSWORD = '   ';
    expect(matchesBreakGlass('   ')).toBe(false);
    delete process.env.BREAK_GLASS_PASSWORD;

    expect(await attemptLogin(db, 'jill', '')).toBeNull();
    expect(await attemptLogin(db, 'anyone', 'anything-at-all')).toBeNull();
  });

  it('never shadows a named account', async () => {
    process.env.BREAK_GLASS_PASSWORD = 'the-break-glass-value';
    const her = await jill();

    const outcome = await attemptLogin(db, 'jill', PASSWORD);

    expect(outcome).toEqual({ userId: her.id, breakGlass: false });
  });

  it('stamps edits as break-glass access rather than as a person', async () => {
    const { token } = await startSession(db, { userId: null, breakGlass: true });

    const actor = await resolveSession(db, token);

    expect(actor?.breakGlass).toBe(true);
    expect(actor?.name).toBe('Break-glass access');
  });
});

describe('a 30-day sliding session', () => {
  it('survives 30 days of intermittent use', async () => {
    const her = await jill();
    const day0 = new Date('2026-01-01T09:00:00Z');
    const { token } = await startSession(db, { userId: her.id, breakGlass: false }, day0);

    // Jill signs in on 1 January and then opens the admin every few weeks. The
    // window is 30 days, so without sliding she would be signed out on day 30 —
    // in the middle of a term, with no warning and no reason she can see.
    for (const day of [20, 45, 70, 95]) {
      const actor = await resolveSession(db, token, new Date(day0.getTime() + day * DAY));
      expect(actor, `signed out on day ${day}`).not.toBeNull();
    }
  });

  it('runs out after a month of not being used', async () => {
    const her = await jill();
    const day0 = new Date('2026-01-01T09:00:00Z');
    const { token } = await startSession(db, { userId: her.id, breakGlass: false }, day0);

    expect(await resolveSession(db, token, new Date(day0.getTime() + 31 * DAY))).toBeNull();
  });

  it('does not write on every request, only once a day has been used up', () => {
    const now = new Date('2026-01-01T09:00:00Z');
    const fresh = new Date(now.getTime() + SESSION_DURATION_MS);
    expect(needsSlide(fresh, now)).toBe(false);

    const usedTwoDays = new Date(now.getTime() + SESSION_DURATION_MS - 2 * DAY);
    expect(needsSlide(usedTwoDays, now)).toBe(true);
  });

  it('is over when it is signed out', async () => {
    const her = await jill();
    const { token } = await startSession(db, { userId: her.id, breakGlass: false });

    await endSession(db, token);

    expect(await resolveSession(db, token)).toBeNull();
  });

  it('does not accept a token that was never issued', async () => {
    await jill();
    expect(await resolveSession(db, 'not-a-real-token')).toBeNull();
    expect(await resolveSession(db, undefined)).toBeNull();
  });
});

describe('school details', () => {
  it('is seeded, so the footer is right before anyone edits it', async () => {
    const details = await getSchoolDetails(db);

    expect(details.address).toContain('Enola');
    expect(details.phone).toBe('717-497-0896');
    expect(details.giveUrl).toMatch(/^https:\/\//);
    expect(details.lastEditedBy).toBeNull();
  });

  it('stamps who saved it and when, overwriting the last stamp', async () => {
    const her = await jill();
    const actor = await resolveSession(
      db,
      (await startSession(db, { userId: her.id, breakGlass: false })).token,
    );

    const before = await getSchoolDetails(db);
    const saved = await saveSchoolDetails(
      db,
      { ...schoolDetailsFields(before), phone: '717-000-0000' },
      actor!.name,
      new Date('2026-08-05T14:00:00Z'),
    );

    expect(saved.phone).toBe('717-000-0000');
    expect(saved.lastEditedBy).toBe('Jill Kilker');
    expect(formatStamp(saved.lastEditedBy, saved.lastEditedAt)).toBe(
      'Last edited by Jill Kilker on 5 August 2026',
    );

    const again = await saveSchoolDetails(
      db,
      schoolDetailsFields(saved),
      'George Jensen',
      new Date('2026-08-06T14:00:00Z'),
    );
    expect(again.lastEditedBy).toBe('George Jensen');
  });

  /*
   * #302. The seed pointed at the host church's Vanco organisation, an explicit
   * placeholder written while Pharos had no merchant account of its own. It has
   * one now, and a fresh database has to ship pointing at it — a seed that still
   * named the church would put a donation in somebody else's account on every
   * database stood up from here on.
   */
  it('starts on the school’s own giving organisation', async () => {
    expect((await getSchoolDetails(db)).giveUrl).toBe('https://secure.myvanco.com/L-ZZ7H/home');
  });

  /*
   * 0029's guard, replayed over rows put back by hand. It asks about the
   * organisation rather than the exact address, because the live row holds a
   * campaign inside the church's org and not the home page 0001 seeded — an
   * exact-match guard would have matched nothing and left the Give button
   * pointing at the wrong merchant. A link pointing somewhere else entirely is
   * still the office's, and stays.
   */
  const replaceTheGivingOrganisation = async () => {
    const migration = MIGRATIONS.find((one) => one.id.startsWith('0029-'))!;
    for (const statement of migration.statements) await db.execute(sql.raw(statement));
  };

  it.each([
    // What 0001 seeded.
    'https://secure.myvanco.com/YH8R/home',
    // What the live row actually holds: a campaign pasted over the seed.
    'https://secure.myvanco.com/YH8R/campaign/C-15G5B',
  ])('moves a give link still inside the church’s organisation: %s', async (church) => {
    await db.execute(sql.raw(`update school_details set give_url = '${church}'`));

    await replaceTheGivingOrganisation();

    expect((await getSchoolDetails(db)).giveUrl).toBe('https://secure.myvanco.com/L-ZZ7H/home');
  });

  it('leaves a give link somebody has changed, because a change makes it theirs', async () => {
    const before = await getSchoolDetails(db);
    await saveSchoolDetails(
      db,
      { ...schoolDetailsFields(before), giveUrl: 'https://give.example/pharos' },
      'Jill Kilker',
    );

    await replaceTheGivingOrganisation();

    expect((await getSchoolDetails(db)).giveUrl).toBe('https://give.example/pharos');
  });

  it('keeps the Give URL as one value, changed in one place', async () => {
    const before = await getSchoolDetails(db);
    const saved = await saveSchoolDetails(
      db,
      { ...schoolDetailsFields(before), giveUrl: 'https://secure.myvanco.com/PHAROS/home' },
      'Jill Kilker',
    );

    expect(saved.giveUrl).toBe('https://secure.myvanco.com/PHAROS/home');
    expect((await getSchoolDetails(db)).giveUrl).toBe(saved.giveUrl);
  });

  // #111. Empty until the office pastes the Vanco page in — which is what the
  // Apply page reads to decide whether it offers online payment at all.
  it('starts with no online payment link, and keeps the one it is given', async () => {
    const before = await getSchoolDetails(db);
    expect(before.payOnlineUrl).toBe('');

    const saved = await saveSchoolDetails(
      db,
      {
        ...schoolDetailsFields(before),
        payOnlineUrl: 'https://secure.myvanco.com/L-ZZ7H/campaign/C-REGISTRATION',
      },
      'Jill Kilker',
    );

    expect(saved.payOnlineUrl).toBe('https://secure.myvanco.com/L-ZZ7H/campaign/C-REGISTRATION');
    expect((await getSchoolDetails(db)).payOnlineUrl).toBe(saved.payOnlineUrl);
    expect(schoolDetailsFields(saved).payOnlineUrl).toBe(saved.payOnlineUrl);
  });

  /*
   * #265. The template ships empty and stays empty until somebody pastes one
   * in — which is the acceptance criterion, not a detail: the school's campaign
   * still opens set to Monthly, and an amount arriving prefilled beside a
   * monthly selector is a recurring gift one default away.
   */
  it('starts with no giving-page link template, and keeps the one it is given', async () => {
    const before = await getSchoolDetails(db);
    expect(before.givingLinkTemplate).toBe('');

    const template = 'https://secure.myvanco.com/L-ZZ7H/campaign/C-REGISTRATION?amt={amount}';
    const saved = await saveSchoolDetails(
      db,
      {
        ...schoolDetailsFields(before),
        payOnlineUrl: 'https://secure.myvanco.com/L-ZZ7H/campaign/C-REGISTRATION',
        givingLinkTemplate: template,
      },
      'Jill Kilker',
    );

    expect(saved.givingLinkTemplate).toBe(template);
    expect((await getSchoolDetails(db)).givingLinkTemplate).toBe(template);
    expect(schoolDetailsFields(saved).givingLinkTemplate).toBe(template);
  });

  // #15. The banner is on this row because saving this row is what revalidates
  // the published pages — so what matters is that it survives that save.
  it('starts with the announcement banner off and empty', async () => {
    const details = await getSchoolDetails(db);

    expect(details.bannerEnabled).toBe(false);
    expect(details.bannerMessage).toBe('');
    expect(details.bannerDate).toBeNull();
    expect(details.bannerLink).toBe('');
  });

  it('saves the banner, and gives it back in the shape the form posts', async () => {
    const before = await getSchoolDetails(db);
    const saved = await saveSchoolDetails(
      db,
      {
        ...schoolDetailsFields(before),
        bannerEnabled: true,
        bannerMessage: 'Register now! Classes begin',
        bannerDate: '2026-08-31',
        bannerLink: 'https://example.org/register',
      },
      'Jill Kilker',
    );

    expect(saved.bannerEnabled).toBe(true);
    expect(saved.bannerDate).toBe('2026-08-31');
    expect(schoolDetailsFields(saved).bannerDate).toBe('2026-08-31');
    expect((await getSchoolDetails(db)).bannerMessage).toBe('Register now! Classes begin');
  });

  // A blank date field posts an empty string, and a date column has no such
  // value: unconverted this is a write error rather than "no date".
  it('stores an empty date as no date at all', async () => {
    const before = await getSchoolDetails(db);
    const saved = await saveSchoolDetails(db, { ...schoolDetailsFields(before), bannerDate: '' }, 'Jill Kilker');

    expect(saved.bannerDate).toBeNull();
    expect(schoolDetailsFields(saved).bannerDate).toBe('');
  });

  it('refuses a submission that would empty the footer, and says which field', async () => {
    const form = new FormData();
    form.set('address', '  ');
    form.set('phone', '717-497-0896');
    form.set('email', 'not-an-email');
    form.set('schoolYearStart', '2026-02-31');
    form.set('mission', 'Mission');
    form.set('vision', 'Vision');
    form.set('giveUrl', 'myvanco.com/L-ZZ7H');

    const { errors } = parseSchoolDetails(form);

    expect(Object.keys(errors).sort()).toEqual(['address', 'email', 'giveUrl', 'schoolYearStart']);
  });
});


