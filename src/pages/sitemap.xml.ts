import type { APIRoute } from 'astro';

import { livePublicRoutes } from '../lib/live-routes.js';
import { renderSitemap } from '../lib/routes.js';
import { ARTEFACT_CACHE_CONTROL, SITE_URL } from '../lib/site.js';

export const prerender = false;

export const GET: APIRoute = async () =>
  new Response(renderSitemap(SITE_URL, await livePublicRoutes()), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': ARTEFACT_CACHE_CONTROL,
    },
  });
