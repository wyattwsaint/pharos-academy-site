import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkDumpSize, MINIMUM_DUMP_BYTES } from './dump-size.js';

/**
 * The acceptance criterion "the sanity check fails the job on a suspiciously
 * small dump (verify by forcing one)" (#33).
 *
 * Forced two ways. The unit cases force the *decision* with a size; the last
 * case forces the *job step* by running the very command the workflow runs, on
 * a file that is genuinely too small, and asserting a non-zero exit. The second
 * is the one that matters — a check that returns `{ ok: false }` and still
 * exits 0 is a green tick over a failed dump, which is precisely the failure
 * this criterion exists to rule out.
 */

describe('checkDumpSize', () => {
  it('passes a dump the size a real one is', () => {
    // The mirror's PDFs alone are 3.0 MB, so a healthy dump of this database is
    // megabytes. The threshold is nowhere near it, on purpose.
    expect(checkDumpSize(4_000_000).ok).toBe(true);
  });

  it('fails a dump of an empty or half-written database', () => {
    const verdict = checkDumpSize(6 * 1024);

    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('suspiciously small');
  });

  it('fails at the threshold rather than passing on the boundary', () => {
    expect(checkDumpSize(MINIMUM_DUMP_BYTES - 1).ok).toBe(false);
    expect(checkDumpSize(MINIMUM_DUMP_BYTES).ok).toBe(true);
  });

  it('fails rather than passes when the size could not be read at all', () => {
    expect(checkDumpSize(Number.NaN).ok).toBe(false);
    expect(checkDumpSize(-1).ok).toBe(false);
  });
});

describe('the workflow step', () => {
  /** Exactly what `.github/workflows/db-backup.yml` runs, argument for argument. */
  const command = ['--import', './scripts/ts-resolve.mjs', 'scripts/check-dump-size.mjs'];

  it('exits non-zero on a forced small dump, which is what fails the job', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pharos-dump-')), 'backup.dump');
    writeFileSync(path, Buffer.alloc(512));

    let status: number | undefined;
    let stderr = '';
    try {
      execFileSync(process.execPath, [...command, path], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      status = failure.status;
      stderr = failure.stderr ?? '';
    }

    expect(status).not.toBe(0);
    expect(status).toBeDefined();
    // GitHub's own annotation form, so the failure is a red line in the log and
    // not a sentence somebody has to scroll to.
    expect(stderr).toContain('::error::');
    expect(stderr).toContain('suspiciously small');
  });

  it('exits zero on a dump that is plainly a dump', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pharos-dump-')), 'backup.dump');
    writeFileSync(path, Buffer.alloc(MINIMUM_DUMP_BYTES + 1));

    const out = execFileSync(process.execPath, [...command, path], { encoding: 'utf8' });

    expect(out).toContain('Dump size');
  });

  it('exits non-zero when the dump was never written', () => {
    let status: number | undefined;
    try {
      execFileSync(process.execPath, [...command, 'no-such-file.dump'], { stdio: 'pipe' });
    } catch (error) {
      status = (error as { status?: number }).status;
    }

    expect(status).not.toBe(0);
  });
});
