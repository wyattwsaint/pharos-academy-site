import { NEWS_PATH } from '../announcements/views.js';
import { POLICIES_PATH } from '../policies/views.js';

/**
 * Current Families — the fourth nav item, and what is under it (#30).
 *
 * **Nothing here is behind a login, and that is a decision rather than an
 * omission.** "Current Families" describes who the material is mainly for, not
 * who is permitted to see it: a family deciding whether to apply has a
 * legitimate interest in the handbook's fee schedule and in what the school
 * announced in July, and making them create an account to read it would be a
 * gate with nothing behind it. Admissions links the same documents directly for
 * exactly that reason.
 *
 * The list is here rather than in the template because two surfaces walk it —
 * the section index and its test.
 *
 * The calendar joined it in #23. Until then it was named and deliberately not
 * linked, because the alternative to a page that did not exist was dates
 * somebody had invented.
 */
export const CURRENT_FAMILIES_PATH = '/current-families';

/**
 * The calendar's address (#23).
 *
 * Declared here rather than in `calendar/views.ts` only to keep the imports
 * pointing one way: this list needs the path, and `calendar/views.ts` needs the
 * section it hangs under. `calendar/views.ts` re-exports it, and that is the
 * name the rest of the site imports.
 */
export const CALENDAR_PATH = `${CURRENT_FAMILIES_PATH}/calendar`;

/** One thing a current family comes here for. */
export type CurrentFamiliesLink = {
  path: string;
  label: string;
  /** What is behind it, in the school's terms rather than the site's. */
  blurb: string;
};

export const CURRENT_FAMILIES_LINKS: readonly CurrentFamiliesLink[] = [
  {
    path: CALENDAR_PATH,
    label: 'The calendar',
    /*
     * The second sentence outlived the band it was written for. #179 removed the
     * calendar section from the index as a duplicate of this card, and the one
     * thing the band said that the card did not is what a subscription cannot
     * promise (#23) — a phone refreshes a subscribed calendar on its own
     * schedule, and a family who assumes otherwise misses a short-notice change.
     * No vendor controls that and neither do we, so the site says it out loud.
     */
    blurb:
      'Every class date for the year, by day track, with the days the school is closed and the ' +
      'year’s events. Subscribe to it, or print the sheet. A subscribed calendar refreshes on ' +
      'your phone’s own schedule, so if something changes at short notice the school will ' +
      'still text you.',
  },
  {
    path: NEWS_PATH,
    label: 'News',
    blurb:
      'Board updates, fundraisers and notices, newest first — including the ones that have ' +
      'dropped off the front page.',
  },
  {
    path: POLICIES_PATH,
    label: 'Policies and the handbook',
    blurb:
      'Every policy the school publishes, each with what it is and when it was last updated. ' +
      'The handbook carries the fee schedule and the payment dates.',
  },
];
