import { expect, test } from '@playwright/test';

import { SEEDED_POLICIES } from '../src/lib/policies/policy.js';

/**
 * The policies page and the two file routes, in a browser (#28).
 *
 * The store's own guarantees — that a replacement appends rather than
 * overwrites, that the address never moves — are proved against real Postgres in
 * `src/lib/policies/store.test.ts`, and driven through the admin as Jill would
 * in `admin.spec.ts`. What is only true over HTTP is proved here: the content
 * type, the two opposite caching rules, and that a slug with nothing behind it
 * answers 404 rather than an empty PDF.
 *
 * The files these assertions download are the suite's stand-in PDFs, attached to
 * every seeded policy by `seedSuitePolicyFiles` in `src/lib/db/client.ts` — the
 * ephemeral database applies migrations only, and the migrations seed the rows
 * without bytes.
 *
 * Zero axe violations at all five widths is `accessibility.spec.ts`'s, where
 * `/policies` is one line on the surface list.
 */

/** The Handbook: first on the list, and the one a new family is sent to. */
const HANDBOOK = SEEDED_POLICIES.find((policy) => policy.slug === 'handbook')!;

/** One parents sign, so the marker has somewhere to be asserted. */
const SIGNED = SEEDED_POLICIES.find((policy) => policy.signed)!;

/** One they do not, so the marker is proved absent as well as present. */
const UNSIGNED = SEEDED_POLICIES.find((policy) => !policy.signed)!;

test.describe('the policies page', () => {
  test('lists every policy with the line that says what it is', async ({ page }) => {
    await page.goto('/policies');

    for (const policy of SEEDED_POLICIES) {
      const entry = page.locator(`[id="${policy.slug}"]`);
      await expect(entry, policy.slug).toHaveCount(1);
      await expect(entry.getByRole('link', { name: policy.title })).toBeVisible();
      // AC 5: the reason a parent is not opening a twenty-page PDF to find out
      // whether it is the one they were asked for.
      await expect(entry, policy.slug).toContainText(policy.description);
    }
  });

  test('dates each one, in words and in a machine-readable attribute', async ({ page }) => {
    await page.goto('/policies');

    const entry = page.locator(`[id="${HANDBOOK.slug}"]`);
    await expect(entry).toContainText('Updated');
    await expect(entry.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  });

  test('says which documents parents sign, and only about those', async ({ page }) => {
    await page.goto('/policies');

    await expect(page.locator(`[id="${SIGNED.slug}"]`)).toContainText('Parents sign this');
    await expect(page.locator(`[id="${UNSIGNED.slug}"]`)).not.toContainText('Parents sign this');
  });

  test('is in the school’s order, not alphabetical by accident', async ({ page }) => {
    await page.goto('/policies');

    const rendered = await page
      .locator('.policy-list > li')
      .evaluateAll((items) => items.map((item) => item.id));

    // Only the seeded four are asserted on, and only their relative order: the
    // admin suite creates policies of its own against this same database, and a
    // test that broke when it did would be measuring the other suite's state.
    const seeded = new Set(SEEDED_POLICIES.map((policy) => policy.slug));
    expect(rendered.filter((slug) => seeded.has(slug))).toEqual(
      [...SEEDED_POLICIES].sort((a, b) => a.position - b.position).map((policy) => policy.slug),
    );
  });

  test('is reachable from the footer, which is where a current family looks', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Policies' }).click();
    await expect(page).toHaveURL(/\/policies$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Policies' })).toBeVisible();
  });

  // AC 6. The live Apply Now checklist names a Homework Policy as a third
  // document parents sign; the school decided on #14 not to publish it, so
  // naming it anywhere is telling a family to read something that does not
  // exist. Asserted across the pages a parent actually walks.
  test('names no Homework Policy on any page a parent reads', async ({ page }) => {
    for (const path of ['/', '/policies', '/classes', '/news']) {
      await page.goto(path);
      const text = (await page.locator('body').innerText()).toLowerCase();
      expect(text, path).not.toContain('homework policy');
    }
  });
});

test.describe('a policy’s fixed address', () => {
  test('serves the current document as a PDF, inline, under its own filename', async ({
    request,
  }) => {
    const response = await request.get(`/policies/${HANDBOOK.slug}.pdf`);

    expect(response.status()).toBe(200);
    // AC 7, the content-type half.
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['content-disposition']).toContain('inline');
    expect((await response.body()).length).toBeGreaterThan(0);
  });

  test('is what the page links to, with no redirect on the way', async ({ page, request }) => {
    await page.goto('/policies');
    const href = await page
      .locator(`[id="${HANDBOOK.slug}"]`)
      .getByRole('link', { name: HANDBOOK.title })
      .getAttribute('href');

    expect(href).toBe(`/policies/${HANDBOOK.slug}.pdf`);

    // AC 1's other half: the address answers for itself. A 3xx here would mean
    // the fixed URL was a pointer at a versioned one, which is the design the
    // ticket rules out.
    const response = await request.get(href!, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });

  test('revalidates rather than caching a document that can be replaced', async ({ request }) => {
    const response = await request.get(`/policies/${HANDBOOK.slug}.pdf`);

    // ADR-0005: `immutable` on a mutable address is the setting that defeats
    // AC 1. A strong ETag buys the same bytes at the cost of one round trip.
    const cacheControl = response.headers()['cache-control'];
    expect(cacheControl).toContain('must-revalidate');
    expect(cacheControl).not.toContain('immutable');
    expect(response.headers()['etag']).toMatch(/^"[\w-]+"$/);
  });

  test('answers an unchanged document with a 304 and no body', async ({ request }) => {
    const first = await request.get(`/policies/${HANDBOOK.slug}.pdf`);
    const etag = first.headers()['etag'];

    const second = await request.get(`/policies/${HANDBOOK.slug}.pdf`, {
      headers: { 'if-none-match': etag },
    });
    expect(second.status()).toBe(304);
  });

  test('answers a slug with no policy behind it with a 404, not an empty PDF', async ({
    request,
  }) => {
    const response = await request.get('/policies/not-a-policy.pdf');
    expect(response.status()).toBe(404);
  });
});

test.describe('a retained version’s address', () => {
  test('serves it, and this is where the long immutable cache belongs', async ({ request }) => {
    const response = await request.get(`/policies/${HANDBOOK.slug}/v1.pdf`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    // AC 7, the caching half: a version never changes, so a year is true here.
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('404s a version that was never uploaded, and a segment that is not one', async ({
    request,
  }) => {
    expect((await request.get(`/policies/${HANDBOOK.slug}/v99.pdf`)).status()).toBe(404);
    expect((await request.get(`/policies/${HANDBOOK.slug}/latest.pdf`)).status()).toBe(404);
  });
});
