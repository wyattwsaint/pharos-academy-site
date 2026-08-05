import type { APIRoute } from 'astro';

import { renderLlmsTxt } from '../lib/llms.js';
import { ARTEFACT_CACHE_CONTROL, SITE_URL } from '../lib/site.js';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(renderLlmsTxt(SITE_URL), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': ARTEFACT_CACHE_CONTROL,
    },
  });
