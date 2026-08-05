/**
 * The canonical public origin.
 *
 * Held here rather than inline in `astro.config.mjs` so the sitemap, the
 * `robots.txt` and the config all read the same value. The real domain is not
 * pointed at this deployment yet; the constant is what changes when it is.
 */
export const SITE_URL = 'https://www.pharosacademy.net';

/** The school's own name, as it is set everywhere. */
export const SCHOOL_NAME = 'Pharos Academy';

/**
 * The launch switch.
 *
 * `false` until the domain actually points here: until then the live Wix site
 * is still what parents find, and a placeholder competing with it in search
 * results is worse than no placeholder. Flipping this to `true` is the whole
 * of "go live" as far as crawlers are concerned — `robots.txt` and the
 * `X-Robots-Tag` header both follow it, so the two can never disagree.
 */
export const INDEXABLE = false;

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
