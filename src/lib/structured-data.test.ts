import { describe, expect, it } from 'vitest';

import type { SchoolDetails } from './db/schema.js';
import { publicPaths } from './routes.js';
import { parsePostalAddress, renderJsonLd, schoolJsonLd } from './structured-data.js';

/**
 * #30 AC 6 — the structured data validates.
 *
 * "Validates" is checked here as the two things that actually go wrong rather
 * than by shipping a schema validator: a field that is present but wrong (an
 * address parsed into the wrong slots), and a field that is absent because
 * somebody renamed the row it was read from. Both are silent in a browser and
 * both are what a search engine believes.
 */
const DETAILS: SchoolDetails = {
  id: 1,
  address: '9 Sherwood Drive\nEnola, PA 17025',
  phone: '(717) 497-0896',
  email: 'office@pharosacademy.net',
  schoolYearStart: '2026-08-31',
  mission: 'Partnering with parents to provide academic rigor and mentoring.',
  vision: 'Preparing students to honor Christ the Lord as holy.',
  giveUrl: 'https://secure.myvanco.com/YH8R/home',
  lastEditedBy: null,
  lastEditedAt: null,
};

describe('reading the school’s address', () => {
  it('splits the block the school types into the fields schema.org wants', () => {
    expect(parsePostalAddress(DETAILS.address)).toEqual({
      streetAddress: '9 Sherwood Drive',
      addressLocality: 'Enola',
      addressRegion: 'PA',
      postalCode: '17025',
      addressCountry: 'US',
    });
  });

  it('keeps a second street line rather than dropping it', () => {
    expect(
      parsePostalAddress('Enola First Church of God\n9 Sherwood Drive\nEnola, PA 17025')
        ?.streetAddress,
    ).toBe('Enola First Church of God, 9 Sherwood Drive');
  });

  /*
   * The important half. An address the school reformats — a missing comma, a
   * ZIP+4 typed onto its own line — must produce *no* address rather than a
   * guessed one, because a locality of "17025" is a wrong fact published
   * confidently, and the page beside it would still read correctly.
   */
  it.each([
    ['one line only', '9 Sherwood Drive'],
    ['no comma before the state', '9 Sherwood Drive\nEnola PA 17025'],
    ['no postcode', '9 Sherwood Drive\nEnola, PA'],
    ['nothing at all', ''],
  ])('refuses to guess when the address is %s', (_case, address) => {
    expect(parsePostalAddress(address)).toBeUndefined();
  });
});

describe('the school’s structured data', () => {
  const node = schoolJsonLd(DETAILS, 'https://example.org') as Record<string, unknown>;

  it('is a School, which schema.org already counts as a LocalBusiness', () => {
    expect(node['@context']).toBe('https://schema.org');
    expect(node['@type']).toBe('School');
  });

  it('carries the school’s own address, phone and email, not typed ones', () => {
    expect(node.telephone).toBe(DETAILS.phone);
    expect(node.email).toBe(DETAILS.email);
    expect(node.description).toBe(DETAILS.mission);
    expect(node.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Enola' });
  });

  // The whole point of the markup: local and category discovery, since the
  // school's own name is dominated by an unrelated Bronx charter school.
  it('names the counties it serves and what kind of school it is', () => {
    expect(JSON.stringify(node.areaServed)).toContain('Cumberland County');
    expect(node.knowsAbout).toContain('Classical education');
  });

  it('omits the address entirely rather than half of one', () => {
    const unparsed = schoolJsonLd({ ...DETAILS, address: 'somewhere in Enola' }) as Record<
      string,
      unknown
    >;
    expect(unparsed.address).toBeUndefined();
    expect(unparsed.telephone).toBe(DETAILS.phone);
  });

  // A node pointing at a page this site does not serve is a claim a crawler
  // follows into a 404.
  it('links only pages this site actually serves', () => {
    const served = new Set(publicPaths());
    for (const page of node.subjectOf as { url: string }[]) {
      expect(served, page.url).toContain(new URL(page.url).pathname);
    }
  });
});

describe('putting it in the page', () => {
  it('cannot close the script tag it sits inside', () => {
    const rendered = renderJsonLd({ name: '</script><img onerror=alert(1)>' });
    expect(rendered).not.toContain('</script>');
    expect(JSON.parse(rendered).name).toBe('</script><img onerror=alert(1)>');
  });
});
