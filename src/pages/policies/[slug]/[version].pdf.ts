import type { APIRoute } from 'astro';

import { getDb } from '../../../lib/db/client.js';
import { getPolicyFile } from '../../../lib/policies/store.js';
import { parseVersionSegment } from '../../../lib/policies/views.js';

/**
 * One retained version of a policy — `/policies/handbook/v1.pdf` (#28).
 *
 * This is the half of "prior versions are kept" that a person can actually
 * open. The school's question is "what did the family who enrolled in August
 * sign?", and the answer has to be a document rather than a row count, so every
 * version the version table holds has an address.
 *
 * Linked from the admin and not from the policies page, because the audience is
 * the school. It is not *secret* — a superseded handbook is not sensitive, and
 * putting it behind the session guard would mean an admin-only file route,
 * which is a second serving path to keep correct for no protection worth
 * having.
 *
 * **This is where the long immutable cache belongs.** A version never changes —
 * that is what makes it a version — so a year of caching is a true statement
 * here in a way it is never true of the fixed address next door (ADR-0005).
 */
export const prerender = false;

const A_YEAR = 60 * 60 * 24 * 365;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  const version = parseVersionSegment(params.version ?? '');
  if (!slug || version === undefined) return notFound();

  const file = await getPolicyFile(await getDb(), slug, version);
  if (!file) return notFound();

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${file.filename}"`,
      'cache-control': `public, max-age=${A_YEAR}, immutable`,
      'last-modified': file.uploadedAt.toUTCString(),
      'content-length': String(file.bytes.length),
    },
  });
};

/** A version that was never uploaded is a 404, never an empty PDF. */
function notFound(): Response {
  return new Response('No such version of that policy.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
