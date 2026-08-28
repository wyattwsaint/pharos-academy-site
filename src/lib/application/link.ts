import { APPLICATION_PATH } from './application.js';

/**
 * The application link — the pre-filled form, and how long it opens for
 * (#317, [ADR-0025](../../../docs/adr/0025-the-application-link-is-a-bearer-link-with-a-life.md)).
 *
 * `/admissions/apply?inquiry=<id>` has two senders — the confirmation every
 * inquirer is emailed, and the admin's inquiries screen, where Jill copies it
 * into a reply — and one rule between them. This module is that rule, and it is
 * its own file for the reason the rule exists: a link the school pastes and a
 * link the family was sent must obey the same clock, so neither sender may own
 * the window.
 *
 * It sits under `application/` rather than `inquiry/` because what it builds
 * and bounds is an address on the application flow; the inquiry is only what
 * fills the form in. It is deliberately free of the database, so the admin
 * screen and the confirmation builder can both read it.
 */

/**
 * How long the pre-filled application link works for.
 *
 * A named constant rather than a literal at the comparison, because the number
 * is the school's and the design is the code's: shortening the window should be
 * one edit and one test, and reopening the ADR should be reserved for changing
 * the *shape* — removing the expiry, making the link single-use, or letting the
 * two senders diverge.
 */
export const APPLICATION_LINK_DAYS = 90;

/**
 * Whether the link built from an inquiry received at `receivedAt` still opens.
 *
 * Computed from the timestamp the row already carries — no column, no
 * migration, no backfill. The clock is a parameter so both sides of the
 * boundary are testable without manufacturing an old row and waiting, which is
 * also how the admin screen renders a whole list against one instant.
 */
export function applicationLinkIsLive(receivedAt: Date, now: Date = new Date()): boolean {
  const life = APPLICATION_LINK_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - receivedAt.getTime() <= life;
}

/**
 * The application link a family or the school is given, for one inquiry.
 *
 * With the id when there is one, bare when there is not — a confirmation sent
 * after a failed write has no id to carry, and the family gets a blank form
 * rather than a sentence about our database (#317 AC 2).
 */
export function applicationLink(inquiryId?: string): string {
  return inquiryId ? `${APPLICATION_PATH}?inquiry=${inquiryId}` : APPLICATION_PATH;
}
