import { beforeEach, describe, expect, it } from 'vitest';

import { createEphemeralDatabase, type Db } from '../db/client.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { recordAgreedTerms } from '../money/store.js';
import {
  faithKey,
  statementVersion,
  type ApplicationFields,
} from './application.js';
import { createApplication, listApplications } from './store.js';

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
