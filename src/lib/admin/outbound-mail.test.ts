import { describe, expect, it } from 'vitest';

import { MAILER_ENV_HINT, type Mailer } from '../backup/monthly.js';
import { applicationDeliveryNote, outboundMailWarning } from './outbound-mail.js';

/**
 * What the admin says about mail that did not go (#136).
 *
 * The failure this covers is the one that used to be invisible: an application
 * written down, nobody emailed, and every screen quiet about it.
 */

const MAILER: Mailer = {
  sender: async () => {},
  from: 'site@example.com',
  maxAttachmentBytes: 1,
};

describe('the standing warning', () => {
  it('names the variables that are missing, and what is still working', () => {
    const said = outboundMailWarning(undefined);

    expect(said).toContain(MAILER_ENV_HINT);
    // Recorded, not lost: a warning that read as "the website is down" would
    // have the school telling families to stop applying.
    expect(said).toContain('still being recorded');
    // And the one action that helps while the credentials are missing.
    expect(said).toMatch(/read the Applications and Inquiries screens/i);
  });

  it('says nothing at all once a mailer is configured', () => {
    expect(outboundMailWarning(MAILER)).toBeNull();
  });
});

describe('one application’s delivery note', () => {
  const row = {
    notifiedAt: new Date('2026-09-01T10:00:00Z'),
    notificationError: null,
    confirmedAt: new Date('2026-09-01T10:00:01Z'),
    confirmationError: null,
  };

  it('reads plainly when both messages went', () => {
    const note = applicationDeliveryNote(row);

    expect(note.delivered).toBe(true);
    expect(note.lines.every((line) => line.ok)).toBe(true);
  });

  it('flags an unnotified school with the reason it was not notified', () => {
    const note = applicationDeliveryNote({
      ...row,
      notifiedAt: null,
      notificationError: `No mailer is configured on this deployment (${MAILER_ENV_HINT}).`,
    });

    expect(note.delivered).toBe(false);
    expect(note.lines[0].ok).toBe(false);
    expect(note.lines[0].text).toContain('Nobody at the school was emailed');
    expect(note.lines[0].text).toContain(MAILER_ENV_HINT);
  });

  it('flags a family who was never written to, which is the quiet failure', () => {
    const note = applicationDeliveryNote({
      ...row,
      confirmedAt: null,
      confirmationError: 'okonkwo@example.com: Resend refused the email (422)',
    });

    expect(note.delivered).toBe(false);
    // The school was told, so that line is not a failure — the screen marks the
    // half that failed rather than the block it is in.
    expect(note.lines[0].ok).toBe(true);
    expect(note.lines[1].ok).toBe(false);
    expect(note.lines[1].text).toContain('The family was not emailed');
    expect(note.lines[1].text).toContain('422');
  });

  it('says both failed when nothing was configured at all', () => {
    const note = applicationDeliveryNote({
      notifiedAt: null,
      notificationError: 'No mailer is configured on this deployment.',
      confirmedAt: null,
      confirmationError: 'No mailer is configured on this deployment.',
    });

    expect(note.delivered).toBe(false);
    expect(note.lines.filter((line) => !line.ok)).toHaveLength(2);
  });

  it('claims nothing about a row from before these columns existed', () => {
    // Four nulls is not a failure anybody observed — it is an application from
    // before the site kept the record, and saying "nobody was emailed" about it
    // would be inventing a failure.
    const note = applicationDeliveryNote({
      notifiedAt: null,
      notificationError: null,
      confirmedAt: null,
      confirmationError: null,
    });

    expect(note.delivered).toBe(false);
    expect(note.lines).toHaveLength(1);
    expect(note.lines[0].text).toContain('no record');
    expect(note.lines[0].text).not.toContain('Nobody at the school');
  });
});
