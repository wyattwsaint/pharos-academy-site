import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { offeringsOf } from './offerings.js';
import { classTally, tallyLines, type TalliedApplication } from './tally.js';

/**
 * The class tally (#32 AC 1).
 *
 * The number Jill uses to decide whether a class runs, which is why the
 * deduplication is the whole ticket: a family that applies twice — a change of
 * mind, a second child added, a form sent from two devices — currently doubles
 * its own rows in the count, and a class runs or does not on that number.
 */

const OFFERINGS = offeringsOf(CATALOGUE);
const ALGEBRA = CATALOGUE.find((course) => course.slug === 'algebra-1')!;

const AUGUST = new Date('2026-08-01T10:00:00Z');
const SEPTEMBER = new Date('2026-09-01T10:00:00Z');

function application(over: Partial<TalliedApplication> = {}): TalliedApplication {
  return {
    id: 'a1',
    familyName: 'Okonkwo',
    receivedAt: AUGUST,
    state: 'submitted',
    children: [{ name: 'Ada', offeringKeys: ['algebra-1:year'], offeringTitles: TITLES }],
    ...over,
  };
}

/** What an application submitted today captures — the class, as it was shown. */
const TITLES = { 'algebra-1:year': 'Algebra 1' };

/** The seats on one course, whatever else is in the tally. */
const seatsOn = (tally: ReturnType<typeof classTally>, slug: string) =>
  tally.find((entry) => entry.courseSlug === slug)?.seats ?? [];

describe('the class tally', () => {
  it('counts one seat per child per class', () => {
    const tally = classTally(
      [
        application(),
        application({
          id: 'a2',
          familyName: 'Marsh',
          children: [{ name: 'Obi', offeringKeys: ['algebra-1:year'] }],
        }),
      ],
      OFFERINGS,
    );

    expect(seatsOn(tally, 'algebra-1').map((seat) => seat.childName)).toEqual(['Ada', 'Obi']);
  });

  it('counts a family that applied twice once, with a second-submission note (AC 1)', () => {
    const tally = classTally(
      [
        application({ id: 'first', receivedAt: AUGUST }),
        application({ id: 'second', receivedAt: SEPTEMBER }),
      ],
      OFFERINGS,
    );

    const seats = seatsOn(tally, 'algebra-1');
    expect(seats).toHaveLength(1);
    expect(seats[0]!.resubmitted).toBe(true);
    // Newest first, so the school can see which application the seat came from.
    expect(seats[0]!.applicationIds).toEqual(['second', 'first']);
  });

  it('takes the unit from the newest application, because that is the family’s latest word', () => {
    // A course the school sells two ways. The seeded catalogue sells each of
    // its courses one way, so the case is built rather than found — the school
    // ticks the units per course in the editor (#24), and a family changing
    // from a semester to the year is the ordinary reason to re-apply.
    const bothWays = offeringsOf([{ ...ALGEBRA, enrolmentUnits: ['year', 'fall'] }]);

    const tally = classTally(
      [
        application({ id: 'first', receivedAt: AUGUST }),
        application({
          id: 'second',
          receivedAt: SEPTEMBER,
          children: [{ name: 'Ada', offeringKeys: ['algebra-1:fall'] }],
        }),
      ],
      bothWays,
    );

    const seats = seatsOn(tally, 'algebra-1');
    // One seat, not two: the unit is not part of the key, because a family
    // asking for the same class twice is one child in one class.
    expect(seats).toHaveLength(1);
    expect(seats[0]!.unit).toBe('fall');
  });

  it('does not merge two families who share an email address', () => {
    // Blocking or merging on the email address is the wrong key (#32): two
    // households genuinely share one, and re-applying is a real thing to do.
    const tally = classTally(
      [
        application({ id: 'a1', familyName: 'Okonkwo' }),
        application({
          id: 'a2',
          familyName: 'Marsh',
          children: [{ name: 'Ada', offeringKeys: ['algebra-1:year'] }],
        }),
      ],
      OFFERINGS,
    );

    expect(seatsOn(tally, 'algebra-1')).toHaveLength(2);
  });

  it('reads a family name and a child name the way a person would', () => {
    const tally = classTally(
      [
        application({ id: 'first', familyName: 'Okonkwo', receivedAt: AUGUST }),
        application({
          id: 'second',
          familyName: '  okonkwo ',
          receivedAt: SEPTEMBER,
          children: [{ name: 'ada ', offeringKeys: ['algebra-1:year'] }],
        }),
      ],
      OFFERINGS,
    );

    expect(seatsOn(tally, 'algebra-1')).toHaveLength(1);
  });

  it('leaves withdrawn and refused applications out of the count', () => {
    const tally = classTally(
      [
        application({ id: 'a1', state: 'withdrawn' }),
        application({ id: 'a2', familyName: 'Marsh', state: 'refused' }),
        application({ id: 'a3', familyName: 'Jensen', state: 'enrolled' }),
      ],
      OFFERINGS,
    );

    expect(seatsOn(tally, 'algebra-1').map((seat) => seat.familyName)).toEqual(['Jensen']);
  });

  it('lists only the classes somebody actually chose, in catalogue order', () => {
    const tally = classTally(
      [
        application({
          children: [{ name: 'Ada', offeringKeys: ['algebra-1:year'] }],
        }),
      ],
      OFFERINGS,
    );

    expect(tally.map((entry) => entry.courseSlug)).toEqual(['algebra-1']);
  });

  it('ignores a key that is not a class at all', () => {
    const tally = classTally(
      [application({ children: [{ name: 'Ada', offeringKeys: ['garbled'] }] })],
      OFFERINGS,
    );

    expect(tally).toEqual([]);
  });

  it('still counts a class the catalogue no longer has (#259)', () => {
    // The number Jill decided something on must not move because the school
    // removed or renamed the course afterwards. It is counted, named out of
    // what the application captured, and marked as gone.
    const tally = classTally(
      [
        application({
          children: [
            {
              name: 'Ada',
              offeringKeys: ['algebra-1:year'],
              offeringTitles: { 'algebra-1:year': 'Algebra 1' },
            },
          ],
        }),
      ],
      [],
    );

    expect(tally).toHaveLength(1);
    expect(tally[0]!.seats).toHaveLength(1);
    expect(tally[0]!.title).toBe('Algebra 1');
    expect(tally[0]!.offered).toBe(false);
    expect(tallyLines(tally)[0]).toBe('Algebra 1 (no longer offered): 1 (1 full year)');
  });

  it('deduplicates a removed class by the same rule as any other', () => {
    const twice = [
      application({ id: 'first', receivedAt: AUGUST }),
      application({ id: 'second', receivedAt: SEPTEMBER }),
    ];

    const tally = classTally(twice, []);

    expect(seatsOn(tally, 'algebra-1')).toHaveLength(1);
    expect(seatsOn(tally, 'algebra-1')[0]!.resubmitted).toBe(true);
  });

  it('names a removed class by its slug when nothing was captured', () => {
    // A row written before #259. The slug is stable, which is the property that
    // matters; the live catalogue is exactly what must not be consulted.
    const tally = classTally(
      [application({ children: [{ name: 'Ada', offeringKeys: ['algebra-1:year'] }] })],
      [],
    );

    expect(tally[0]!.title).toBe('algebra-1');
  });

  it('names a class as the application captured it, not as the catalogue renamed it', () => {
    const renamed = offeringsOf([{ ...ALGEBRA, title: 'Algebra I (Renamed)' }]);
    const tally = classTally(
      [
        application({
          children: [
            {
              name: 'Ada',
              offeringKeys: ['algebra-1:year'],
              offeringTitles: { 'algebra-1:year': 'Algebra 1' },
            },
          ],
        }),
      ],
      renamed,
    );

    expect(tally[0]!.title).toBe('Algebra 1');
    expect(tally[0]!.offered).toBe(true);
  });

  it('lists the classes the catalogue still has first', () => {
    const tally = classTally(
      [
        application({
          children: [
            {
              name: 'Ada',
              offeringKeys: ['gone:year', 'algebra-1:year'],
              offeringTitles: { 'gone:year': 'Woodwork' },
            },
          ],
        }),
      ],
      OFFERINGS,
    );

    expect(tally.map((entry) => entry.courseSlug)).toEqual(['algebra-1', 'gone']);
  });

  it('keeps two unnamed children on one application apart', () => {
    // A family that picked classes before typing names is an ordinary
    // half-filled form, not one child who chose twice.
    const tally = classTally(
      [
        application({
          children: [
            { name: '', offeringKeys: ['algebra-1:year'] },
            { name: '', offeringKeys: ['algebra-1:year'] },
          ],
        }),
      ],
      OFFERINGS,
    );

    expect(seatsOn(tally, 'algebra-1')).toHaveLength(2);
  });

  it('says the count and the note in a line the school can read in an email', () => {
    const tally = classTally(
      [
        application({ id: 'first', receivedAt: AUGUST }),
        application({ id: 'second', receivedAt: SEPTEMBER }),
        application({
          id: 'third',
          familyName: 'Marsh',
          children: [{ name: 'Obi', offeringKeys: ['algebra-1:year'] }],
        }),
      ],
      OFFERINGS,
    );

    const [line] = tallyLines(tally);
    expect(line).toContain('Algebra 1');
    expect(line).toContain('2');
    expect(line?.toLowerCase()).toContain('second submission');
  });
});
