/** Where the admin starts, and where a refused return path lands instead. */
const ADMIN_HOME = '/admin/school-details';

/**
 * Where a form that leaves the screen is allowed to come back to.
 *
 * Two forms carry one of these: the login page's `next` (the page the guard
 * bounced away from) and the Republish button's (the screen it was pressed on,
 * #198). Both are a value the browser hands back to us, so both are a value
 * somebody else can write — which is how an open redirect on our own domain
 * gets built, and a phishing link borrows the school's good name.
 *
 * So: only a path on this site, ever. Anything else is not argued with, it is
 * replaced by School details, which is where the admin starts anyway.
 *
 * `//host` is a protocol-relative URL and `/\host` is one that browsers read as
 * protocol-relative too — both start with `/` and neither is a path here.
 */
export function returnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) return ADMIN_HOME;
  if (value.startsWith('//') || value.startsWith('/\\')) return ADMIN_HOME;
  return value;
}
