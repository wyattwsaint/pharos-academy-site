import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { createInquiry, listInquiries, recordInquiryDelivery } from './store.js';
import type { InquiryFields } from './inquiry.js';

/**
 * The inquiries against real Postgres (#25 AC 2, AC 7).
 *
 * What is proved here rather than in `inquiry.test.ts` is the half that needs a
 * database: that the row survives, that it survives a refused send, and that a
 * refused send is *visible* on the row afterwards — which is what makes the
 * admin screen able to say "nobody was emailed about this one".
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

const FIELDS: InquiryFields = {
  name: 'Ruth Marsh',
  email: 'ruth@example.com',
  ages: '6, 9 and 13',
  message: 'Is there room in Latin?',
};

describe('an inquiry', () => {
  it('persists exactly what the family typed', async () => {
    await createInquiry(db, FIELDS);

    const [row] = await listInquiries(db);
    expect(row).toBeDefined();
    expect(row!.name).toBe('Ruth Marsh');
    expect(row!.email).toBe('ruth@example.com');
    expect(row!.ages).toBe('6, 9 and 13');
    expect(row!.message).toBe('Is there room in Latin?');
  });

  it('is written before anything is emailed, so a refused send cannot lose it', async () => {
    const id = await createInquiry(db, FIELDS);
    await recordInquiryDelivery(db, id, {
      notified: false,
      notificationError: 'Resend refused the email (401)',
      confirmed: false,
      confirmationError: 'Resend refused the email (401)',
    });

    const [row] = await listInquiries(db);
    expect(row!.notifiedAt).toBeNull();
    expect(row!.notificationError).toContain('401');
    // The family's words are untouched by the delivery write.
    expect(row!.ages).toBe('6, 9 and 13');
  });

  it('records when the school was told', async () => {
    const id = await createInquiry(db, FIELDS);
    await recordInquiryDelivery(db, id, { notified: true, confirmed: true });

    const [row] = await listInquiries(db);
    expect(row!.notifiedAt).toBeInstanceOf(Date);
    expect(row!.notificationError).toBeNull();
    expect(row!.confirmedAt).toBeInstanceOf(Date);
  });

  it('accepts an empty message, which is the ordinary case', async () => {
    await createInquiry(db, { ...FIELDS, message: '' });
    const [row] = await listInquiries(db);
    expect(row!.message).toBe('');
  });

  it('never throws while stamping a row that has gone, because the inquiry is already safe', async () => {
    // Bookkeeping must not turn "the notification did not send" into "the
    // parent was told their question was lost".
    await expect(
      recordInquiryDelivery(db, '00000000-0000-0000-0000-000000000000', {
        notified: true,
        confirmed: true,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('the admin list', () => {
  it('reads newest first, because it is answered rather than studied', async () => {
    const day = (iso: string) => new Date(`${iso}T09:00:00Z`);
    await createInquiry(db, { ...FIELDS, name: 'First' }, day('2026-08-01'));
    await createInquiry(db, { ...FIELDS, name: 'Second' }, day('2026-08-03'));
    await createInquiry(db, { ...FIELDS, name: 'Third' }, day('2026-08-02'));

    expect((await listInquiries(db)).map((row) => row.name)).toEqual(['Second', 'Third', 'First']);
  });

  it('is empty on a fresh database rather than seeded with an example', async () => {
    // Nobody has asked yet is a real state, and a seeded fake inquiry is a lead
    // Jill would try to answer.
    expect(await listInquiries(db)).toEqual([]);
  });
});
