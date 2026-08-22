import { describe, expect, it } from 'vitest';

import { breadcrumbJsonLd } from './breadcrumbs.js';
import { SEEDED_EVENTS } from './calendar/event.js';
import { eventJsonLd } from './calendar/structured-data.js';
import { CALENDAR_PATH } from './calendar/views.js';
import { CATALOGUE } from './courses/catalogue.js';
import { courseJsonLd, courseListJsonLd } from './courses/structured-data.js';
import { CLASS_VIEWS } from './courses/views.js';
import type { SchoolDetails } from './db/schema.js';
import { SEEDED_MONEY_SETTINGS } from './money/settings.js';
import { publicPaths } from './routes.js';
import { SCHOOL_DESCRIPTION } from './site.js';
import {
  jsonLdGraph,
  parsePostalAddress,
  renderJsonLd,
  schoolId,
  schoolJsonLd,
  schoolRef,
} from './structured-data.js';
import { jsonLdProblems } from './structured-data.test-helper.js';

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
  giveUrl: 'https://secure.myvanco.com/L-ZZ7H/home',
  payOnlineUrl: '',
  givingLinkTemplate: '',
  bannerEnabled: false,
  bannerMessage: '',
  bannerDate: null,
  bannerLink: '',
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
    expect(node['@type']).toBe('School');
  });

  // The identifier every other node on the page points at (#151). Held here
  // rather than rebuilt, so a class's `provider` and this cannot drift apart.
  it('is identified by the origin, not by the page it was found on', () => {
    expect(node['@id']).toBe(schoolId('https://example.org'));
    expect(schoolId('https://example.org/about')).toBe('https://example.org/#school');
    expect(schoolRef('https://example.org')).toEqual({ '@id': node['@id'] });
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

  // #298 — the school welcomes cyber school families on the same terms, and
  // this entry is the only machine-readable place that says who it is for. Not
  // an `audience` property, which would be the obvious way to say it and is not
  // a property of `Organization`; the allowlist rejects it.
  it('names both audiences it serves, not homeschooling families alone', () => {
    expect(node.knowsAbout).toContain('Hybrid programs for homeschooling and cyber school families');
    expect(node.audience).toBeUndefined();
  });

  // The audience widened; what the school *is* did not (#298). These are
  // different claims and #137 is the release that proves conflating them ships.
  it('leaves the canonical description saying nothing about who it serves', () => {
    expect(SCHOOL_DESCRIPTION).not.toMatch(/homeschool|cyber/i);
  });

  // #137 — the markup said microschool while the hero said homeschool. Both are
  // read from one constant now, and this is the half a search engine believes.
  it('says what kind of school it is in the site’s one canonical wording', () => {
    expect(node.disambiguatingDescription).toBe(SCHOOL_DESCRIPTION);
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

describe('the page’s graph', () => {
  /*
   * One script, one context, several nodes (#151). The context is stated once
   * here, so a node cannot be read against a vocabulary the page never declared.
   */
  it('declares the vocabulary once, for every node on the page', () => {
    const graph = jsonLdGraph(schoolJsonLd(DETAILS), { '@type': 'BreadcrumbList' }) as Record<
      string,
      unknown
    >;
    expect(graph['@context']).toBe('https://schema.org');
    expect((graph['@graph'] as unknown[]).map((node) => (node as { '@type': string })['@type'])).toEqual([
      'School',
      'BreadcrumbList',
    ]);
  });

  // A page with no breadcrumb and no course is one school node, not a graph
  // with holes in it — the builders return `undefined` and this drops them.
  it('drops the nodes a page does not have', () => {
    const graph = jsonLdGraph(schoolJsonLd(DETAILS), undefined, null) as Record<string, unknown>;
    expect(graph['@graph']).toHaveLength(1);
  });
});

/**
 * #151 AC 5 — the emitted structured data validates, with no errors.
 *
 * Run over the graphs the site actually builds rather than over a sample: every
 * class, every list view, the seeded events, and a breadcrumb for every public
 * route. `structured-data.test-helper.ts` says what "validates" is checked as and
 * what it cannot check; in short, the structural faults a generated graph
 * produces, plus every type and property name against the list of terms this site
 * publishes — which is the typo net, and typos are what fills Search Console.
 */
describe('the graphs the site emits', () => {
  const SITE = 'https://example.org';
  const { rates } = SEEDED_MONEY_SETTINGS;

  it('has nothing wrong with a class page’s graph', () => {
    for (const course of CATALOGUE) {
      const graph = jsonLdGraph(
        schoolJsonLd(DETAILS, SITE),
        breadcrumbJsonLd(`/classes/${course.slug}`, course.title, SITE),
        courseJsonLd({ course, rates, instructorName: 'A Teacher', site: SITE }),
      );
      expect(jsonLdProblems(graph), course.slug).toEqual([]);
    }
  });

  it('has nothing wrong with a class list view’s graph', () => {
    for (const view of CLASS_VIEWS) {
      const graph = jsonLdGraph(
        schoolJsonLd(DETAILS, SITE),
        breadcrumbJsonLd(view.path, view.title, SITE),
        courseListJsonLd(CATALOGUE, view.path, SITE),
      );
      expect(jsonLdProblems(graph), view.path).toEqual([]);
    }
  });

  it('has nothing wrong with the calendar page’s graph', () => {
    const graph = jsonLdGraph(
      schoolJsonLd(DETAILS, SITE),
      breadcrumbJsonLd(CALENDAR_PATH, 'Calendar', SITE),
      ...SEEDED_EVENTS.map((seed) =>
        eventJsonLd({ event: { ...seed, lastEditedBy: null, lastEditedAt: null }, site: SITE }),
      ),
    );
    expect(jsonLdProblems(graph)).toEqual([]);
  });

  it('has nothing wrong with any other page’s graph', () => {
    for (const path of publicPaths()) {
      const graph = jsonLdGraph(
        schoolJsonLd(DETAILS, SITE),
        breadcrumbJsonLd(path, 'The page', SITE),
      );
      expect(jsonLdProblems(graph), path).toEqual([]);
    }
  });

  /*
   * The other half: the check has to be capable of failing. Each of these is a
   * real mistake — a node with no type, a blank field emitted as null, a
   * relative URL, and a reference to a school this page never described.
   */
  it.each([
    ['a node with no type', { name: 'Something' }],
    ['a field left as null', { '@type': 'Event', location: null }],
    ['a relative URL', { '@type': 'Event', url: '/current-families/calendar' }],
    ['a dangling reference', { '@type': 'Event', organizer: { '@id': 'https://elsewhere/#school' } }],
    // The vocabulary half: a mistyped property is valid JSON, silent in a
    // browser, and ignored by a crawler.
    ['a mistyped property', { '@type': 'Event', startdate: '2026-10-17' }],
    ['a property of another type', { '@type': 'Event', courseSchedule: 'weekly' }],
    ['a type this site does not publish', { '@type': 'Restaurant', name: 'Not us' }],
  ])('reports %s', (_case, node) => {
    expect(jsonLdProblems(jsonLdGraph(node))).not.toEqual([]);
  });
});

describe('putting it in the page', () => {
  it('cannot close the script tag it sits inside', () => {
    const rendered = renderJsonLd({ name: '</script><img onerror=alert(1)>' });
    expect(rendered).not.toContain('</script>');
    expect(JSON.parse(rendered).name).toBe('</script><img onerror=alert(1)>');
  });
});
