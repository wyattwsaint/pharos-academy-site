/**
 * Homepage announcements.
 *
 * Announcements are in CONTEXT.md's *editable set*: Jill types them, and #7 is
 * the slice that gives her somewhere to type them. Until then the list is
 * empty and hard-coded, which #21 permits for anything a later slice makes
 * editable.
 *
 * The empty case is not a placeholder to be filled in later — it is the normal
 * state of this section and the one the page has to handle well. A school with
 * nothing to announce must not render an empty band with a heading over it, so
 * `hasAnnouncements` is what the section renders on, and the browser suite
 * asserts the section is present in the document and not visible.
 */
export type Announcement = {
  /** Stable id, so a rendered list has keys that survive an edit. */
  id: string;
  /** The one line a parent reads at a glance. */
  headline: string;
  /** Optional detail under it. */
  detail?: string;
  /** Optional link out — a form, a policy, a calendar. */
  href?: string;
  /** Link text, required when `href` is set. "Read more" is not a link name. */
  linkLabel?: string;
};

/** What is currently being announced. Empty is the expected state. */
export const ANNOUNCEMENTS: readonly Announcement[] = [];

/** Whether the announcements section renders at all. */
export function hasAnnouncements(list: readonly Announcement[] = ANNOUNCEMENTS): boolean {
  return list.length > 0;
}
