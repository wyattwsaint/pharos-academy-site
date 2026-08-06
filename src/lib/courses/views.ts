/**
 * The four ways into the catalogue (#22).
 *
 * Three list views and one page per class. They are enumerated here because
 * four things need the same list and must not keep four copies of it: the view
 * switcher on each surface, `PUBLIC_ROUTES` (and through it the sitemap and
 * whole-site republishing), and the browser suite that runs axe over every one
 * of them.
 *
 * **By Age is first, and first is the point**: `/classes` itself *is* the By Age
 * view rather than redirecting to it, because ages are the primary axis and a
 * redirect would make the primary axis the one thing with no address of its
 * own.
 */

export type ClassView = {
  id: 'by-age' | 'by-day' | 'full-descriptions';
  path: string;
  /** What the switcher shows. */
  label: string;
  /** The `<title>` and the page's own heading eyebrow. */
  title: string;
  description: string;
};

export const CLASS_VIEWS: readonly ClassView[] = [
  {
    id: 'by-age',
    path: '/classes',
    label: 'By age',
    title: 'Classes by age',
    description:
      'Every class Pharos Academy runs in 2026–2027, grouped by the ages it is written for.',
  },
  {
    id: 'by-day',
    path: '/classes/by-day',
    label: 'By day',
    title: 'Classes by day',
    description:
      'The Pharos Academy timetable for 2026–2027, drawn to scale, so classes that run at the same time look like it.',
  },
  {
    id: 'full-descriptions',
    // `descriptions`, not `full-descriptions`: #9's tree names it that, and the
    // word "full" was only ever there to distinguish this page from the Wix
    // course list that no longer exists. Both older addresses 301 here.
    path: '/classes/descriptions',
    label: 'Full descriptions',
    title: 'Full course descriptions',
    description:
      'The full description, text list, prerequisites and fees for every Pharos Academy class in 2026–2027.',
  },
] as const;

/** The address of one class — the link Jill sends when she means one class. */
export function classPath(slug: string): string {
  return `/classes/${slug}`;
}

export function viewFor(id: ClassView['id']): ClassView {
  const view = CLASS_VIEWS.find((candidate) => candidate.id === id);
  if (!view) throw new Error(`No such class view: ${id}`);
  return view;
}
