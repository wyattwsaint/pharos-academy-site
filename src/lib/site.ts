/**
 * The canonical public origin.
 *
 * Held here rather than inline in `astro.config.mjs` so the sitemap, the
 * `robots.txt`, the link-preview card and the config all read the same value.
 *
 * The domain points here: this is the live origin, not a placeholder waiting
 * for one. (It said otherwise long after the cutover, which is how the README
 * came to describe a launched site as pre-launch — see {@link INDEXABLE}.)
 */
export const SITE_URL = 'https://www.pharosacademy.net';

/** The school's own name, as it is set everywhere. */
export const SCHOOL_NAME = 'Pharos Academy';

/**
 * What the school is, in one line, in the school's own wording (#137).
 *
 * Held beside the name because it drifted the way an unheld string does: the
 * hero read "A Christian Classical Hybrid Homeschool" while the About page, the
 * `llms.txt` summary and the nineteen mirrored pages all said *microschool*.
 * Pharos is not a homeschool — it serves homeschooling families, which is a
 * different claim, and the one the site was accidentally making was wrong.
 *
 * Sentence case. The comma after "Christian" is *ours*, settled on #137 — the
 * nineteen mirrored pages set the line without one, so a reader comparing this
 * to `docs/mirror/` should expect the difference and not correct it back.
 */
export const SCHOOL_DESCRIPTION = 'A Christian, classical hybrid microschool';

/**
 * The same description, for the middle of a sentence.
 *
 * Derived rather than typed a second time — two hand-typed cases are how the
 * first one drifted.
 */
export const SCHOOL_DESCRIPTION_INLINE =
  SCHOOL_DESCRIPTION.charAt(0).toLowerCase() + SCHOOL_DESCRIPTION.slice(1);

/**
 * The same description, title-cased, for the home hero lockup only.
 *
 * The hero sets the line as display type under the school's name, where
 * sentence case reads as a caption rather than as part of the lockup. Every
 * other surface — About, `llms.txt`, the structured-data node — stays sentence
 * case, so this is a rendering of the one wording and not a second wording.
 *
 * Derived, like {@link SCHOOL_DESCRIPTION_INLINE}, so the words can only ever be
 * typed once. Not `text-transform: capitalize`, because the cased string is what
 * a screen reader and a copy-paste both get.
 */
export const SCHOOL_DESCRIPTION_TITLE = SCHOOL_DESCRIPTION.replace(
  /\b[a-z]/g,
  (letter) => letter.toUpperCase(),
);

/**
 * Who built the site, credited at the foot of the staff page (#150).
 *
 * The Head of School asked for the credit, and the wording is his own, shown to
 * him before it went live. It is a line and not a card: MWAForge is not staff,
 * and an entry among the instructors — name, role, portrait frame — would say
 * that they were. No portrait for the same reason. The frames on that page
 * belong to the people a family will actually meet.
 *
 * Held here beside the school's own name rather than in `people/views.ts`: that
 * module publishes the people *of the school*, and the whole argument for this
 * being a line and not a card is that MWAForge is not one of them.
 */
export const SITE_CREDIT = 'Website by MWAForge';

/**
 * The launch switch. **Flipped — the site is live and crawlable.**
 *
 * It was `false` until the domain actually pointed here: until then the live
 * Wix site was still what parents found, and a placeholder competing with it in
 * search results was worse than no placeholder. Flipping it to `true` was the
 * whole of "go live" as far as crawlers are concerned — `robots.txt` and the
 * `X-Robots-Tag` header both follow it, so the two can never disagree.
 *
 * Verified against the live origin on 2026-08-12 (#147): `robots.txt` answers
 * `Allow: /` and `/` carries no `X-Robots-Tag`. Kept as a switch rather than
 * deleted because it is also how the site would be pulled back out of the index
 * deliberately, and because the admin's exclusion is written against it.
 */
export const INDEXABLE = true;

/**
 * `Cache-Control` for the machine-readable artefacts — `robots.txt`, the
 * sitemap and `llms.txt`.
 *
 * One value in one place because the three must not drift apart: they describe
 * the same route list, so a crawler holding a fresh sitemap and a stale
 * `robots.txt` is a contradiction we would have authored. `max-age=0` keeps
 * browsers honest; `s-maxage` is what the edge actually holds.
 */
export const ARTEFACT_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600';

/**
 * The school's notice of non-discrimination, verbatim (#324).
 *
 * Not a `SchoolDetails` field, and deliberately so. The address and the phone
 * are admin-editable because they drift and Jill is the one who knows; this is
 * filed policy language, and a text box the wording sits in is a text box the
 * wording drifts out of. IRS Rev. Proc. 75-50, as amplified by Rev. Proc.
 * 2019-22, is what lets a private school publish this on its home page instead
 * of buying a newspaper ad — so the words are a compliance artefact, not copy.
 *
 * The same text is in the handbook. If the two ever disagree the handbook is
 * the source and this follows it. It is transcribed copy, like the Statement of
 * Faith and the About page — `docs/house-style.md` does not reach it, and the
 * punctuation audit lists it as verbatim so nobody is invited to tidy a hyphen
 * in a filed policy.
 *
 * The heading's capitals are in the string and not in a `text-transform`, which
 * is where the footer's other headings put theirs. They are the filed casing,
 * so they are what a screen reader and a copy-paste should both get.
 *
 * "In a manner reasonably expected to be noticed by visitors" is the phrase
 * that constrains the rendering, not just the wording: the footer sets it in
 * full, always visible, at the footer's own body size and above its body
 * contrast — never behind a link, a disclosure or a "read more".
 */
export const NON_DISCRIMINATION_NOTICE = {
  heading: 'NOTICE OF NON-DISCRIMINATION POLICY',
  body:
    'Pharos Academy does not discriminate on the basis of race, color, nationality, ' +
    'or ethnic origin in the administration of any of its policies or programs. It ' +
    'does reserve the right to select students and faculty on the basis of personal ' +
    'religious commitment and beliefs, academic performance, and willingness to abide ' +
    'by its policies.',
} as const;
