import type { APIRoute } from 'astro';

import { livePublicRoutes } from '../lib/live-routes.js';
import { renderLlmsTxt } from '../lib/llms.js';
import { ARTEFACT_CACHE_CONTROL, SITE_URL } from '../lib/site.js';

export const prerender = false;

export const GET: APIRoute = async () =>
  new Response(renderLlmsTxt(SITE_URL, await livePublicRoutes()), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': ARTEFACT_CACHE_CONTROL,
    },
  });
