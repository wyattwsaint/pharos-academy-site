import { createHash } from 'node:crypto';

import type { APIRoute } from 'astro';

import { getAttachment } from '../../lib/announcements/store.js';
import { getDb } from '../../lib/db/client.js';

/**
 * An announcement's attached PDF, served from the database (#27).
 *
 * Rendered on request rather than prerendered, and it has to be: the bytes are
 * a row Jill can replace from the admin, and `PUBLIC_ROUTES` — the list the
 * sitemap and whole-site revalidation walk — is a build-time constant that
 * cannot know about a file uploaded after the build.
 *
 * `inline` rather than `attachment` because a board update is something a
 * parent reads, not something they file. The filename still travels, so saving
 * it gives the school's name for it rather than the slug.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) return notFound();

  const attachment = await getAttachment(await getDb(), slug);
  if (!attachment) return notFound();

  /*
   * A strong ETag over the bytes themselves, paired with `must-revalidate`.
   *
   * A replaced PDF has to be the one a parent gets — the failure worth avoiding
   * is last term's fundraiser being served from a cache after Jill has
   * corrected it. So the browser asks every time and is answered with a 304
   * whenever nothing changed, which costs a round trip and never costs
   * correctness.
   */
  const etag = `"${createHash('sha256').update(attachment.bytes).digest('base64url')}"`;
  const headers = {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${attachment.filename}"`,
    'cache-control': 'public, max-age=0, must-revalidate',
    etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(new Uint8Array(attachment.bytes), {
    status: 200,
    headers: { ...headers, 'content-length': String(attachment.bytes.length) },
  });
};

/** A slug with no file behind it is a 404, never an empty PDF. */
function notFound(): Response {
  return new Response('No such announcement.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
