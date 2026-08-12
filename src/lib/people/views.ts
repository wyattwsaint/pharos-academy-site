/**
 * Where the people of the school are published (#26, moved by #30).
 *
 * One constant rather than a literal in five templates, for the reason
 * `announcements/views.ts` gives: the page has now moved once, from `/staff` to
 * under About where #9's tree puts it, and a path written out in the nav, the
 * sitemap, the redirect map and two suites is a path that is wrong in one of
 * them the next time it moves.
 */
export const STAFF_PATH = '/about/staff';

/**
 * Who built the site, credited at the foot of the staff page (#150).
 *
 * The Head of School asked for the credit, and the wording is his own, shown to
 * him before it went live. It is a line and not a card: MWAForge is not staff,
 * and an entry among the instructors — name, role, portrait frame — would say
 * that they were. No portrait for the same reason. The frames on this page
 * belong to the people a family will actually meet.
 */
export const SITE_CREDIT = 'Website by MWAForge';
