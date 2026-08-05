import type { APIRoute } from 'astro';

import { absoluteUrl } from '../lib/routes.js';
import { ARTEFACT_CACHE_CONTROL, INDEXABLE, SITE_URL } from '../lib/site.js';

export const prerender = false;

/**
 * `robots.txt` follows the launch switch rather than being edited by hand.
 *
 * Until the real domain moves here, <https://www.pharosacademy.net> is still
 * the live Wix site, and a placeholder competing with it in search results is
 * worse than no placeholder at all — so pre-launch this disallows everything.
 * The sitemap is always advertised; a crawler that ignores the disallow should
 * still find the right list.
 */
export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    INDEXABLE ? 'Allow: /' : 'Disallow: /',
    '',
    `Sitemap: ${absoluteUrl(SITE_URL, '/sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': ARTEFACT_CACHE_CONTROL,
    },
  });
};
