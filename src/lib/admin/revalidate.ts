import { livePublicRoutes } from '../live-routes.js';
import { revalidatablePaths } from '../routes.js';

/**
 * Whole-site revalidation, synchronous and reported (#18 §3).
 *
 * Every public path is re-requested with `x-prerender-revalidate` and the
 * deployment's bypass token, in parallel, and the save waits for the answer.
 * There is deliberately **no per-path invalidation map**: a second source of
 * truth about which edit touches which page drifts silently, and the bug it
 * produces — an edit that is saved but invisible on one page — is worse than
 * re-rendering a handful of pages.
 *
 * The reporting is the point. A save that failed to revalidate looks, to Jill,
 * exactly like an edit that vanished, and that is the single thing most likely
 * to make her stop trusting the admin. So the result is a fact she is told,
 * never a hope.
 */

export type RevalidationResult = {
  /** True only if every path came back OK. */
  ok: boolean;
  /** The paths that did not, in `paths` order. Empty on success. */
  failedPaths: string[];
};

export type RevalidateOptions = {
  /** Absolute origin to re-request, no trailing slash. */
  origin: string;
  /** The adapter's ISR bypass token. Empty means "cannot revalidate". */
  bypassToken: string;
  /**
   * Defaults to every public path the school offers **now** — the enumerated
   * list with its class routes read from the store rather than from the seed,
   * so a class added in the course editor is republished by the same save that
   * created it (#24).
   */
  paths?: string[];
  fetchImpl?: typeof fetch;
};

export async function revalidateAll(options: RevalidateOptions): Promise<RevalidationResult> {
  const { origin, bypassToken, fetchImpl = fetch } = options;
  const paths = options.paths ?? revalidatablePaths(await livePublicRoutes());

  // No token means every request would be served from the cache and report
  // success while changing nothing. Fail closed and say so, rather than lie.
  if (!bypassToken) {
    return { ok: false, failedPaths: [...paths] };
  }

  const outcomes = await Promise.all(
    paths.map((path) => revalidateOne(new URL(path, origin).toString(), bypassToken, fetchImpl)),
  );

  const failedPaths = paths.filter((_, index) => !outcomes[index]);
  return { ok: failedPaths.length === 0, failedPaths };
}

async function revalidateOne(url: string, bypassToken: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'x-prerender-revalidate': bypassToken },
      // The whole purpose is to bypass every cache in front of the function.
      cache: 'no-store',
      redirect: 'manual',
    });
    return response.ok;
  } catch {
    // A refused connection, a DNS failure, a timeout: all of them mean the live
    // site did not update, which is the only distinction that matters here.
    return false;
  }
}

/** What the admin says out loud after a save. Plain words, no status codes. */
export function describeRevalidation(result: RevalidationResult): string {
  if (result.ok) return 'Saved and live.';
  return "Saved, but the live site hasn't updated yet — Retry.";
}

/**
 * The origin to revalidate.
 *
 * Normally the one the admin itself was served from, so a preview deployment
 * revalidates itself and production revalidates production, with nothing to
 * configure. `REVALIDATE_ORIGIN` overrides it — that override is how the
 * browser suite exercises a genuinely failed revalidation without any
 * fault-injection hook in the app itself.
 */
export function revalidationOrigin(
  requestUrl: URL,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.REVALIDATE_ORIGIN?.trim();
  return override ? override.replace(/\/$/, '') : requestUrl.origin;
}
