import { describe, expect, it } from 'vitest';

import { CATALOGUE } from './catalogue.js';
import { durationLabel, ENROLMENT_UNITS, RATE_TIERS, STAGES } from './course.js';
import { DAY_TRACKS, timeLabel } from './schedule.js';
import { MIRROR_COURSES, mirrorFor, sameText } from './mirror.test-helper.js';

/**
 * The catalogue against the capture of the live site.
 *
 * The seed is authored — the school publishes these nineteen courses across
 * nine artefacts that disagree — so what is checked here is that the authoring
 * did not *lose* anything: same nineteen, same titles, same times, same ages,
 * same instructors, same fees.
 */

/** Up to the first full stop, apostrophes normalised. */
function firstSentence(value: string): string {
  return sameText(value).split('. ')[0]?.replace(/\.$/, '') ?? '';
}

describe('the catalogue', () => {
  it('holds all nineteen courses, and only those', () => {
    expect(CATALOGUE).toHaveLength(19);
    expect(MIRROR_COURSES).toHaveLength(19);
    expect(CATALOGUE.map((course) => sameText(course.title)).sort()).toEqual(
      MIRROR_COURSES.map((course) => sameText(course.title)).sort(),
    );
  });

  it('gives every course a unique slug, which is its address', () => {
    const slugs = CATALOGUE.map((course) => course.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('stays inside the vocabulary', () => {
    for (const course of CATALOGUE) {
      expect(ENROLMENT_UNITS, course.title).toContain(course.enrolment);
      expect(RATE_TIERS, course.title).toContain(course.rateTier);
      for (const stage of course.stages) expect(STAGES, course.title).toContain(stage);
      for (const day of course.days) expect(DAY_TRACKS, course.title).toContain(day);
      expect(course.stages.length, course.title).toBeGreaterThan(0);
      expect(course.days.length, course.title).toBeGreaterThan(0);
    }
  });

  it('writes every meeting time the way the school writes it', () => {
    // Derived from the two 24-hour times, then compared against the school's
    // own string — which is what proves the times were transcribed and not
    // approximated. "11:20 a.m.-12:20 p.m." is the one that crosses noon.
    for (const course of CATALOGUE) {
      expect(timeLabel(course.start, course.end), course.title).toBe(mirrorFor(course.title).time);
    }
  });

  it('carries the school’s own age wording, verbatim', () => {
    for (const course of CATALOGUE) {
      expect(sameText(course.ageLabel), course.title).toBe(sameText(mirrorFor(course.title).ages));
    }
  });

  it('files each course on the day tracks the school publishes', () => {
    for (const course of CATALOGUE) {
      expect([...course.days], course.title).toEqual(mirrorFor(course.title).days);
    }
  });

  it('keeps the instructor, prerequisites, credit and fees as published', () => {
    for (const course of CATALOGUE) {
      const published = mirrorFor(course.title);
      expect(course.instructor, course.title).toBe(published.instructor);
      expect(course.materialsFee, course.title).toBe(published.materialsFee);
      expect(course.assessmentFee, course.title).toBe(published.assessmentFee);
      // The credit line is reworded only where the capture spells a fraction
      // out ("1/2 credit"); either way, a course either carries credit or does
      // not, and that must agree.
      expect(Boolean(course.credit), course.title).toBe(Boolean(published.credit));
      // The capture paraphrases a long prerequisite (Algebra 1's second
      // sentence), so the first sentence is what has to agree — it is the one
      // that says whether there is a gate at all.
      expect(firstSentence(course.prerequisites), course.title).toBe(
        firstSentence(published.prerequisites),
      );
    }
  });

  it('lists a real meeting date for every week of a block, and none otherwise', () => {
    for (const course of CATALOGUE) {
      if (course.enrolment === 'block') {
        expect(course.dates.length, course.title).toBe(course.weeks);
        for (const date of course.dates) expect(date, course.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else {
        expect(course.dates, course.title).toEqual([]);
      }
    }
  });

  it('rebuilds the duration line rather than storing it', () => {
    const byslug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;
    expect(durationLabel(byslug('algebra-1'))).toBe('Full Year, 2x/week (28 weeks)');
    expect(durationLabel(byslug('kingdom-math'))).toBe('Full Year (28 weeks)');
    expect(durationLabel(byslug('backyard-botany'))).toBe('Fall Semester (14 weeks)');
    expect(durationLabel(byslug('drawing-and-painting-grades-2-4'))).toBe('Spring Semester (14 weeks)');
    expect(durationLabel(byslug('what-is-a-community'))).toBe('8 weeks');
  });

  it('publishes no numeric age range for Algebra 1, because its gate is a prerequisite', () => {
    const algebra = CATALOGUE.find((course) => course.slug === 'algebra-1')!;
    expect(algebra.ageMin).toBeNull();
    expect(algebra.ageMax).toBeNull();
    expect(algebra.prerequisites).toMatch(/arithmetic/);

    // And it is the only one. Every other course states ages the school can
    // filter on, so a second null here would be a transcription slip.
    const withoutAges = CATALOGUE.filter((course) => course.ageMin === null);
    expect(withoutAges.map((course) => course.slug)).toEqual(['algebra-1']);
  });

  it('keeps every numeric range the right way round and inside 4 to 18', () => {
    for (const course of CATALOGUE) {
      if (course.ageMin === null) continue;
      expect(course.ageMin, course.title).toBeLessThanOrEqual(course.ageMax as number);
      expect(course.ageMin, course.title).toBeGreaterThanOrEqual(4);
      expect(course.ageMax as number, course.title).toBeLessThanOrEqual(18);
    }
  });
});
