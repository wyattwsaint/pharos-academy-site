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
 * the section index and its test — and because what is *missing* from it is
 * load-bearing: the calendar belongs to #23 and #23 is not built, so it is
 * absent rather than linked, and the page says so in words rather than showing
 * a dead link or, worse, dates somebody invented.
 */
export const CURRENT_FAMILIES_PATH = '/current-families';

/** One thing a current family comes here for. */
export type CurrentFamiliesLink = {
  path: string;
  label: string;
  /** What is behind it, in the school's terms rather than the site's. */
  blurb: string;
};

export const CURRENT_FAMILIES_LINKS: readonly CurrentFamiliesLink[] = [
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
