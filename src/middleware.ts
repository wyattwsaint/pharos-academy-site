import type { MiddlewareHandler } from 'astro';

import { INDEXABLE } from './lib/site.js';

/**
 * Pre-launch, every response carries `X-Robots-Tag: noindex, nofollow`.
 *
 * This lives here rather than in `vercel.json` so it reads the same `INDEXABLE`
 * constant `robots.txt` does. A static header in the platform config is exactly
 * the kind of second place a launch switch gets forgotten.
 */
export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next();
  if (!INDEXABLE) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
};
