import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The operator half of the backup, asserted against the file that is the whole
 * of it (#33).
 *
 * There is no unit to test here — the nightly dump is a GitHub Actions workflow
 * — but there are four facts that, if any one of them quietly changed, would
 * leave a school with a backup nobody could retrieve and nobody would notice:
 * that it runs on a schedule at all, that it uploads an artifact, that the
 * artifact is kept long enough to be useful, and that the sanity check stands
 * between the dump and the upload rather than after it.
 *
 * The last is the subtle one. A sanity check placed after the upload still goes
 * red, but ninety days of artifacts include the bad one, and the person
 * restoring in a hurry picks the newest.
 */

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/db-backup.yml', import.meta.url)),
  'utf8',
);

describe('the nightly dump workflow', () => {
  it('runs on a schedule, and nightly', () => {
    expect(WORKFLOW).toMatch(/schedule:/);
    // Five fields with a fixed hour and no day restriction: every night.
    const cron = WORKFLOW.match(/cron:\s*'([^']+)'/)?.[1];
    expect(cron).toBeDefined();
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cron!.split(/\s+/);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(['*', '*', '*']);
  });

  it('can also be run by hand, which is what a restore drill needs', () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it('uploads the dump as a retrievable artifact, and keeps it', () => {
    expect(WORKFLOW).toMatch(/actions\/upload-artifact@v4/);
    expect(WORKFLOW).toMatch(/if-no-files-found:\s*error/);
    const retention = Number(WORKFLOW.match(/retention-days:\s*(\d+)/)?.[1]);
    // Neon Free retains six hours of history, so the artifact is the real
    // backup. A fortnight of them is not a backup a school can lean on.
    expect(retention).toBeGreaterThanOrEqual(90);
  });

  it('sanity-checks the dump before it uploads it, not after', () => {
    const check = WORKFLOW.indexOf('check-dump-size.mjs');
    const upload = WORKFLOW.indexOf('upload-artifact');
    expect(check).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(-1);
    expect(check).toBeLessThan(upload);
  });

  it('takes the connection string from a secret and never echoes it', () => {
    expect(WORKFLOW).toMatch(/DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/);
    // `pg_dump "$DATABASE_URL"` is fine; an `echo` of it is a password in a log
    // that anyone with read access to the repo keeps forever.
    expect(WORKFLOW).not.toMatch(/echo.*\$DATABASE_URL/);
  });
});
