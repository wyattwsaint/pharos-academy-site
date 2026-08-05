declare namespace App {
  interface Locals {
    /**
     * Who is driving the admin, resolved once per request by the middleware.
     *
     * Null on the public site and on the login page. Every `/admin` page below
     * the guard can rely on it being a person (or break-glass), because the
     * middleware redirects before the page runs.
     */
    actor: import('./lib/admin/sessions.js').Actor | null;
  }
}
