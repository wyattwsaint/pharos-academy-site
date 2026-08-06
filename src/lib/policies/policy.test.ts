import { describe, expect, it } from 'vitest';

import { policySlug, publishedPolicies, SEEDED_POLICIES } from './policy.js';
import {
  fileSizeLabel,
  parseVersionSegment,
  policyPath,
  policyVersionPath,
  updatedOnAttribute,
  updatedOnLabel,
} from './views.js';

/**
 * The parts of #28 that are decisions rather than storage.
 *
 * The addressing is most of it: a slug that is minted once and a path built in
 * one place are what make "every link that ever pointed at it keeps working"
 * something the code enforces rather than something a template remembers.
 */

describe('the seeded policies', () => {
  it('carries the four the school publishes for parents', () => {
    expect(SEEDED_POLICIES.map((policy) => policy.title)).toEqual([
      'Handbook',
      'Code of Conduct',
      'Child Protection',
      'Child Protection Background Check',
    ]);
  });

  // The ticket's clearest negative requirement. The live Apply Now checklist
  // names a Homework Policy as a third document parents sign and the school
  // has never published it; #14 decided it is not going to be. Naming it here
  // would be the whole of the mistake.
  it('names no Homework Policy anywhere', () => {
    const text = JSON.stringify(SEEDED_POLICIES).toLowerCase();
    expect(text).not.toContain('homework');
  });

  // Hiring material off the parent path (#18 §5). It belongs on `/teach`.
  it('does not put the Teacher Contract on the parent path', () => {
    const text = JSON.stringify(SEEDED_POLICIES).toLowerCase();
    expect(text).not.toContain('teacher contract');
  });

  it('gives every one of them a sentence saying what it is', () => {
    for (const policy of SEEDED_POLICIES) {
      expect(policy.description.length, policy.title).toBeGreaterThan(40);
      expect(policy.description.endsWith('.'), policy.title).toBe(true);
    }
  });

  it('orders them without a collision', () => {
    const positions = SEEDED_POLICIES.map((policy) => policy.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('points each at a file the mirror actually has', () => {
    for (const policy of SEEDED_POLICIES) {
      expect(policy.source, policy.title).toMatch(/^docs\/mirror\/pdf\/.+\.pdf$/);
    }
  });
});

describe('a policy’s address', () => {
  it('is made from the title', () => {
    expect(policySlug('Code of Conduct')).toBe('code-of-conduct');
    expect(policySlug('Child Protection Background Check')).toBe(
      'child-protection-background-check',
    );
  });

  it('drops punctuation and accents rather than putting them in a URL', () => {
    expect(policySlug('Parents’ Handbook (2026)')).toBe('parents-handbook-2026');
  });

  it('refuses a title with nothing addressable in it', () => {
    expect(() => policySlug('!!!')).toThrow(/no letters or numbers/);
  });

  it('serves the current document at a path with no version in it', () => {
    // The whole point: this string cannot change when the file does.
    expect(policyPath('handbook')).toBe('/policies/handbook.pdf');
  });

  it('gives each retained version its own address', () => {
    expect(policyVersionPath('handbook', 1)).toBe('/policies/handbook/v1.pdf');
    expect(policyVersionPath('handbook', 12)).toBe('/policies/handbook/v12.pdf');
  });

  it('reads a version segment back, and refuses anything else', () => {
    expect(parseVersionSegment('v3')).toBe(3);
    expect(parseVersionSegment('3')).toBeUndefined();
    expect(parseVersionSegment('v0')).toBeUndefined();
    expect(parseVersionSegment('v-1')).toBeUndefined();
    expect(parseVersionSegment('vlatest')).toBeUndefined();
  });
});

describe('what a parent is shown', () => {
  it('leaves out a policy that has no document yet', () => {
    const listed = publishedPolicies([
      { slug: 'handbook', version: 1, updatedAt: new Date('2026-07-23T00:00:00Z') },
      { slug: 'brand-new', version: null, updatedAt: null },
    ]);
    expect(listed.map((policy) => policy.slug)).toEqual(['handbook']);
  });

  // The narrowing is the reason the public page prints the date without a
  // non-null assertion, so it is asserted rather than assumed: what comes back
  // is a `Date`, not a `Date | null` that happens to be set today.
  it('hands back policies whose date is a date', () => {
    const [listed] = publishedPolicies([
      { slug: 'handbook', version: 1, updatedAt: new Date('2026-07-23T00:00:00Z') },
    ]);
    expect(updatedOnAttribute(listed!.updatedAt)).toBe('2026-07-23');
  });
});

describe('the updated date', () => {
  // The same UTC trap the announcements' posted date has: a timestamp rendered
  // in a timezone behind Greenwich prints the previous day, so a document
  // uploaded on the 23rd would read "Updated 22 July" west of London.
  it('prints the day the file was uploaded, in UTC', () => {
    const uploaded = new Date('2026-07-23T02:00:00Z');
    expect(updatedOnLabel(uploaded)).toBe('23 July 2026');
    expect(updatedOnAttribute(uploaded)).toBe('2026-07-23');
  });
});

describe('a file size', () => {
  it('is printed in whole kilobytes', () => {
    expect(fileSizeLabel(178_669)).toBe('174 KB');
  });

  it('never rounds a real file down to nothing', () => {
    expect(fileSizeLabel(12)).toBe('1 KB');
  });
});
