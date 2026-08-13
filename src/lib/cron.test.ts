import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { cronResponse, isAuthorisedCron } from './cron.js';

/**
 * The guard both scheduled routes carry (#33, #153).
 *
 * The monthly backup mails the school's whole content and the nightly calendar
 * read writes to the database, and neither is behind the admin's session guard:
 * a scheduler has no session. So this is the only thing between either of them
 * and the public internet, and it is tested here rather than in either route.
 */

describe('the cron endpoint’s guard', () => {
  const secret = 'a-long-scheduler-secret-value';

  function request(header?: string): Request {
    return new Request('https://example.test/api/cron/monthly-backup', {
      headers: header ? { authorization: header } : {},
    });
  }

  it('lets the scheduler through', () => {
    expect(isAuthorisedCron(request(`Bearer ${secret}`), secret)).toBe(true);
  });

  it('refuses a wrong token, a missing header, and a token of the wrong length', () => {
    expect(isAuthorisedCron(request('Bearer nope'), secret)).toBe(false);
    expect(isAuthorisedCron(request(), secret)).toBe(false);
    expect(isAuthorisedCron(request(`Bearer ${secret}x`), secret)).toBe(false);
  });

  /*
   * The dangerous default. An unset `CRON_SECRET` compared against an unset
   * header is two empty strings, which is equal — and the endpoint that mails
   * the school's whole content to anyone who asks would be open on the public
   * internet.
   */
  it('refuses everybody when no secret is configured, rather than everybody through', () => {
    expect(isAuthorisedCron(request('Bearer '), '')).toBe(false);
    expect(isAuthorisedCron(request(), '')).toBe(false);
    expect(isAuthorisedCron(request('Bearer   '), '   ')).toBe(false);
  });
});

describe('what a scheduled route answers with', () => {
  it('is a line of plain English and the status that goes with it', async () => {
    const response = cronResponse('Nothing was written.', 500);

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('text/plain');
    // Newline-terminated: this is read in a log, beside other lines.
    expect(await response.text()).toBe('Nothing was written.\n');
  });
});

/**
 * Every scheduled route, held against the two files that decide whether it runs
 * at all.
 *
 * Written over the whole family rather than route by route, because the failure
 * both of these catch is silent: a cron declared with no ISR exclusion is a GET
 * served from an hour-old cache, which is a 200 in the Vercel log and an effect
 * that never happened. A third cron added without either line would be green and
 * doing nothing, and nobody would look until the school asked why.
 */
describe('the scheduled routes', () => {
  const read = (path: string) =>
    readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

  const VERCEL = JSON.parse(read('../../vercel.json')) as {
    crons?: { path: string; schedule: string }[];
  };

  it('declares both of them, on the hours they were chosen for', () => {
    const paths = (VERCEL.crons ?? []).map((cron) => cron.path);
    expect(paths).toContain('/api/cron/monthly-backup');
    expect(paths).toContain('/api/cron/calendar-sync');

    // Daily, and early: 09:00 UTC is five in the morning in Enola, so an
    // evening's change to the school's Google calendar is up before anyone
    // looks. Hourly was rejected — the calendar page already promises families
    // that a subscribed calendar is hours behind (#153).
    const calendar = VERCEL.crons!.find((cron) => cron.path.includes('calendar-sync'))!;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = calendar.schedule.split(/\s+/);
    expect([minute, hour]).toEqual(['0', '9']);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(['*', '*', '*']);
  });

  it('keeps every one of them out of the ISR cache', () => {
    const exclude = read('../../astro.config.mjs').match(/exclude:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const excluded = (path: string) =>
      exclude.includes(`'${path}'`) ||
      [...exclude.matchAll(/\/(\^[^,\]]*?)\/(?=[,\]\s])/g)].some(([, source]) =>
        new RegExp(source).test(path),
      );

    for (const cron of VERCEL.crons ?? []) {
      expect(excluded(cron.path), cron.path).toBe(true);
    }
  });
});
