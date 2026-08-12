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
