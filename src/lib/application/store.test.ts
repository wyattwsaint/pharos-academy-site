import { beforeEach, describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { createEphemeralDatabase, type Db } from '../db/client.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { recordAgreedTerms } from '../money/store.js';
import {
  faithKey,
  statementVersion,
  type ApplicationFields,
} from './application.js';
import { catalogueCourses, chosenClasses } from './chosen-classes.js';
import { CHEQUE_GRACE_DAYS, paymentStatusNow } from './lifecycle.js';
import { offeringsOf } from './offerings.js';
import {
  countApplicationsForCourse,
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

const ALGEBRA = CATALOGUE.find((course) => course.slug === 'algebra-1')!;

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
    agreements: {},
    paymentMethod: 'check',
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

  it('keeps each agreement against the policy version the family was shown', async () => {
    // #71 AC 3, at the table. A later upload appends a version; this row still
    // says the Handbook was agreed to at version 5, which is the school's own
    // question — "what did the family who enrolled in August sign?"
    await createApplication(
      db,
      fields({
        agreements: {
          handbook: { answer: 'parent', version: 5 },
          'code-of-conduct': { answer: 'neither', version: 2 },
        },
      }),
      { statementVersion: statementVersion() },
    );

    const [row] = await listApplications(db);
    expect(row!.agreements.handbook).toEqual({ answer: 'parent', version: 5 });
    expect(row!.agreements['code-of-conduct']).toEqual({ answer: 'neither', version: 2 });
  });

  it('leaves an unasked or unanswered agreement absent, never "neither"', async () => {
    await createApplication(db, fields(), { statementVersion: statementVersion() });

    const [row] = await listApplications(db);
    expect(row!.agreements).toEqual({});
    expect(row!.agreements.handbook).toBeUndefined();
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
 * The classes an application was submitted with (#259).
 *
 * The freeze is the ticket: a submitted application is the record of what a
 * family sent, and neither a rename nor a removal in the catalogue afterwards
 * may change a word of it. Proved against a real table because "written once
 * and never updated" is a claim about rows.
 */
describe('the classes an application was submitted with', () => {
  const catalogue = (title: string) =>
    offeringsOf([{ ...ALGEBRA, title, enrolmentUnits: ['year'] }]);

  const classesOf = async (id: string, offerings: ReturnType<typeof catalogue>) =>
    chosenClasses((await getApplication(db, id))!.children[0]!, catalogueCourses(offerings));

  it('captures the title of each class the child chose', async () => {
    const id = await createApplication(db, fields(), {
      statementVersion: statementVersion(),
      offerings: catalogue('Algebra 1'),
    });

    const [row] = await listApplications(db);
    expect(row!.children[0]!.offeringTitles).toEqual({ 'algebra-1:year': 'Algebra 1' });
    // A child chosen for nothing has nothing to capture.
    expect(row!.children[1]!.offeringTitles).toEqual({});
    expect(id).toBeDefined();
  });

  it('survives a course rename', async () => {
    const id = await createApplication(db, fields(), {
      statementVersion: statementVersion(),
      offerings: catalogue('Algebra 1'),
    });

    // The school renames the class the next morning. The application still
    // reads as it was submitted.
    const [chosen] = await classesOf(id, catalogue('Algebra I — Foundations'));

    expect(chosen!.title).toBe('Algebra 1');
    expect(chosen!.offered).toBe(true);
  });

  it('survives the course being absent from the catalogue', async () => {
    const id = await createApplication(db, fields(), {
      statementVersion: statementVersion(),
      offerings: catalogue('Algebra 1'),
    });

    const [chosen] = await classesOf(id, []);

    expect(chosen!.title).toBe('Algebra 1');
    expect(chosen!.offered).toBe(false);
  });

  it('is not touched by any later write to the application', async () => {
    const id = await createApplication(db, fields(), {
      statementVersion: statementVersion(),
      offerings: catalogue('Algebra 1'),
    });

    await moveApplication(db, id, 'enrol');
    await moveApplicationPayment(db, id, 'receive');
    await recordApplicationDelivery(db, id, { notified: true, confirmed: true });

    const [chosen] = await classesOf(id, []);
    expect(chosen!.title).toBe('Algebra 1');
  });

  it('falls back to the slug for a row written before the capture existed', async () => {
    // Every application already in Neon. There is no honest title to recover,
    // and the fallback is deliberate rather than a backfill waiting to happen.
    const id = await createApplication(db, fields(), { statementVersion: statementVersion() });

    const [chosen] = await classesOf(id, catalogue('Algebra 1'));
    expect(chosen!.title).toBe('algebra-1');
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

  it('opens a stated-online submission awaiting too, never paid (#220 AC 1)', async () => {
    const id = await createApplication(
      db,
      fields(),
      { statementVersion: statementVersion(), paymentMode: 'online' },
      new Date('2026-08-01T10:00:00Z'),
    );
    const row = await getApplication(db, id);

    expect(row!.payment.mode).toBe('online');
    // What the family said, not a payment: the giving page told the site
    // nothing, and the office has matched nothing yet.
    expect(row!.payment.status).toBe('awaiting');
    // And the clock never turns it into a chase for an envelope (AC 2).
    expect(
      paymentStatusNow(row!.payment, days(new Date('2026-08-01T10:00:00Z'), CHEQUE_GRACE_DAYS + 1)),
    ).toBe('awaiting');
  });

  it('records the office matching a payment by hand (#220 AC 3)', async () => {
    const id = await createApplication(
      db,
      fields(),
      { statementVersion: statementVersion(), paymentMode: 'online' },
      new Date('2026-08-01T10:00:00Z'),
    );

    await moveApplicationPayment(db, id, 'match', new Date('2026-08-04T10:00:00Z'));

    const row = await getApplication(db, id);
    expect(row!.payment.status).toBe('paid_online');
    // The other axis, untouched, as every money move leaves it (AC 7).
    expect(row!.state).toBe('submitted');
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

/**
 * How many applications named a class (#267).
 *
 * The one number the course delete's confirmation turns on, so what it counts
 * is worth pinning: applications rather than children, every unit of the class,
 * and every state — a withdrawn application is still a record of what that
 * family sent, and the sentence it is about to appear in is true of it.
 */
describe('counting the applications that named a class', () => {
  it('counts nothing for a class nobody asked for', async () => {
    await createApplication(db, fields(), { statementVersion: statementVersion() });

    expect(await countApplicationsForCourse(db, 'backyard-botany')).toBe(0);
  });

  it('counts a family once however many children of theirs chose it', async () => {
    await createApplication(
      db,
      fields({
        children: [
          { name: 'Obi', age: '9', offeringKeys: ['algebra-1:year'] },
          { name: 'Ada', age: '13', offeringKeys: ['algebra-1:fall'] },
        ],
      }),
      { statementVersion: statementVersion() },
    );

    // One family's decision to apply, and two units of one class — the office
    // is being told how many applications it is about to keep, not how many
    // checkboxes were ticked.
    expect(await countApplicationsForCourse(db, 'algebra-1')).toBe(1);
  });

  it('counts each application that named it, whatever became of it', async () => {
    const withdrawn = await createApplication(db, fields(), {
      statementVersion: statementVersion(),
    });
    await createApplication(db, fields({ familyName: 'Okonkwo' }), {
      statementVersion: statementVersion(),
    });
    await moveApplication(db, withdrawn, 'withdraw');

    expect(await countApplicationsForCourse(db, 'algebra-1')).toBe(2);
  });
});
