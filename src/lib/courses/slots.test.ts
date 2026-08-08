import { describe, expect, it } from 'vitest';

import { SEEDED_SCHOOL_YEAR, type SchoolYear } from '../calendar/year.js';
import { CATALOGUE } from './catalogue.js';
import type { Course } from './course.js';
import {
  blockMeetingDates,
  blockStartChoices,
  clashWarnings,
  meetingSlots,
  runningTracks,
  type CandidateSchedule,
} from './slots.js';

/**
 * #24 AC 3, AC 4 and AC 6 — the slot generation the editor picks from, the
 * authoring-time clash check, and a block's dates computed from its start.
 */

const year = SEEDED_SCHOOL_YEAR;
const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;

/** The seeded year with no Tuesday terms — the track's routinely empty state. */
const noTuesday: SchoolYear = {
  ...year,
  terms: year.terms.filter((term) => term.track !== 'Tuesday'),
};

const candidate = (over: Partial<CandidateSchedule>): CandidateSchedule => ({
  slug: null,
  days: ['Monday'],
  start: '09:00',
  end: '10:00',
  enrolment: 'year',
  dates: [],
  ...over,
});

describe('slot generation (#24 AC 3)', () => {
  it('offers only the day tracks the school year runs', () => {
    expect(runningTracks(year)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
    expect(runningTracks(noTuesday)).toEqual(['Monday', 'Wednesday', 'Thursday']);
  });

  it('drops a track from the slot list when the year does not run it', () => {
    // Even though a course row could still name it — the year is the authority.
    const monday = bySlug('kingdom-math');
    const moved: Course = { ...monday, days: ['Tuesday'] };
    const slots = meetingSlots(noTuesday, [moved]);
    expect(slots).toEqual([]);
  });

  it('generates the distinct real meeting times of each track, occupants attached', () => {
    const slots = meetingSlots(year, CATALOGUE);
    const monday = slots.filter((slot) => slot.track === 'Monday');

    // The timetable's real Monday times, earliest first, no duplicates.
    expect(monday.map((slot) => `${slot.start}-${slot.end}`)).toEqual([
      '09:00-10:00',
      '09:00-10:30',
      '10:10-11:10',
      '10:40-12:10',
      '11:20-12:20',
    ]);

    // Three courses share Monday 10:40-12:10; both drawing runs and Kingdom Math.
    const shared = monday.find((slot) => slot.start === '10:40')!;
    expect(shared.occupants.map((course) => course.slug).sort()).toEqual([
      'drawing-and-painting-grades-2-4',
      'drawing-and-painting-grades-5-8',
      'kingdom-math',
    ]);
  });

  it('keeps the five-elective Wednesday slot as slots, not as an error', () => {
    // CONTEXT.md, "clash": oversubscription is by design and never reported.
    const wednesday = meetingSlots(year, CATALOGUE).filter((slot) => slot.track === 'Wednesday');
    const big = wednesday.find((slot) => slot.start === '10:40' && slot.end === '12:10')!;
    expect(big.occupants).toHaveLength(4);
    // The Pilgrim's Progress ends earlier, so it is its own real slot.
    expect(wednesday.some((slot) => slot.start === '10:40' && slot.end === '11:40')).toBe(true);
  });
});

describe('the authoring-time clash check (#24 AC 4)', () => {
  it('warns when the new class really meets at an occupied time', () => {
    const warnings = clashWarnings(
      candidate({ days: ['Monday'], start: '10:00', end: '10:10' }),
      CATALOGUE,
      year,
    );
    expect(warnings.map((warning) => warning.course.slug)).toEqual(['god-made-everything']);
    expect(warnings[0]!.severity).toBe('clash');
    // The shared days are real Monday meeting dates, so the warning can say one.
    expect(warnings[0]!.sharedDates[0]).toBe('2026-08-31');
  });

  it('measures real overlap, not adjacency', () => {
    // Monday 10:30-11:00: God Made Everything ends at 10:30 sharp and Beginner
    // Latin starts at 11:20 — back to back is not a clash. What it does
    // cross, it is told about.
    const warnings = clashWarnings(
      candidate({ days: ['Monday'], start: '10:30', end: '11:00' }),
      CATALOGUE,
      year,
    );
    expect(warnings.map((warning) => warning.course.slug).sort()).toEqual([
      'drawing-and-painting-grades-2-4',
      'drawing-and-painting-grades-5-8',
      'kingdom-math',
      'principles-of-drawing',
    ]);
  });

  it('does not warn when the semesters never share a day', () => {
    // Monday 10:40-12:10 in the fall: every year course it crosses and the
    // fall drawing run are real clashes; the spring drawing run, at exactly
    // the same time on the same track, shares no date at all and is not one.
    const warnings = clashWarnings(
      candidate({ days: ['Monday'], start: '10:40', end: '12:10', enrolment: 'fall' }),
      CATALOGUE,
      year,
    );
    const slugs = warnings.map((warning) => warning.course.slug).sort();
    expect(slugs).not.toContain('drawing-and-painting-grades-2-4');
    expect(slugs).toEqual([
      'algebra-1',
      'beginner-latin-grades-5-6',
      'drawing-and-painting-grades-5-8',
      'kingdom-math',
      'principles-of-drawing',
    ]);
  });

  it('finds two dated blocks apart, and two dated blocks together', () => {
    // Nocturnal Wonders runs September; a block on Virtue of Kindness's October
    // dates misses it entirely and lands squarely on Virtue of Kindness itself.
    const kindness = bySlug('the-virtue-of-kindness');
    const warnings = clashWarnings(
      candidate({
        days: ['Wednesday'],
        start: '10:40',
        end: '12:10',
        enrolment: 'block',
        dates: kindness.dates,
      }),
      CATALOGUE,
      year,
    );
    const slugs = warnings.map((warning) => warning.course.slug);
    expect(slugs).not.toContain('nocturnal-wonders');
    expect(slugs).toContain('the-virtue-of-kindness');
    expect(warnings.find((one) => one.course.slug === 'the-virtue-of-kindness')!.severity).toBe(
      'clash',
    );
  });

  it('calls a block with no start date yet a possible clash, not a certain one', () => {
    // CONTEXT.md, "possible clash": the truth is genuinely unknown, and saying
    // either "clash" or nothing would be inventing an answer.
    const warnings = clashWarnings(
      candidate({ days: ['Wednesday'], start: '10:40', end: '12:10', enrolment: 'block', dates: [] }),
      CATALOGUE,
      year,
    );
    const wonders = warnings.find((one) => one.course.slug === 'nocturnal-wonders')!;
    expect(wonders.severity).toBe('possible');
    expect(wonders.sharedDates).toEqual([]);
  });

  it('never reports a course as clashing with itself while it is edited', () => {
    const math = bySlug('kingdom-math');
    const warnings = clashWarnings(
      candidate({ slug: math.slug, days: [...math.days], start: math.start, end: math.end }),
      CATALOGUE,
      year,
    );
    expect(warnings.map((warning) => warning.course.slug)).not.toContain('kingdom-math');
  });
});

describe('a block’s start date and computed run (#24 AC 6)', () => {
  it('offers only that track’s real meeting dates as starts', () => {
    const choices = blockStartChoices(year, 'Wednesday').map((meeting) => meeting.date);
    expect(choices[0]).toBe('2026-09-02');
    // Thanksgiving Wednesday is closed, so it is not a date a block can start on.
    expect(choices).not.toContain('2026-11-25');
  });

  it('computes the published dates of the seeded blocks from start and length alone', () => {
    const wonders = bySlug('nocturnal-wonders');
    expect(blockMeetingDates(year, 'Wednesday', '2026-09-02', wonders.weeks)).toEqual([
      ...wonders.dates,
    ]);
    const kindness = bySlug('the-virtue-of-kindness');
    expect(blockMeetingDates(year, 'Wednesday', '2026-10-14', kindness.weeks)).toEqual([
      ...kindness.dates,
    ]);
  });

  it('skips a closure rather than meeting on it, so the block runs a week longer', () => {
    const dates = blockMeetingDates(year, 'Wednesday', '2026-11-04', 4);
    // The last of the run is the end date the editor shows, derived where it is needed.
    expect(dates).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-12-02']);
  });

  it('refuses a start the track does not meet on', () => {
    // A Saturday, and a closed Wednesday: neither is a meeting date.
    expect(() => blockMeetingDates(year, 'Wednesday', '2026-09-05', 6)).toThrow(/does not meet/);
    expect(() => blockMeetingDates(year, 'Wednesday', '2026-11-25', 6)).toThrow(/does not meet/);
  });

  it('refuses a block the year cannot hold, rather than quietly shortening it', () => {
    // The spring Wednesday column ends 7 April 2027; six weeks from 31 March do not fit.
    expect(() => blockMeetingDates(year, 'Wednesday', '2027-03-31', 6)).toThrow(/outruns/);
  });
});
