import type { APIRoute } from 'astro';

import { isrBypassToken } from '../../lib/admin/isr-token.js';
import { revalidateAll, revalidationOrigin } from '../../lib/admin/revalidate.js';

export const prerender = false;

/**
 * Republish on demand (#18 §3) — the same whole-site revalidation a save runs,
 * with no edit attached.
 *
 * It is what "Retry" does after a save reported that the live site had not
 * updated, and it is the button for the case where the site looks stale for a
 * reason nobody can name. The result is carried back in the URL so a refresh
 * does not silently re-fire it.
 */
export const POST: APIRoute = async ({ url, redirect }) => {
  const result = await revalidateAll({
    origin: revalidationOrigin(url),
    bypassToken: isrBypassToken(),
  });
  return redirect(`/admin/school-details?republished=${result.ok ? 'live' : 'stale'}`, 303);
};
