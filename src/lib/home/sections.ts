/**
 * The homepage's section order, fixed by #9's resolution comment and not open
 * to revision in the surface work (#21).
 *
 * It is a list rather than a comment because the order is the decision: the
 * page renders from it, `data-section` is stamped from it, and the browser
 * suite asserts the rendered sequence equals it. A section moved in the markup
 * alone therefore fails rather than quietly re-ordering what two people signed
 * off on.
 *
 * #9's items 2 and 3 — "what a week actually looks like" and "a selection of
 * real classes with ages and prices" — are one section here. Variant E merged
 * them and the merge is what was approved on #13: a timetable of real classes
 * with real ages and prices *is* what a week looks like, and splitting it puts
 * the same information on the page twice.
 *
 * `announcements` sits directly after the hero. #9 does not place it. An
 * announcement that has to be seen — a closing, a registration deadline — six
 * sections down is not an announcement, and the auto-hide only earns its keep
 * if the slot it vacates is a prominent one.
 */
export const SECTION_ORDER = [
  'hero',
  'announcements',
  'week',
  'teachers',
  'costs',
  'faith',
  'inquiry',
] as const;

export type SectionId = (typeof SECTION_ORDER)[number];

/**
 * The header nav, which is now on more than one page.
 *
 * Every anchor is written as `/#section` rather than `#section`. On the
 * homepage that is still a same-document jump; on `/classes` it is a link back
 * to the section that answers the question, which a bare fragment would not be
 * — it would silently do nothing. About and Admissions are still absent because
 * their pages are, and a nav item pointing at a 404 is worse than one pointing
 * at the section that answers the same question.
 *
 * Classes is a real route now (#22) and leads with the By Age view, which is
 * `/classes` itself.
 */
export const NAV_ITEMS = [
  { label: 'Classes', href: '/classes' },
  { label: 'A week here', href: '/#week' },
  { label: 'Who teaches', href: '/#teachers' },
  { label: 'What it costs', href: '/#costs' },
  { label: 'Why we do this', href: '/#faith' },
] as const;

/**
 * The persistent CTA target, in the header and again in the footer (#9).
 *
 * Rooted for the same reason the nav anchors are: the header and footer are on
 * every page now, and a bare `#inquiry` on `/classes` is a link that does
 * nothing at all.
 */
export const INQUIRY_HREF = '/#inquiry';
