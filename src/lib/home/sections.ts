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
 * The header nav.
 *
 * Every entry is an on-page anchor, because on-page is where the content
 * actually is: `/classes`, `/about` and `/admissions` are later slices and
 * `PUBLIC_ROUTES` still holds only `/`. A nav item pointing at a 404 is worse
 * than one pointing at the section that answers the same question, so these
 * become real hrefs when the pages behind them exist.
 */
export const NAV_ITEMS = [
  { label: 'A week here', href: '#week' },
  { label: 'Who teaches', href: '#teachers' },
  { label: 'What it costs', href: '#costs' },
  { label: 'Why we do this', href: '#faith' },
] as const;

/** The persistent CTA target, in the header and again in the footer (#9). */
export const INQUIRY_HREF = '#inquiry';
