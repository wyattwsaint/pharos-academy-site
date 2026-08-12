/**
 * What the admin says about mail that did not go (#136).
 *
 * Two sentences the school reads, and neither of them is a log line:
 *
 * - **the standing warning**, on every admin screen for as long as the
 *   deployment has no mail credentials, because an unconfigured mailer is not an
 *   event that happened once — it is a state the site is in, and a state that
 *   makes every form on the site silent;
 * - **the delivery note on one application**, which says which of the two
 *   messages went and, when one did not, why.
 *
 * Both are pure functions of what is already known — the resolved mailer, and
 * the four columns the row already carries — so the tests beside them assert the
 * words Jill reads rather than that a screen rendered.
 */

import { NO_MAILER_CONFIGURED, type Mailer } from '../backup/monthly.js';

/**
 * The standing warning, or null when mail is configured.
 *
 * It says what is still working before it says what is not: the applications
 * *are* being recorded, and a warning that read as "the website is broken" would
 * have Jill telling families to stop applying. What it asks for is the one
 * action that actually helps while the credentials are missing — read the two
 * screens, because they are the only place the applications now exist.
 *
 * The reason is `NO_MAILER_CONFIGURED`, the same sentence stamped on the rows,
 * so the banner and the row it explains cannot drift apart.
 */
export function outboundMailWarning(mailer: Mailer | undefined): string | null {
  if (mailer) return null;
  return (
    `${NO_MAILER_CONFIGURED} Applications and inquiries are still being recorded and are all ` +
    'on the screens below — but nobody is being emailed about them, neither the school nor the ' +
    'family. Until this is fixed, read the Applications and Inquiries screens yourself: they are ' +
    'the only notice anybody gets.'
  );
}

/** The four columns a row already carries about its two sends. */
export type ApplicationDeliveryRow = {
  notifiedAt: Date | null;
  notificationError: string | null;
  confirmedAt: Date | null;
  confirmationError: string | null;
};

/** What became of one application's two emails, as the screen reads it. */
export type DeliveryNote = {
  /** True only when **both** went. Anything less is a flag on the row. */
  delivered: boolean;
  /**
   * One line per message, in the order they were attempted.
   *
   * `ok` rather than a warning glyph inside the sentence, so the screen marks
   * the line that failed rather than the block it is in: on an application whose
   * notification went and whose confirmation did not, bolding both lines would
   * point Jill at the half that worked.
   */
  lines: readonly { ok: boolean; text: string }[];
};

/**
 * Which of the two messages went, and why the other did not.
 *
 * Both lines always, in both directions. A row that simply said nothing about
 * the family's own copy would read as "sent" — and the whole reason these
 * columns exist is that a family who was never written to believes they applied
 * and the school believes they were told.
 *
 * The failure carries its reason inline rather than behind anything to click,
 * because the reason is the difference between "Resend refused this address"
 * (fix the address) and "no mailer is configured" (fix the deployment), and a
 * warning whose cause is one click away is a warning read as noise.
 *
 * A row with **nothing recorded either way** is the one case that is not two
 * lines: an application submitted before the site kept this record has four null
 * columns, and saying "nobody was emailed" about it would be asserting a failure
 * this function cannot know happened.
 */
export function applicationDeliveryNote(row: ApplicationDeliveryRow): DeliveryNote {
  if (unrecorded(row)) {
    return {
      delivered: false,
      lines: [
        {
          ok: false,
          text:
            'There is no record of what happened to this one’s emails — it was submitted before ' +
            'the site kept that record.',
        },
      ],
    };
  }

  return {
    delivered: Boolean(row.notifiedAt && row.confirmedAt),
    lines: [
      row.notifiedAt
        ? { ok: true, text: 'Emailed to the school.' }
        : failure(
            'Nobody at the school was emailed about this one — it is only here.',
            row.notificationError,
          ),
      row.confirmedAt
        ? { ok: true, text: 'The family was emailed their own copy.' }
        : failure(
            'The family was not emailed, so they have only what the screen told them.',
            row.confirmationError,
          ),
    ],
  };
}

/** Nothing stamped and nothing blamed — a row from before the columns existed. */
function unrecorded(row: ApplicationDeliveryRow): boolean {
  return (
    !row.notifiedAt && !row.notificationError && !row.confirmedAt && !row.confirmationError
  );
}

/** A failure with its reason, where there is one to give. */
function failure(said: string, error: string | null): { ok: false; text: string } {
  return { ok: false, text: error ? `${said} (${error})` : said };
}
