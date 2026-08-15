/**
 * Whether a graph this site emits is *right* — the check behind #151 AC 5.
 *
 * A helper rather than a module of the site, for the reason
 * `courses/mirror.test-helper.ts` is one: nothing that renders calls it. Two
 * suites do — `structured-data.test.ts` over every page graph the site can
 * build, and `e2e/structured-data.spec.ts` over the graphs a browser actually
 * receives.
 *
 * **What "validates" means here, and what it does not.** No validator is
 * shipped: the two that matter (Google's Rich Results Test and schema.org's own)
 * are hosted services, and a vendored copy of the vocabulary would be a
 * 400-file dependency that goes stale silently. So this checks the two classes of
 * fault that a generated graph actually produces, and it is deliberately blunt
 * about the boundary between them:
 *
 * 1. **Structural** — a node with no `@type` (a crawler skips it), a `null` or
 *    `undefined` reaching the JSON (`"place": null` is a fact nobody stated), a
 *    relative `@id` or `url` (the commonest way a whole graph is discarded), a
 *    reference to an `@id` no node on the page declares (the dangling pointer
 *    that reads as an unrelated organisation).
 * 2. **Vocabulary** — every type and every property name is checked against
 *    {@link VOCABULARY}, which lists the terms this site publishes and nothing
 *    else. That is a typo net, and typos are what fills Search Console: a
 *    `startdate` or a `courseSchedule` on the wrong node is silent in a browser,
 *    valid JSON, and invisible to a structural check.
 *
 * The list is maintained by hand and that is the point of it: adding a property
 * means looking it up on schema.org once and recording that you did. What this
 * cannot tell you is whether a *value* is one schema.org accepts — a wrong
 * `courseMode` or a mistyped enumeration URL passes. Those are checked by reading
 * the emitters, and by the Rich Results Test against the deployed page.
 */

/**
 * Every type this site publishes, and the properties each is allowed to carry.
 *
 * Checked against schema.org's own vocabulary when added, which is the whole
 * value of writing them out. `@type`, `@id` and `@context` are keywords rather
 * than properties and are allowed everywhere.
 */
const VOCABULARY: Record<string, readonly string[]> = {
  School: [
    'name',
    'description',
    'disambiguatingDescription',
    'url',
    'telephone',
    'email',
    'address',
    'areaServed',
    'knowsAbout',
    'subjectOf',
  ],
  PostalAddress: [
    'streetAddress',
    'addressLocality',
    'addressRegion',
    'postalCode',
    'addressCountry',
  ],
  AdministrativeArea: ['name'],
  WebPage: ['url'],
  BreadcrumbList: ['itemListElement'],
  // No `numberOfItems`: the site states no class count (#247), and an allowlist
  // that still permitted it would let one back in without a word being said.
  ItemList: ['name', 'itemListElement'],
  // `item` names a thing; `url` points at the page for it. A breadcrumb uses the
  // first, a list of classes the second.
  ListItem: ['position', 'name', 'item', 'url'],
  Course: [
    'url',
    'name',
    'description',
    'provider',
    'educationalLevel',
    'typicalAgeRange',
    'audience',
    'educationalCredentialAwarded',
    'coursePrerequisites',
    'timeRequired',
    'offers',
    'hasCourseInstance',
  ],
  CourseInstance: [
    'name',
    'courseMode',
    'location',
    'instructor',
    'courseWorkload',
    'courseSchedule',
    'startDate',
    'endDate',
  ],
  Schedule: [
    'repeatFrequency',
    'repeatCount',
    'byDay',
    'startTime',
    'endTime',
    'scheduleTimezone',
  ],
  EducationalAudience: ['educationalRole', 'audienceType'],
  Offer: ['name', 'price', 'priceCurrency', 'category', 'availability', 'url'],
  Person: ['name'],
  Event: [
    'name',
    'startDate',
    'endDate',
    'eventAttendanceMode',
    'eventStatus',
    'location',
    'description',
    'organizer',
    'url',
  ],
  Place: ['name', 'address'],
};

/** The JSON-LD keywords, which are not properties of anything. */
const KEYWORDS = new Set(['@context', '@type', '@id', '@graph']);

/** What is wrong with a graph, as a list of complaints — empty when nothing is. */
export function jsonLdProblems(graph: object): string[] {
  const problems: string[] = [];
  const nodes = (graph as { '@graph'?: unknown[] })['@graph'] ?? [graph];
  /*
   * What this page declares — and *only* what this page declares.
   *
   * The school's own `@id` is deliberately not seeded in. Seeding it would make
   * one real failure undetectable: a page that refers to the school without
   * carrying the school node points at an entity a crawler has never been given,
   * which is the "describes an unrelated organisation" case itself.
   */
  const declared = new Set<string>();
  const referenced: { id: string; where: string }[] = [];

  const walk = (value: unknown, where: string): void => {
    if (value === null || value === undefined) {
      problems.push(`${where} is ${String(value)} and should have been left out`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${where}[${index}]`));
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      problems.push(`${where} is not a finite number`);
      return;
    }
    if (typeof value !== 'object') return;

    const entries = Object.entries(value as Record<string, unknown>);
    const keys = new Set(entries.map(([key]) => key));
    // A bare `{'@id': …}` is a reference; anything else is a node and needs a type.
    const isReference = keys.size === 1 && keys.has('@id');
    const type = (value as { '@type'?: unknown })['@type'];

    if (isReference) {
      referenced.push({ id: String((value as { '@id': string })['@id']), where });
    } else if (typeof type !== 'string') {
      problems.push(`${where} has no @type`);
    } else if (!VOCABULARY[type]) {
      problems.push(`${where} is a @type this site does not publish: ${type}`);
    }

    const allowed = typeof type === 'string' ? VOCABULARY[type] : undefined;
    for (const [key, child] of entries) {
      if (allowed && !KEYWORDS.has(key) && !allowed.includes(key)) {
        problems.push(`${where}.${key} is not a property of ${String(type)}`);
      }
      if ((key === '@id' || key === 'url') && typeof child === 'string' && !isAbsolute(child)) {
        problems.push(`${where}.${key} is not an absolute URL: ${child}`);
      }
      walk(child, `${where}.${key}`);
    }
  };

  nodes.forEach((node, index) => {
    const id = (node as { '@id'?: unknown })['@id'];
    if (typeof id === 'string') declared.add(id);
    walk(node, `@graph[${index}]`);
  });

  for (const reference of referenced) {
    if (!declared.has(reference.id)) {
      problems.push(`${reference.where} points at an @id nothing declares: ${reference.id}`);
    }
  }

  return problems;
}

function isAbsolute(value: string): boolean {
  return /^https?:\/\//.test(value);
}
