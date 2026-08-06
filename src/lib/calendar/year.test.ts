import { describe, expect, it } from 'vitest';

import {
  meetingsOf,
  previewRows,
  SEEDED_SCHOOL_YEAR,
  trackColumn,
  validateSchoolYear,
  type SchoolYear,
} from './year.js';

/**
 * The four tracks, against the school's own published PDFs (#23).
 *
 * The expectations here are not derived from the code: they are the dates
 * printed on `docs/mirror/pdf-text/calendar-2026-27-*.txt`, which is what a
 * family is holding. Every one of the 112 is asserted, because "week 10 is
 * 9 November on Monday and 4 November on Wednesday" is exactly the kind of
 * fact a plausible-looking flat computation gets wrong in three of four
 * columns while looking right in the first.
 *
 * The one date deliberately **not** taken from the PDF is Easter Monday. The
 * published Monday sheet says "EASTER MONDAY OFF / March 26, 2026" — a Friday,
 * in the wrong year — and the school confirmed the real closure is Monday
 * 29 March 2027 (#23). The dates around it are the PDF's own: week 26 is
 * 22 March and week 27 is 5 April, which is only true if 29 March is skipped.
 */

/** The Monday sheet, weeks 1–28. */
const MONDAY = [
  '2026-08-31', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12',
  '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23',
  '2026-12-07', '2026-12-14',
  '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08',
  '2027-02-15', '2027-02-22', '2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22',
  '2027-04-05', '2027-04-12',
];

/** The Tuesday sheet. Election Day is its only closure; Thanksgiving is not. */
const TUESDAY = [
  '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06',
  '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-10', '2026-11-17', '2026-11-24',
  '2026-12-08', '2026-12-15',
  '2027-01-05', '2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02', '2027-02-09',
  '2027-02-16', '2027-02-23', '2027-03-02', '2027-03-09', '2027-03-16', '2027-03-23',
  '2027-03-30', '2027-04-06',
];

const WEDNESDAY = [
  '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07',
  '2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18',
  '2026-12-02', '2026-12-09',
  '2027-01-06', '2027-01-13', '2027-01-20', '2027-01-27', '2027-02-03', '2027-02-10',
  '2027-02-17', '2027-02-24', '2027-03-03', '2027-03-10', '2027-03-17', '2027-03-24',
  '2027-03-31', '2027-04-07',
];

const THURSDAY = [
  '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08',
  '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19',
  '2026-12-03', '2026-12-10',
  '2027-01-07', '2027-01-14', '2027-01-21', '2027-01-28', '2027-02-04', '2027-02-11',
  '2027-02-18', '2027-02-25', '2027-03-04', '2027-03-11', '2027-03-18', '2027-03-25',
  '2027-04-01', '2027-04-08',
];

const PUBLISHED = {
  Monday: MONDAY,
  Tuesday: TUESDAY,
  Wednesday: WEDNESDAY,
  Thursday: THURSDAY,
} as const;

describe('the school year, computed from what Jill types', () => {
  it('produces all 112 dates from eight first-class dates, two week counts and the closures', () => {
    const meetings = meetingsOf(SEEDED_SCHOOL_YEAR);
    expect(meetings).toHaveLength(112);
  });

  it('numbers each track independently, matching the published 2026-27 PDFs exactly', () => {
    for (const [track, dates] of Object.entries(PUBLISHED)) {
      const column = trackColumn(SEEDED_SCHOOL_YEAR, track as keyof typeof PUBLISHED);
      expect(column.map((meeting) => meeting.date), track).toEqual(dates);
      expect(column.map((meeting) => meeting.week), track).toEqual(
        Array.from({ length: 28 }, (_, index) => index + 1),
      );
    }
  });

  it('has the four tracks disagreeing about what week 10 is', () => {
    const weekTen = (track: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday') =>
      trackColumn(SEEDED_SCHOOL_YEAR, track).find((meeting) => meeting.week === 10)?.date;

    expect(weekTen('Monday')).toBe('2026-11-09');
    expect(weekTen('Tuesday')).toBe('2026-11-10');
    expect(weekTen('Wednesday')).toBe('2026-11-04');
    expect(weekTen('Thursday')).toBe('2026-11-05');
  });

  it('continues the spring numbering from each track’s own fall count', () => {
    const spring = trackColumn(SEEDED_SCHOOL_YEAR, 'Monday').filter(
      (meeting) => meeting.semester === 'spring',
    );
    expect(spring[0]).toMatchObject({ week: 15, date: '2027-01-04' });
    expect(spring.at(-1)).toMatchObject({ week: 28, date: '2027-04-12' });
  });

  it('skips a closure only on the track whose day it falls on', () => {
    // Labor Day is a Monday: the Monday track loses a week and nobody else does.
    expect(trackColumn(SEEDED_SCHOOL_YEAR, 'Monday').map((m) => m.date)).not.toContain(
      '2026-09-07',
    );
    expect(trackColumn(SEEDED_SCHOOL_YEAR, 'Tuesday')[1]?.date).toBe('2026-09-08');
  });
});

describe('a year with no Tuesday track', () => {
  const withoutTuesday: SchoolYear = {
    ...SEEDED_SCHOOL_YEAR,
    terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.track !== 'Tuesday'),
  };

  it('is complete, not incomplete', () => {
    expect(validateSchoolYear(withoutTuesday)).toEqual({});
  });

  it('computes the other three tracks unchanged', () => {
    expect(meetingsOf(withoutTuesday)).toHaveLength(84);
    expect(trackColumn(withoutTuesday, 'Wednesday').map((m) => m.date)).toEqual(WEDNESDAY);
    expect(trackColumn(withoutTuesday, 'Tuesday')).toEqual([]);
  });

  it('leaves the Tuesday column empty in the preview rather than shifting the others left', () => {
    const rows = previewRows(withoutTuesday, 'fall');
    const week = rows.find((row) => row.kind === 'week' && row.week === 1);
    expect(week).toMatchObject({
      cells: { Monday: '2026-08-31', Tuesday: null, Wednesday: '2026-09-02', Thursday: '2026-09-03' },
    });
  });
});

describe('the four-column preview', () => {
  it('puts the closures where the published sheet puts them', () => {
    const fall = previewRows(SEEDED_SCHOOL_YEAR, 'fall');

    // Labor Day sits between week 1 and week 2, in the Monday column only.
    const afterWeekOne = fall[fall.findIndex((row) => row.kind === 'week' && row.week === 1) + 1];
    expect(afterWeekOne).toMatchObject({
      kind: 'closure',
      cells: { Monday: 'Labor Day', Tuesday: null, Wednesday: null, Thursday: null },
    });

    // Thanksgiving is one row with three tracks off on three different days.
    const beforeThirteen = fall[fall.findIndex((row) => row.kind === 'week' && row.week === 13) - 1];
    expect(beforeThirteen).toMatchObject({
      kind: 'closure',
      cells: {
        Monday: 'Thanksgiving (30 November)',
        // The Tuesday sheet drops 1 December without a word; the dates say so.
        Tuesday: 'Thanksgiving (1 December)',
        Wednesday: 'Thanksgiving (25 November)',
        Thursday: 'Thanksgiving (26 November)',
      },
    });
  });

  it('runs weeks 1–14 in the fall and 15–28 in the spring', () => {
    const weeks = (semester: 'fall' | 'spring') =>
      previewRows(SEEDED_SCHOOL_YEAR, semester)
        .filter((row) => row.kind === 'week')
        .map((row) => row.week);

    expect(weeks('fall')).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(weeks('spring')).toEqual(Array.from({ length: 14 }, (_, i) => i + 15));
  });
});

describe('what the school year refuses to be', () => {
  it('refuses a first class date that is not that track’s own weekday', () => {
    const wrongDay: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.map((term) =>
        term.track === 'Monday' && term.semester === 'fall'
          ? { ...term, firstClassDate: '2026-09-01' }
          : term,
      ),
    };
    expect(validateSchoolYear(wrongDay)['fall.Monday.firstClassDate']).toMatch(/Tuesday/);
  });

  it('refuses a week count that is not a number of weeks', () => {
    const noWeeks: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.map((term) =>
        term.track === 'Thursday' && term.semester === 'spring' ? { ...term, weeks: 0 } : term,
      ),
    };
    expect(noWeeks && validateSchoolYear(noWeeks)['spring.Thursday.weeks']).toBeTruthy();
  });

  it('refuses a closure that is not a day on the calendar', () => {
    const badClosure: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      closures: [{ date: '2026-02-30', label: 'Nothing' }],
    };
    expect(validateSchoolYear(badClosure)['closures.0.date']).toBeTruthy();
  });

  it('refuses a closure with no name, because the sheet prints the name', () => {
    const unnamed: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      closures: [{ date: '2026-09-07', label: '' }],
    };
    expect(unnamed && validateSchoolYear(unnamed)['closures.0.label']).toBeTruthy();
  });

  it('refuses a spring term that starts before the fall term it follows', () => {
    const backwards: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.map((term) =>
        term.track === 'Monday' && term.semester === 'spring'
          ? { ...term, firstClassDate: '2026-08-24' }
          : term,
      ),
    };
    expect(backwards['terms'] && validateSchoolYear(backwards)['spring.Monday.firstClassDate'])
      .toBeTruthy();
  });

  it('accepts the year the school actually published', () => {
    expect(validateSchoolYear(SEEDED_SCHOOL_YEAR)).toEqual({});
  });
});
