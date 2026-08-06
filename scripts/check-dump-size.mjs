#!/usr/bin/env node
/**
 * Fail the nightly backup job when the dump is suspiciously small.
 *
 * The house pattern's sanity check (`legacy-roofing-site`), moved out of the
 * workflow's shell so that the one part of the operator backup nobody would
 * notice going wrong has a test — see `src/lib/backup/dump-size.ts` for why,
 * and `dump-size.test.ts` for the forced small dump.
 *
 * Run as `node --import ./scripts/ts-resolve.mjs scripts/check-dump-size.mjs <file>`.
 * Exits 0 when the dump is plausible, 1 when it is not, and prints GitHub's
 * `::error::` annotation on the way out so the failure is a red line in the log.
 */
import { statSync } from 'node:fs';

import { checkDumpSize } from '../src/lib/backup/dump-size.ts';

const path = process.argv[2];
if (!path) {
  fail('No dump file given. Usage: check-dump-size.mjs <file>');
}

let size;
try {
  size = statSync(path).size;
} catch (error) {
  fail(`Could not stat "${path}": ${error.message}. The dump step did not produce a file.`);
}

const verdict = checkDumpSize(size);
if (!verdict.ok) fail(verdict.message);

console.log(verdict.message);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
