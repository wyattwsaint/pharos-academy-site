import { PUBLIC_ROUTES } from './routes.js';

/**
 * The 301 map: where every URL the Wix site published lands on this one (#30).
 *
 * The full table of the nineteen live URLs is in `docs/mirror/README.md`, and
 * this is the half of it that can be honoured today — a redirect is only worth
 * having if what it points at exists, and a 301 to a 404 is strictly worse than
 * the 404 it replaces, because a crawler retires the old address on the
 * strength of it. Entries are added here as the pages they point at are built;
 * the test beside this file refuses a destination that is not an enumerated
 * public route, so the two lists cannot drift.
 *
 * Still owed, each blocked on its destination page: `/about`, `/about-1`
 * (Location), `/about-3` (Start Date), `/general-8` (Pharos Meaning),
 * `/giving`, `/volunteer`, `/about-5` (the byte-identical duplicate of
 * `/volunteer`, mislabelled "Media"), `/calendars-and-events` and
 * `/download-calendars`.
 *
 * `301` and not `302` deliberately: these addresses are not coming back, and a
 * permanent redirect is what moves whatever ranking the old page holds. `/` and
 * `/policies` are absent because they do not move — the same path serves the
 * same purpose on the new site.
 */
export type Redirect = {
  /** The path on the Wix site, exactly as it was published. */
  from: string;
  /** A path on this site, which must be an enumerated public route. */
  to: string;
  /** Why this destination, for whoever reads the map next. */
  because: string;
};

export const REDIRECTS: readonly Redirect[] = [
  {
    from: '/statement-of-faith',
    to: '/about/beliefs',
    because:
      'The same document, now a real page under About. It is the one Wix address a family is ' +
      'most likely to have been sent directly, since applying is gated on reading it.',
  },
  {
    from: '/courses',
    to: '/classes',
    because:
      'The old courses page was a link hub with no content of its own. Its three destinations ' +
      'are the three renderings, and By Age is the one that lands.',
  },
  {
    from: '/courses-by-grade-level',
    to: '/classes',
    because:
      'One-to-one with the By Age view. Ages are the primary axis here, as they are in the ' +
      'school’s own course data; the old page approximated them as grades.',
  },
  {
    from: '/daily-course-offerings',
    to: '/classes/by-day',
    because: 'One-to-one with the timetable, which is what that page was.',
  },
  {
    from: '/full-course-descriptions',
    to: '/classes/full-descriptions',
    because: 'One-to-one with the full descriptions.',
  },
  {
    from: '/team-4',
    to: '/staff',
    because:
      'The three bios that page carried are on the staff page, alongside every instructor the ' +
      'catalogue names.',
  },
  {
    from: '/special-announcement',
    to: '/news',
    because:
      'The Weis Markets fundraiser was a page in a fixed slot. It is an announcement here, and ' +
      'the news page is where it and every fundraiser after it lives.',
  },
];

/** The map in the shape Astro's `redirects` config wants. */
export function redirectConfig(
  redirects: readonly Redirect[] = REDIRECTS,
): Record<string, { status: 301; destination: string }> {
  return Object.fromEntries(
    redirects.map(({ from, to }) => [from, { status: 301 as const, destination: to }]),
  );
}

/** The paths this site would serve a redirect for. */
export function redirectedPaths(redirects: readonly Redirect[] = REDIRECTS): string[] {
  return redirects.map((redirect) => redirect.from);
}

/** Whether a destination is somewhere this site actually renders. */
export function isLiveDestination(path: string): boolean {
  return PUBLIC_ROUTES.some((route) => route.path === path);
}
