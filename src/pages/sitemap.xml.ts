import type { APIRoute } from 'astro';

import { renderSitemap } from '../lib/routes.js';
import { SITE_URL } from '../lib/site.js';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(renderSitemap(SITE_URL), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
