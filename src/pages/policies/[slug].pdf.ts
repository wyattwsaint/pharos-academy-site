import { createHash } from 'node:crypto';

import type { APIRoute } from 'astro';

import { getDb } from '../../lib/db/client.js';
import { getPolicyFile } from '../../lib/policies/store.js';

/**
 * A policy's current document, at its fixed address (#28).
 *
 * **This URL never moves and never redirects.** It is what a printed handbook
 * carries, what the 301s from the Wix site land on, and what Jill pastes into
 * an email. Uploading a replacement changes the bytes here and changes nothing
 * else — no new address, no redirect, no inbound link broken. That is
 * acceptance criterion 1, and it is why the version number is not in this path.
 *
 * Rendered on request rather than prerendered, and it has to be: the bytes are
 * a row Jill can replace from the admin, and `PUBLIC_ROUTES` — the list the
 * sitemap and whole-site revalidation walk — is a build-time constant.
 *
 * `inline` rather than `attachment`, because a parent checking which handbook
 * this is should not have to download it first to find out.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) return notFound();

  const file = await getPolicyFile(await getDb(), slug);
  if (!file) return notFound();

  /*
   * A strong ETag over the bytes, paired with `must-revalidate` — and
   * deliberately **not** `immutable`, which is what this address would carry if
   * caching were the only consideration (ADR-0005).
   *
   * A year-long immutable cache on a mutable address is the one setting that
   * would defeat the ticket: Jill replaces the Child Protection policy, and the
   * families who already opened the old one keep being served it until 2027.
   * So the browser asks every time and is answered with an empty 304 whenever
   * nothing changed — a round trip, never a wrong document. The immutable cache
   * lives on the versioned addresses, where it is true.
   */
  const etag = `"${createHash('sha256').update(file.bytes).digest('base64url')}"`;
  const headers = {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${file.filename}"`,
    'cache-control': 'public, max-age=0, must-revalidate',
    'last-modified': file.uploadedAt.toUTCString(),
    etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: { ...headers, 'content-length': String(file.bytes.length) },
  });
};

/** A slug with no document behind it is a 404, never an empty PDF. */
function notFound(): Response {
  return new Response('No such policy.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
