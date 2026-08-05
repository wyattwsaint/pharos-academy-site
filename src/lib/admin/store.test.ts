import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { attemptLogin } from './login.js';
import { matchesBreakGlass } from './passwords.js';
import {
  formatStamp,
  getSchoolDetails,
  parseSchoolDetails,
  saveSchoolDetails,
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
      { ...fields(before), phone: '717-000-0000' },
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
      fields(saved),
      'George Jensen',
      new Date('2026-08-06T14:00:00Z'),
    );
    expect(again.lastEditedBy).toBe('George Jensen');
  });

  it('keeps the Give URL as one value, changed in one place', async () => {
    const before = await getSchoolDetails(db);
    const saved = await saveSchoolDetails(
      db,
      { ...fields(before), giveUrl: 'https://secure.myvanco.com/PHAROS/home' },
      'Jill Kilker',
    );

    expect(saved.giveUrl).toBe('https://secure.myvanco.com/PHAROS/home');
    expect((await getSchoolDetails(db)).giveUrl).toBe(saved.giveUrl);
  });

  it('refuses a submission that would empty the footer, and says which field', async () => {
    const form = new FormData();
    form.set('address', '  ');
    form.set('phone', '717-497-0896');
    form.set('email', 'not-an-email');
    form.set('schoolYearStart', '2026-02-31');
    form.set('mission', 'Mission');
    form.set('vision', 'Vision');
    form.set('giveUrl', 'myvanco.com/YH8R');

    const { errors } = parseSchoolDetails(form);

    expect(Object.keys(errors).sort()).toEqual(['address', 'email', 'giveUrl', 'schoolYearStart']);
  });
});

function fields(details: Awaited<ReturnType<typeof getSchoolDetails>>) {
  return {
    address: details.address,
    phone: details.phone,
    email: details.email,
    schoolYearStart: details.schoolYearStart,
    mission: details.mission,
    vision: details.vision,
    giveUrl: details.giveUrl,
  };
}
