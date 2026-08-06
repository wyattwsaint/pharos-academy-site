import type { SchoolDetails } from './db/schema.js';
import { absoluteUrl } from './routes.js';
import { SCHOOL_NAME, SITE_URL } from './site.js';

/**
 * School / LocalBusiness structured data (#30 AC 6).
 *
 * Findability here is not about the name. "Pharos Academy" is dominated by an
 * unrelated Bronx charter school and no amount of markup changes that; the
 * inquiries worth having come from "classical Christian school near Harrisburg"
 * and "homeschool hybrid program Cumberland County". Those are *category and
 * place* searches, and what answers them is a real address, a real service
 * area, and an entity type that says what kind of thing this is.
 *
 * So this emits one `School` — which is a `LocalBusiness` in schema.org's own
 * hierarchy, so one node satisfies both halves of the criterion rather than two
 * competing ones — with `address`, `areaServed`, and the pages that describe
 * the school.
 *
 * **Every value is read from the school details row.** Not one of them is typed
 * here, for the reason the footer is not: the address appears in 22 hand-typed
 * places on the live site and has already drifted, and markup that disagrees
 * with the page it is on is worse than no markup, because it is what a search
 * engine believes.
 */

/** The parts of a US postal address schema.org wants separately. */
export type PostalAddress = {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: 'US';
};

/**
 * Split the school's address block into schema.org's fields.
 *
 * The row holds it the way Jill types it — street on one line, "Enola, PA
 * 17025" on the next — because that is how it is printed. This reads that
 * shape and refuses to guess at anything else: an address that does not parse
 * returns `undefined` and the markup simply omits the field rather than
 * publishing a locality of "17025".
 */
export function parsePostalAddress(address: string): PostalAddress | undefined {
  const lines = address
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return undefined;

  const last = lines[lines.length - 1]!;
  const match = /^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(last);
  if (!match) return undefined;

  return {
    streetAddress: lines.slice(0, -1).join(', '),
    addressLocality: match[1]!,
    addressRegion: match[2]!,
    postalCode: match[3]!,
    addressCountry: 'US',
  };
}

/**
 * The JSON-LD node for the school.
 *
 * `areaServed` is the service-area language the ticket asks for, and it is the
 * one list here that is not read from a row: it is the counties a hybrid
 * microschool in Enola actually draws from, and they are named because "near
 * Harrisburg" is a phrase a parent types and not one that appears in an
 * address. Cumberland is where Enola is; Dauphin and Perry are across the two
 * bridges.
 */
export function schoolJsonLd(details: SchoolDetails, site: string | URL = SITE_URL) {
  const address = parsePostalAddress(details.address);

  return {
    '@context': 'https://schema.org',
    '@type': 'School',
    '@id': `${new URL(site).origin}/#school`,
    name: SCHOOL_NAME,
    description: details.mission,
    url: absoluteUrl(site, '/'),
    telephone: details.phone,
    email: details.email,
    ...(address ? { address: { '@type': 'PostalAddress', ...address } } : {}),
    areaServed: ['Cumberland County, Pennsylvania', 'Dauphin County, Pennsylvania', 'Perry County, Pennsylvania'].map(
      (name) => ({ '@type': 'AdministrativeArea', name }),
    ),
    // What the school is, in the words a category search uses. Not a keyword
    // list — these are the three facts that distinguish it from every other
    // school in the county, and each of them is true.
    knowsAbout: ['Classical education', 'Christian education', 'Hybrid homeschool programs'],
    // The pages that say more, so the entity is anchored to real content rather
    // than to a name alone.
    subjectOf: ['/about', '/about/beliefs', '/admissions'].map((path) => ({
      '@type': 'WebPage',
      url: absoluteUrl(site, path),
    })),
  };
}

/** The node, serialised for a `<script type="application/ld+json">`. */
export function renderJsonLd(value: unknown): string {
  // `<` escaped so a value containing `</script>` cannot close the tag it is
  // inside. Nothing in the school details row should contain one; a school
  // website is not the place to find that out the hard way.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
