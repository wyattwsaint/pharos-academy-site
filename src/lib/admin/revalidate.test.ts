import { describe, expect, it } from 'vitest';

import { describeRevalidation, revalidateAll, revalidationOrigin } from './revalidate.js';

/** A fetch that answers every path the same way. */
function answering(status: number, headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response('', { status, headers })) as unknown as typeof fetch;
}

describe('revalidateAll', () => {
  it('asks for every public path, in parallel, with the bypass token', async () => {
    const seen: { url: string; token: string | null; method: string }[] = [];
    let inFlight = 0;
    let peak = 0;

    const fetchImpl = (async (input: string, init: RequestInit) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push({
        url: String(input),
        token: new Headers(init.headers).get('x-prerender-revalidate'),
        method: init.method ?? 'GET',
      });
      inFlight -= 1;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await revalidateAll({
      origin: 'https://example.test',
      bypassToken: 'token-abc',
      paths: ['/', '/about', '/giving'],
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.failedPaths).toEqual([]);
    expect(seen.map((call) => call.url).sort()).toEqual([
      'https://example.test/',
      'https://example.test/about',
      'https://example.test/giving',
    ]);
    expect(seen.every((call) => call.token === 'token-abc')).toBe(true);
    expect(peak).toBeGreaterThan(1);
  });

  it('reports the paths that failed rather than the first error', async () => {
    const fetchImpl = (async (input: string) =>
      String(input).endsWith('/giving')
        ? new Response('', { status: 500 })
        : new Response('', { status: 200 })) as unknown as typeof fetch;

    const result = await revalidateAll({
      origin: 'https://example.test',
      bypassToken: 'token-abc',
      paths: ['/', '/giving'],
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.failedPaths).toEqual(['/giving']);
  });

  it('counts a refused connection as a failure, not a crash', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await revalidateAll({
      origin: 'http://127.0.0.1:1',
      bypassToken: 'token-abc',
      paths: ['/'],
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.failedPaths).toEqual(['/']);
  });

  it('fails closed when there is no bypass token to send', async () => {
    const result = await revalidateAll({
      origin: 'https://example.test',
      bypassToken: '',
      paths: ['/'],
      fetchImpl: answering(200),
    });

    expect(result.ok).toBe(false);
    expect(result.failedPaths).toEqual(['/']);
  });

  it('is a success, not a vacuous one, when there are no paths', async () => {
    const result = await revalidateAll({
      origin: 'https://example.test',
      bypassToken: 'token-abc',
      paths: [],
      fetchImpl: answering(200),
    });

    expect(result.ok).toBe(true);
  });
});

describe('describeRevalidation', () => {
  it('says the save is live when every path revalidated', () => {
    expect(describeRevalidation({ ok: true, failedPaths: [] })).toBe('Saved and live.');
  });

  it('says the save landed but the site has not, and offers a retry', () => {
    const message = describeRevalidation({ ok: false, failedPaths: ['/', '/giving'] });
    expect(message).toContain('Saved');
    expect(message).toContain("the live site hasn't updated yet");
    expect(message).toContain('Retry');
  });
});

describe('revalidationOrigin', () => {
  it('is the origin the admin itself was served from', () => {
    expect(revalidationOrigin(new URL('https://pharos.test/admin/school-details'), {})).toBe(
      'https://pharos.test',
    );
  });

  it('can be overridden, which is how a failed revalidation is exercised', () => {
    expect(
      revalidationOrigin(new URL('https://pharos.test/admin/school-details'), {
        REVALIDATE_ORIGIN: 'http://127.0.0.1:1',
      }),
    ).toBe('http://127.0.0.1:1');
  });
});
