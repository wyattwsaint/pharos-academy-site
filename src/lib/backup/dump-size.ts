/**
 * The sanity check on the nightly `pg_dump` (#33, spec #18 §14).
 *
 * The house pattern in `legacy-roofing-site` runs this as four lines of shell
 * inside the workflow. Here it is a module with a test, for one reason: the
 * check is the only part of the operator backup that can be wrong in a way
 * nobody notices. A dump that fails loudly is a page in the Actions log; a
 * dump that succeeds at 6 KB is ninety days of green ticks over an empty file,
 * and the school finds out at the moment it needs the file. Shell that is only
 * ever exercised by the thing it is guarding is not exercised.
 *
 * **The threshold is a floor, not an estimate.** It is deliberately far below
 * the real dump — this database carries policy PDFs as `bytea`, so a healthy
 * dump is megabytes — because the failure being caught is *catastrophic*: a
 * dump of an empty database, of the wrong database, or of a connection that
 * refused halfway. A threshold tuned close to the real size would fail the job
 * on an ordinary quiet month.
 */

/** Below this, a dump is not a small backup — it is a failed one. */
export const MINIMUM_DUMP_BYTES = 10 * 1024;

export type DumpVerdict =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Is this dump plausibly a dump?
 *
 * Takes the size rather than a path, so the decision is testable without a
 * filesystem and the reading of the file stays in the one place that has one.
 */
export function checkDumpSize(bytes: number, minimum = MINIMUM_DUMP_BYTES): DumpVerdict {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ok: false, message: `Could not read the dump's size (got ${bytes}).` };
  }

  if (bytes < minimum) {
    return {
      ok: false,
      message: `Backup file is suspiciously small (${bytes} bytes < ${minimum} bytes) — treating as a failed dump.`,
    };
  }

  return { ok: true, message: `Dump size: ${bytes} bytes.` };
}
