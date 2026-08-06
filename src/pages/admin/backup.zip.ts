import type { APIRoute } from 'astro';

import { buildExport } from '../../lib/backup/export.js';
import { getDb } from '../../lib/db/client.js';

/**
 * **Download everything** (#33, AC 3) — the bytes behind the button on
 * `/admin/backup`.
 *
 * The same `buildExport` the monthly email sends, so the file the school
 * downloads today and the file that arrives on the 1st are the same archive
 * rather than two things that happen to be similar.
 *
 * No guard of its own: the middleware bounces anything under `/admin` without a
 * session, which is the point of the guard living there. A new admin address is
 * protected by existing.
 *
 * Built on request every time. `no-store` is the instruction to the browser and
 * to any proxy in between: a backup served from a copy is a backup of last week,
 * and the one moment this address is used is the moment that matters. The CDN in
 * front of it is already out of the picture for a different reason — the admin
 * guard re-stamps the session cookie on every `/admin` response, and Vercel does
 * not cache a response carrying `Set-Cookie`.
 */
export const prerender = false;

export const GET: APIRoute = async () => {
  const archive = await buildExport(await getDb());

  return new Response(new Uint8Array(archive.bytes), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      // `attachment`, because the browser has nothing useful to do with a ZIP
      // but save it — and the filename is what the school will file it under.
      'content-disposition': `attachment; filename="${archive.filename}"`,
      'content-length': String(archive.bytes.length),
      'cache-control': 'no-store',
    },
  });
};
