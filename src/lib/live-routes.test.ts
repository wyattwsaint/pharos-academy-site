import { beforeEach, describe, expect, it } from 'vitest';

import { CATALOGUE } from './courses/catalogue.js';
import { createCourse, type CourseEdit } from './courses/store.js';
import { createEphemeralDatabase, type Db } from './db/client.js';
import { livePublicRoutes } from './live-routes.js';
import { publicPaths, PUBLIC_ROUTES, revalidatablePaths } from './routes.js';

/**
 * The route list against a database that has been edited (#24).
 *
 * The seed and the store agree the moment the migration runs and part company
 * the moment Jill adds a class. Everything that renders against Neon has to
 * follow the store, or the sitemap advertises last term's catalogue and the
 * save that added a class reports "Saved and live" without republishing it.
 */

let db: Db;

beforeEach(async () => {
  db = await createEphemeralDatabase();
});

/**
 * A new class, shaped like a real one.
 *
 * Copied from a seeded course rather than written out, so this test says
 * nothing about which fields a course has — that is `store.test.ts`'s subject,
 * and a hand-built literal here would need editing every time a column lands.
 */
const EDIT: CourseEdit = { ...CATALOGUE[0]!, title: 'Rhetoric II' };

describe('the live public routes', () => {
  it('covers the enumerated list on an unedited database', async () => {
    // The seed is the store, so the two lists carry the same routes until
    // somebody edits something — a missing one here would mean the seed and
    // `CATALOGUE` had already drifted. Only the order differs: the store reads
    // courses alphabetically by title and `CATALOGUE` is in seed order, and
    // nothing downstream of this list is order-sensitive.
    const live = await livePublicRoutes(db);
    expect(live.map((route) => route.path).sort()).toEqual(publicPaths().sort());
    expect(live).toEqual(expect.arrayContaining([...PUBLIC_ROUTES]));
  });

  it('carries a class added in the editor', async () => {
    await createCourse(db, 'rhetoric-2', EDIT, 'Jill');

    const paths = (await livePublicRoutes(db)).map((route) => route.path);
    expect(paths).toContain('/classes/rhetoric-2');
    // …and the build-time list does not, which is exactly why this module
    // exists rather than the constant being read directly.
    expect(publicPaths()).not.toContain('/classes/rhetoric-2');
  });

  it('republishes the new class in the same save that created it', async () => {
    await createCourse(db, 'rhetoric-2', EDIT, 'Jill');

    expect(revalidatablePaths(await livePublicRoutes(db))).toContain('/classes/rhetoric-2');
  });

  it('gives a new class the same priority and change frequency as the others', async () => {
    await createCourse(db, 'rhetoric-2', EDIT, 'Jill');

    const added = (await livePublicRoutes(db)).find(
      (route) => route.path === '/classes/rhetoric-2',
    );
    expect(added).toEqual({ path: '/classes/rhetoric-2', priority: 0.7, changefreq: 'monthly' });
  });

  it('leaves everything that is not a class exactly where it was', async () => {
    await createCourse(db, 'rhetoric-2', EDIT, 'Jill');

    const notAClass = (paths: string[]) => paths.filter((path) => !path.startsWith('/classes/'));
    expect(notAClass((await livePublicRoutes(db)).map((route) => route.path))).toEqual(
      notAClass(publicPaths()),
    );
  });
});
