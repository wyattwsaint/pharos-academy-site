import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * `/admin` is not a screen. There is one thing to edit today, so it is where
 * the door opens; when there are several, this becomes the list.
 */
export const GET: APIRoute = ({ redirect }) => redirect('/admin/school-details', 302);
