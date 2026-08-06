import { ABOUT_PATH } from '../about/story.js';
import { CURRENT_FAMILIES_PATH } from '../current-families/section.js';

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
 * The header nav, as #9 and #18 §5 fix it: four items and the inquiry button.
 *
 * Until #30 this was seven items, most of them homepage anchors, and the
 * comment here said so — an interim list kept only because the pages behind the
 * real one did not exist. They all exist now, so this is the settled shape:
 *
 *   About · Classes · Admissions · Current Families
 *
 * Four, and in a stranger's order. About says what the school is, Classes is
 * what it sells, Admissions is how you get in, and Current Families is for the
 * people already here — which is why it is last, and why it reads as an
 * audience rather than a door. **Nothing behind it is gated** (#30): the
 * section describes who the material is mainly for, not who is permitted to see
 * it, and Admissions links the calendar and the handbook's fee detail directly
 * so a prospective family never has to work out that they are allowed to look.
 *
 * The three homepage anchors this replaces — "A week here", "What it costs",
 * "Why we do this" — are not lost. Each is a section of a page that is now
 * reachable in two clicks, and each was on the list only for want of the page
 * above it. Deep-linking the homepage from the header of a different page was
 * always the weaker half of this nav.
 *
 * Every href is still rooted at `/`. Only the anchor rule is gone with the
 * anchors; if an item ever points at a fragment again it must be `/#section`,
 * because the header is on every page and a bare fragment elsewhere silently
 * does nothing.
 */
export const NAV_ITEMS = [
  { label: 'About', href: ABOUT_PATH },
  { label: 'Classes', href: '/classes' },
  { label: 'Admissions', href: '/admissions' },
  { label: 'Current Families', href: CURRENT_FAMILIES_PATH },
] as const;

/**
 * The persistent CTA target, in the header and again in the footer (#9).
 *
 * Rooted for the same reason the nav anchors are: the header and footer are on
 * every page now, and a bare `#inquiry` on `/classes` is a link that does
 * nothing at all.
 */
export const INQUIRY_HREF = '/#inquiry';
