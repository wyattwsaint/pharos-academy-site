import { listCourses, listEveryCourse } from './courses/store.js';
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
 * (`e2e/database-down.spec.ts`). An empty catalogue throws for the same reason
 * and by the same reader — it is a database the migration never ran against.
 *
 * **A retired class is not advertised here** (#263). This list is what the
 * sitemap and `llms.txt` are built from, and both of them are the school
 * telling the world what it offers; a class it has stopped running is not that,
 * which is the argument the class page's own structured data makes when it
 * takes itself off. The address still resolves and still says so — being
 * reachable is not the same as being advertised. Republishing is the other
 * half, and it is `liveRepublishRoutes` below.
 */
export async function livePublicRoutes(db?: Db): Promise<PublicRoute[]> {
  const courses = await listCourses(db ?? (await getDb()));
  return publicRoutesFor(courses.map((course) => course.slug));
}

/**
 * The same list for whole-site republishing, retired classes included.
 *
 * The one place the two readings differ, and the reason is the whole point of
 * retiring: the retired class's page is still served, and it is the page that
 * has just changed. Republishing the advertised list alone would leave the CDN
 * holding the copy that says the school runs it — the retire would reach three
 * surfaces and stop one short of the address on the printed flyer.
 *
 * No empty-catalogue guard, and that is not an oversight: a database with no
 * course rows has no class pages to re-request, and refusing to republish the
 * rest of the site over it would turn every other save into a failure.
 */
export async function liveRepublishRoutes(db?: Db): Promise<PublicRoute[]> {
  const courses = await listEveryCourse(db ?? (await getDb()));
  return publicRoutesFor(courses.map((course) => course.slug));
}
