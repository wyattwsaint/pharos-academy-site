import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import {
  catalogueCourses,
  captureOfferingTitles,
  chosenClassLabel,
  chosenClasses,
  decodeOfferingTitles,
} from './chosen-classes.js';
import { offeringsOf } from './offerings.js';

/**
 * What an application says a child chose (#259).
 *
 * The rename and the removal are the whole ticket: a submitted application is
 * the record of what a family sent, and neither a course renamed afterwards nor
 * a course taken off the catalogue may change a word of it.
 */

const OFFERINGS = offeringsOf(CATALOGUE);
const ALGEBRA = CATALOGUE.find((course) => course.slug === 'algebra-1')!;
const KEY = `algebra-1:${ALGEBRA.enrolmentUnits[0]}`;

describe('capturing the titles', () => {
  it('records the title of each offering the child chose', () => {
    expect(captureOfferingTitles(OFFERINGS, [KEY])).toEqual([`${KEY}=Algebra 1`]);
  });

  it('captures nothing for a key the catalogue cannot resolve', () => {
    // A stale form, which the picker already drops. A captured empty title
    // would read worse than the slug the reader falls back to.
    expect(captureOfferingTitles(OFFERINGS, ['not-a-class:year'])).toEqual([]);
  });

  it('captures a repeated key once', () => {
    expect(captureOfferingTitles(OFFERINGS, [KEY, KEY])).toHaveLength(1);
  });

  it('reads its own pairs back, and drops a malformed one', () => {
    expect(decodeOfferingTitles([`${KEY}=Algebra 1`, 'no-equals-sign', '=Orphan', `${KEY}2=`]))
      .toEqual({ [KEY]: 'Algebra 1' });
  });

  it('keeps a title containing an equals sign whole', () => {
    expect(decodeOfferingTitles([`${KEY}=Maths = Fun`])).toEqual({ [KEY]: 'Maths = Fun' });
  });
});

describe('what a child chose', () => {
  const CATALOGUED = catalogueCourses(OFFERINGS);
  const GONE = catalogueCourses([]);

  const child = (over: Record<string, unknown> = {}) => ({
    offeringKeys: [KEY],
    offeringTitles: { [KEY]: 'Algebra 1' },
    ...over,
  });

  it('names the class from the capture, not from today’s catalogue', () => {
    const renamed = offeringsOf([{ ...ALGEBRA, title: 'Algebra I (Renamed)' }]);
    const [chosen] = chosenClasses(child(), catalogueCourses(renamed));

    expect(chosen!.title).toBe('Algebra 1');
    expect(chosen!.offered).toBe(true);
  });

  it('names a class the catalogue no longer has, and says it is gone', () => {
    const [chosen] = chosenClasses(child(), GONE);

    expect(chosen!.title).toBe('Algebra 1');
    expect(chosen!.offered).toBe(false);
    expect(chosenClassLabel(chosen!)).toBe('Algebra 1 (full year) — no longer offered');
  });

  it('does not call a class gone because the school stopped selling that unit', () => {
    // The course is still on the site. "No longer offered" is for a class that
    // has been removed, and the tally asks the same question the same way.
    const fallOnly = offeringsOf([{ ...ALGEBRA, enrolmentUnits: ['fall'] }]);
    const [chosen] = chosenClasses(child(), catalogueCourses(fallOnly));

    expect(chosen!.offered).toBe(true);
  });

  it('falls back to the slug when the application captured nothing', () => {
    // A row written before #259. There is no honest title to recover, and the
    // slug is at least stable — reading the live catalogue would be the bug.
    const [chosen] = chosenClasses({ offeringKeys: [KEY] }, CATALOGUED);

    expect(chosen!.title).toBe('algebra-1');
  });

  it('drops a key that is not a class at all', () => {
    expect(chosenClasses({ offeringKeys: ['garbled'] }, CATALOGUED)).toEqual([]);
  });

  it('reads a live class as offered, with the unit the family bought', () => {
    const [chosen] = chosenClasses(child(), CATALOGUED);

    expect(chosen!.offered).toBe(true);
    expect(chosen!.unit).toBe(ALGEBRA.enrolmentUnits[0]);
    expect(chosenClassLabel(chosen!)).toBe('Algebra 1 (full year)');
  });
});
