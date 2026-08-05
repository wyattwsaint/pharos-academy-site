/**
 * The ISR bypass token, as the running server sees it.
 *
 * Compiled in by `astro.config.mjs` (see `vite.define` there), which is also
 * what hands the identical value to the adapter's prerender config — the two
 * halves of one build, so they cannot disagree. `ISR_BYPASS_TOKEN` wins if it
 * is set, for the case where a shared value is provisioned by hand.
 *
 * Server-only. Nothing in a browser bundle may import this module: the token is
 * the credential that lets a request past the CDN cache.
 */
declare const __ISR_BYPASS_TOKEN__: string | undefined;

export function isrBypassToken(): string {
  const fromEnv = process.env.ISR_BYPASS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  // `typeof` rather than a bare reference: under vitest there is no `define`
  // pass, and a bare reference would be a ReferenceError rather than "absent".
  return typeof __ISR_BYPASS_TOKEN__ === 'string' ? __ISR_BYPASS_TOKEN__ : '';
}
