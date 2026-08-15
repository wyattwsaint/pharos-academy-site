import { beforeEach, describe, expect, it } from 'vitest';

import { listAnnouncements } from '../announcements/store.js';
import { listEveryCourse } from '../courses/store.js';
import { listEveryPerson } from '../people/store.js';
import { listPolicies } from '../policies/store.js';
import { createEphemeralDatabase, deleteSeededContent, type Db } from './client.js';

/**
 * The empty-lists seam (#197). The migrations seed a full catalogue, staff
 * list, announcement history and policy set, so on any ordinary database the
 * four admin lists are never empty — which is exactly why their empty states
 * would otherwise ship untested. `deleteSeededContent` is what the suite server
 * runs under `E2E_EMPTY_LISTS`; what matters here is that it leaves all four
 * lists empty, in an order the foreign keys allow (a course points at its
 * teacher, a policy version at its policy).
 */
let db: Db;

// Opening the database is a `beforeEach`, as `src/lib/admin/store.test.ts` does
// it: migrating a fresh PGlite outlasts a test's own budget on a loaded
// machine, and a hook has its own.
beforeEach(async () => {
  db = await createEphemeralDatabase();
});

describe('deleteSeededContent', () => {
  it('empties all four seeded lists without tripping a foreign key', async () => {
    await deleteSeededContent(db);

    expect(await listEveryCourse(db)).toEqual([]);
    expect(await listEveryPerson(db)).toEqual([]);
    expect(await listAnnouncements(db)).toEqual([]);
    expect(await listPolicies(db)).toEqual([]);
  });
});
