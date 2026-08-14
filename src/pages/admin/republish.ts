import type { APIRoute } from 'astro';

import { isrBypassToken } from '../../lib/admin/isr-token.js';
import { returnPath } from '../../lib/admin/return-path.js';
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
 *
 * It is carried back to the screen the button was pressed on (#198), named by
 * the form's `next` and validated the way the login page's is — an answer that
 * arrives on some other screen is an answer to a question nobody asked, and it
 * loses the admin their place.
 */
export const POST: APIRoute = async ({ url, request, redirect }) => {
  const form = await request.formData();
  const back = new URL(returnPath(String(form.get('next') ?? '')), url.origin);

  const result = await revalidateAll({
    origin: revalidationOrigin(url),
    bypassToken: isrBypassToken(),
  });

  /*
   * Set rather than append. `next` is a value the browser hands back, so a
   * hand-made one can already carry a `republished=` of its own — and every
   * screen reads the first of them. Appending would let the URL claim the
   * republish reached the live site when it did not, which is precisely the
   * lie this whole outcome exists to prevent.
   */
  back.searchParams.set('republished', result.ok ? 'live' : 'stale');
  return redirect(`${back.pathname}${back.search}`, 303);
};
