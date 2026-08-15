import { listCourses } from './courses/store.js';
import { getDb, type Db } from './db/client.js';
import { publicRoutesFor, type PublicRoute } from './routes.js';

/**
 * The public route list as it stands **now**, class routes included (#24).
 *
 * `PUBLIC_ROUTES` is a build-time constant, so its class routes are the ones
 * the migration seeds. The course editor writes rows, not seed
 * entries, so the two lists part company the first time Jill adds a class —
 * and the surfaces that part company with her are exactly the ones that must
 * not: the sitemap advertises a catalogue missing her new class, `llms.txt`
 * describes the same stale one, and whole-site republishing never re-requests
 * `/classes/<her-slug>` while the banner tells her "Saved and live."
 *
 * So anything rendering against the database reads the slugs from the database.
 * There is still exactly one route list — this is that list, with the one part
 * of it the school can change looked up rather than assumed.
 *
 * It fails closed like every other database read on this site: a page that
 * cannot reach Neon throws rather than serving a sitemap with the classes
 * quietly missing, which is a 200 the CDN would cache over the good copy
 * (`e2e/database-down.spec.ts`).
 */
export async function livePublicRoutes(db?: Db): Promise<PublicRoute[]> {
  const courses = await listCourses(db ?? (await getDb()));
  return publicRoutesFor(courses.map((course) => course.slug));
}
