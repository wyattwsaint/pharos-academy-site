import { absoluteUrl } from './routes.js';
import { SCHOOL_NAME } from './site.js';

/**
 * What a shared link looks like when it lands (#147).
 *
 * This school talks to families through Facebook, WhatsApp and group texts far
 * more than through search, so the link *preview* is the school's front door
 * more often than the homepage is. Without these tags every one of those shares
 * renders as a bare URL — no name, no line about what the school is, no
 * picture — which reads, to a parent who was forwarded it, like something
 * nobody stands behind.
 *
 * The tags are built here rather than written into the layout for one reason:
 * the title, the description and the canonical URL each already exist on the
 * page, and a second hand-authored copy in `<head>` is a copy that drifts. A
 * page passes its own title and description to the layout; those exact strings
 * come back out here. The card and the page cannot disagree because there is
 * only one string.
 *
 * Two vocabularies, both required, because the consumers differ: Open Graph
 * (`property="og:…"`) is what Facebook, WhatsApp, iMessage, Slack and LinkedIn
 * read, and Twitter's own (`name="twitter:…"`) is what X reads. Twitter falls
 * back to Open Graph for most fields but not for `twitter:card`, which is what
 * chooses the big image over the thumbnail — so the card type at minimum has to
 * be stated in its own vocabulary, and the rest is stated beside it rather than
 * left to a fallback that is documented nowhere either side controls.
 */

/**
 * The card image, and the numbers that go with it.
 *
 * The dimensions are declared rather than left to be discovered because a
 * scraper that has not yet fetched the image lays out the card from these; one
 * that has to measure the file first shows the small thumbnail until it does.
 * They must match `public/social/preview.jpg` — `scripts/build-social-preview.mjs`
 * writes it at exactly this size, and `social-preview.test.ts` holds the two
 * together.
 */
export const SOCIAL_PREVIEW_IMAGE = {
  path: '/social/preview.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  /**
   * Described honestly. It is the hero's painting, not a photograph of the
   * building — the same disclosure `assets/imagery/README.md` makes, in the one
   * place a screen reader will read it aloud.
   */
  alt: 'A painting of a lighthouse on a headland at sunrise, its beam crossing a gold sky over the sea.',
} as const;

/** A `<meta>` tag, keyed by the attribute its vocabulary uses. */
export type PreviewTag =
  | { readonly property: string; readonly name?: undefined; readonly content: string }
  | { readonly name: string; readonly property?: undefined; readonly content: string };

/**
 * The `<title>`, and the same string the card shows.
 *
 * One function so the two are the same by construction. A card titled "About"
 * where the tab says "About — Pharos Academy" is a share that never names the
 * school, which is most of what a preview is for.
 */
export function pageTitle(title: string): string {
  return `${title} — ${SCHOOL_NAME}`;
}

/**
 * The canonical absolute URL for a path.
 *
 * Trailing slashes are stripped so this agrees with the sitemap, which lists
 * `/about` and not `/about/`. Two URLs for one page is the one thing a
 * canonical tag exists to prevent, and it would be this module that authored
 * them.
 */
export function canonicalUrl(site: string | URL, pathname: string): string {
  const path = pathname.replace(/(?!^)\/+$/, '');
  return absoluteUrl(site, path);
}

interface PreviewInput {
  /** The page's own title, unsuffixed — what it passes to the layout. */
  title: string;
  /** The page's own description, the same string the `<meta name="description">` carries. */
  description: string;
  /** `Astro.url.pathname`. */
  pathname: string;
  /** `Astro.site`. */
  site: string | URL;
}

/**
 * Every preview tag for one page, in the order they belong in `<head>`.
 *
 * `og:type` is `website` on every page, including the course pages: the
 * alternatives schema.org offers here are `article` and `profile`, and neither
 * a class description nor a staff list is either of those. A wrong type is
 * worse than the generic one — some readers render an `article` card expecting
 * a byline and a publish date that this site will never have.
 */
export function socialPreviewTags({ title, description, pathname, site }: PreviewInput): PreviewTag[] {
  const url = canonicalUrl(site, pathname);
  const heading = pageTitle(title);
  const image = absoluteUrl(site, SOCIAL_PREVIEW_IMAGE.path);

  return [
    { property: 'og:site_name', content: SCHOOL_NAME },
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:title', content: heading },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    // Absolute, always. A relative `og:image` is the single most common way a
    // card ends up text-only: the scrapers do not resolve one.
    { property: 'og:image', content: image },
    { property: 'og:image:secure_url', content: image },
    { property: 'og:image:type', content: SOCIAL_PREVIEW_IMAGE.type },
    { property: 'og:image:width', content: String(SOCIAL_PREVIEW_IMAGE.width) },
    { property: 'og:image:height', content: String(SOCIAL_PREVIEW_IMAGE.height) },
    { property: 'og:image:alt', content: SOCIAL_PREVIEW_IMAGE.alt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: heading },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: SOCIAL_PREVIEW_IMAGE.alt },
  ];
}
