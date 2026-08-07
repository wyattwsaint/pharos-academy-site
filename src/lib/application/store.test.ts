import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { recordAgreedTerms } from '../money/store.js';
import {
  faithKey,
  statementVersion,
  type ApplicationFields,
} from './application.js';
import { CHEQUE_GRACE_DAYS, paymentStatusNow } from './lifecycle.js';
import {
  createApplication,
  getApplication,
  listApplications,
  moveApplication,
  moveApplicationPayment,
  recordApplicationDelivery,
} from './store.js';

/**
 * The application against real Postgres (#31 AC 6).
 *
 * The pure half is `application.test.ts`. What needs a database is the half AC 6
 * is actually about: an objection is *recorded* — with the version of the
 * Statement the family was shown — rather than merely tolerated by the parser.
 * A flag that never reaches a row is a flag nobody acts on.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

function fields(overrides: Partial<ApplicationFields> = {}): ApplicationFields {
  return {
    familyName: 'Marsh',
    email: 'ruth@example.com',
    children: [
      { name: 'Obi', age: '9', offeringKeys: ['algebra-1:year'] },
      { name: 'Ada', age: '13', offeringKeys: [] },
    ],
    faith: {
      [faithKey('Father', 'read')]: 'yes',
      [faithKey('Mother', 'agree')]: 'no',
    },
    objections: '',
    ...overrides,
  };
}

describe('an application', () => {
  it('persists the family, the children and the classes they chose', async () => {
    await createApplication(db, fields(), { statementVersion: statementVersion() });

    const [row] = await listApplications(db);
    expect(row).toBeDefined();
    expect(row!.familyName).toBe('Marsh');
    expect(row!.email).toBe('ruth@example.com');
    expect(row!.children.map((child) => child.name)).toEqual(['Obi', 'Ada']);
    expect(row!.children[0]!.offeringKeys).toEqual(['algebra-1:year']);
    // A child chosen for nothing yet is still a child on the application.
    expect(row!.children[1]!.offeringKeys).toEqual([]);
  });

  it('records an objection with the version of the Statement shown', async () => {
    // AC 6. The objection is the reason the school wants to talk to this
    // family, so the row has to hold the words *and* what they were objecting
    // to — a later revision must not silently reinterpret their agreement.
    await createApplication(
      db,
      fields({ objections: 'Article 9, on baptism.' }),
      { statementVersion: 'sof-deadbeef', flagged: true },
    );

    const [row] = await listApplications(db);
    expect(row!.objections).toBe('Article 9, on baptism.');
    expect(row!.statementVersion).toBe('sof-deadbeef');
    expect(row!.flagged).toBe(true);
  });

  it('keeps who answered what, and leaves an unanswered cell unanswered', async () => {
    await createApplication(db, fields(), { statementVersion: statementVersion() });

    const [row] = await listApplications(db);
    expect(row!.faith[faithKey('Father', 'read')]).toBe('yes');
    expect(row!.faith[faithKey('Mother', 'agree')]).toBe('no');
    // A household with no legal guardian left that column alone; the row says
    // so rather than saying "no".
    expect(row!.faith[faithKey('Legal guardian', 'agree')]).toBeUndefined();
  });

  it('points at the money terms frozen for that family', async () => {
    const terms = await recordAgreedTerms(db, 'Marsh', SEEDED_MONEY_SETTINGS);
    await createApplication(db, fields(), {
      statementVersion: statementVersion(),
      agreedTermsId: terms.id,
    });

    const [row] = await listApplications(db);
    expect(row!.agreedTermsId).toBe(terms.id);
  });

  it('reads newest first, the way the inquiries do', async () => {
    const older = new Date('2026-08-01T10:00:00Z');
    const newer = new Date('2026-08-02T10:00:00Z');
    await createApplication(db, fields({ familyName: 'Older' }), { statementVersion: 'v' }, older);
    await createApplication(db, fields({ familyName: 'Newer' }), { statementVersion: 'v' }, newer);

    expect((await listApplications(db)).map((row) => row.familyName)).toEqual(['Newer', 'Older']);
  });

  it('stores no date of birth, address, medical or custody column', async () => {
    // AC 9 at the storage layer. The type test in `application.test.ts` guards
    // the shape; this guards the table, because a column is what a later form
    // field would be added to fill.
    await createApplication(db, fields(), { statementVersion: statementVersion() });

    const columns = await db.execute(
      `select column_name from information_schema.columns
       where table_name in ('applications', 'application_children')`,
    );
    const names = (columns.rows as { column_name: string }[]).map((row) => row.column_name);

    for (const forbidden of ['dob', 'birth', 'address', 'street', 'zip', 'allerg', 'medical', 'diagnos', 'custody', 'iep', 'adhd', 'evaluation']) {
      expect(names.filter((name) => name.includes(forbidden))).toEqual([]);
    }
  });
});

/**
 * The two axes against real Postgres (#32 AC 2, AC 3).
 *
 * `lifecycle.test.ts` has the rules; this is the wiring, which is where the
 * criterion can actually be broken — a writer that set both column groups, or a
 * reader that folded them into one word, would pass every pure test and lose
 * the distinction on the way to the table.
 */
describe('applied and paid', () => {
  const days = (from: Date, count: number): Date =>
    new Date(from.getTime() + count * 24 * 60 * 60 * 1000);

  async function submitted(now = new Date('2026-08-01T10:00:00Z')): Promise<string> {
    return createApplication(db, fields(), { statementVersion: statementVersion() }, now);
  }

  it('opens submitted, awaiting a cheque', async () => {
    const id = await submitted();
    const row = await getApplication(db, id);

    expect(row!.state).toBe('submitted');
    expect(row!.payment.mode).toBe('cheque');
    expect(row!.payment.status).toBe('awaiting');
  });

  it('changing the payment never changes the application state (AC 2)', async () => {
    const id = await submitted();

    await moveApplicationPayment(db, id, 'receive', new Date('2026-08-09T10:00:00Z'));

    const row = await getApplication(db, id);
    expect(row!.payment.status).toBe('received');
    expect(row!.state).toBe('submitted');
  });

  it('changing the application state never changes the payment (AC 2)', async () => {
    const id = await submitted();
    const before = (await getApplication(db, id))!.payment;

    await moveApplication(db, id, 'discuss');
    await moveApplication(db, id, 'enrol');

    const row = await getApplication(db, id);
    expect(row!.state).toBe('enrolled');
    // Enrolled and still owing: the school enrols on a conversation, and the
    // cheque arrives when it arrives.
    expect(row!.payment).toEqual(before);
  });

  it('refuses a move the application cannot make, and leaves the row alone', async () => {
    const id = await submitted();
    await moveApplication(db, id, 'withdraw');

    expect(await moveApplication(db, id, 'enrol')).toBeNull();
    expect((await getApplication(db, id))!.state).toBe('withdrawn');
  });

  it('goes overdue on the clock, with nothing written and nobody acting (AC 3)', async () => {
    const applied = new Date('2026-08-01T10:00:00Z');
    const id = await submitted(applied);

    const row = await getApplication(db, id);
    // The stored word never says overdue — the row is unchanged since the
    // submission, and the grace period is what makes it late.
    expect(row!.payment.status).toBe('awaiting');
    expect(paymentStatusNow(row!.payment, days(applied, CHEQUE_GRACE_DAYS - 1))).toBe('awaiting');
    expect(paymentStatusNow(row!.payment, days(applied, CHEQUE_GRACE_DAYS + 1))).toBe('overdue');
  });

  it('records what became of the two emails, and swallows a bad id', async () => {
    const id = await submitted();
    await recordApplicationDelivery(
      db,
      id,
      { notified: true, confirmed: false, confirmationError: 'okonkwo@example.com: bounced' },
      new Date('2026-08-01T10:00:05Z'),
    );

    const row = await getApplication(db, id);
    expect(row!.notifiedAt).toEqual(new Date('2026-08-01T10:00:05Z'));
    expect(row!.confirmedAt).toBeNull();
    expect(row!.confirmationError).toContain('bounced');

    // A delivery stamp for a row that is not there must not become the error the
    // family sees; there is nothing left to save by then.
    await expect(
      recordApplicationDelivery(db, 'not-a-uuid', { notified: true, confirmed: true }),
    ).resolves.toBeUndefined();
  });
});
