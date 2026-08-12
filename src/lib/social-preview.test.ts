import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SCHOOL_NAME, SITE_URL } from './site.js';
import { SOCIAL_PREVIEW_IMAGE, canonicalUrl, pageTitle, socialPreviewTags } from './social-preview.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The tags for one page, as a lookup, which is how a scraper reads them. */
function tagsFor(pathname: string, title = 'About', description = 'What Pharos Academy is.') {
  const tags = socialPreviewTags({ title, description, pathname, site: SITE_URL });
  return new Map(tags.map((tag) => [tag.property ?? tag.name, tag.content]));
}

describe('the link-preview card', () => {
  it('names the page and the school, the way the tab does', () => {
    const tags = tagsFor('/about');

    expect(tags.get('og:title')).toBe(pageTitle('About'));
    expect(tags.get('og:title')).toContain(SCHOOL_NAME);
    // Twitter falls back to Open Graph for most fields, but a card that states
    // one and not the other is a card that reads differently on X than in a
    // text message — which is the drift this module exists to prevent.
    expect(tags.get('twitter:title')).toBe(tags.get('og:title'));
  });

  /**
   * The point of the ticket's "rather than a single site-wide default": the
   * whole failure mode is nine pages that all preview as the homepage, so a
   * parent forwarded the class timetable sees the school's front door instead.
   */
  it('carries the page’s own title and description, not one default', () => {
    const about = tagsFor('/about', 'About', 'Who we are.');
    const classes = tagsFor('/classes', 'Classes', 'What we teach.');

    expect(about.get('og:title')).not.toBe(classes.get('og:title'));
    expect(about.get('og:description')).toBe('Who we are.');
    expect(classes.get('og:description')).toBe('What we teach.');
    expect(classes.get('twitter:description')).toBe('What we teach.');
  });

  it('points at the page it is on, absolutely and canonically', () => {
    expect(tagsFor('/about').get('og:url')).toBe('https://www.pharosacademy.net/about');
    expect(tagsFor('/').get('og:url')).toBe('https://www.pharosacademy.net/');
    // The sitemap lists `/about`, so the card must not invent `/about/`: two
    // URLs for one page is what a canonical exists to stop.
    expect(tagsFor('/about/').get('og:url')).toBe('https://www.pharosacademy.net/about');
  });

  it('is the type of thing it actually is', () => {
    expect(tagsFor('/classes/latin').get('og:type')).toBe('website');
    expect(tagsFor('/').get('og:site_name')).toBe(SCHOOL_NAME);
  });

  /**
   * A relative `og:image` is the commonest single reason a card renders as text
   * alone: no scraper resolves one against the page it was found on.
   */
  it('gives the image as an absolute URL, described and measured', () => {
    const tags = tagsFor('/');
    const image = `${SITE_URL}${SOCIAL_PREVIEW_IMAGE.path}`;

    expect(tags.get('og:image')).toBe(image);
    expect(tags.get('og:image:secure_url')).toBe(image);
    expect(tags.get('twitter:image')).toBe(image);
    expect(tags.get('og:image:width')).toBe('1200');
    expect(tags.get('og:image:height')).toBe('630');
    expect(tags.get('og:image:type')).toBe('image/jpeg');
    expect(tags.get('og:image:alt')).toBe(SOCIAL_PREVIEW_IMAGE.alt);
    expect(tags.get('twitter:image:alt')).toBe(SOCIAL_PREVIEW_IMAGE.alt);
  });

  /**
   * `summary_large_image` is the whole difference between the card this ticket
   * asks for and a 120 px thumbnail beside the text.
   */
  it('asks for the large card rather than the thumbnail', () => {
    expect(tagsFor('/').get('twitter:card')).toBe('summary_large_image');
  });

  it('states each tag in the vocabulary its reader parses', () => {
    const tags = socialPreviewTags({ title: 'Home', description: 'x', pathname: '/', site: SITE_URL });

    expect(tags.filter((tag) => tag.property?.startsWith('og:')).length).toBeGreaterThan(0);
    // Open Graph is read off `property`, Twitter off `name`. A tag written with
    // the other attribute is a tag its reader does not see at all.
    for (const tag of tags) {
      if (tag.property) expect(tag.property.startsWith('og:')).toBe(true);
      if (tag.name) expect(tag.name.startsWith('twitter:')).toBe(true);
    }
  });
});

/**
 * The declared dimensions are what a scraper lays the card out from before it
 * has fetched the file. Declaring 1200×630 over an image that is not lets the
 * two drift silently, and the symptom — a card that renders small — appears in
 * a chat app, where nothing in this repo would ever see it.
 */
describe('the preview image on disk', () => {
  it('is a JPEG at exactly the size the tags claim', () => {
    const file = readFileSync(path.join(root, 'public', SOCIAL_PREVIEW_IMAGE.path));

    expect(file.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(jpegSize(file)).toEqual({
      width: SOCIAL_PREVIEW_IMAGE.width,
      height: SOCIAL_PREVIEW_IMAGE.height,
    });
  });

  /** Scrapers time out. The build lands around 190 KB; this is the ceiling. */
  it('is small enough to be fetched by a scraper in a hurry', () => {
    const file = readFileSync(path.join(root, 'public', SOCIAL_PREVIEW_IMAGE.path));
    expect(file.byteLength).toBeLessThan(300 * 1024);
  });
});

/**
 * Reads a baseline or progressive JPEG's frame header. Walking the marker
 * segments rather than adding an image library for two numbers.
 */
function jpegSize(file: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < file.length) {
    if (file[offset] !== 0xff) throw new Error(`not a marker at ${offset}`);
    const marker = file[offset + 1]!;
    const length = file.readUInt16BE(offset + 2);
    // SOF0/1/2/3 and the rest of the SOF family, minus the markers that share
    // the 0xC0–0xCF range without being frame headers (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: file.readUInt16BE(offset + 5), width: file.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('no frame header found');
}

describe('the canonical URL', () => {
  it('is the origin’s, whatever origin the page was rendered under', () => {
    expect(canonicalUrl('https://preview.example.com', '/classes')).toBe('https://preview.example.com/classes');
  });
});
