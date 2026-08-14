import { describe, expect, it } from 'vitest';

import { SEEDED_SCHOOL_YEAR, trackColumn } from '../calendar/year.js';
import { CATALOGUE } from './catalogue.js';
import type { Course } from './course.js';
import { courseMeetings } from './meetings.js';
import { blockMeetingDates, meetingDatesOn } from './slots.js';

/**
 * #233 — the dates a course page shows.
 *
 * The presentation is proved here, date by date and with no browser, exactly as
 * the slot tests beside it prove a block's run. What Playwright is left is the
 * one thing only a browser has: that the list opens, and opens from a keyboard.
 */

const year = SEEDED_SCHOOL_YEAR;
const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;

describe('the dates a course meets on (#233)', () => {
  it('gives a year course both semesters, in order and each date once', () => {
    const course = bySlug('introduction-to-church-and-bible-history');
    const { dates, unknown } = courseMeetings(year, course);

    expect(unknown).toBe(false);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates[0]).toBe('2026-09-02');
    expect(dates.at(-1)).toBe('2027-04-07');
  });

  it('gives a fall course no meeting in the spring, and a spring course none in the fall', () => {
    const fall = courseMeetings(year, bySlug('drawing-and-painting-grades-5-8'));
    const spring = courseMeetings(year, bySlug('drawing-and-painting-grades-2-4'));

    expect(fall.dates.every((date) => date < '2027-01-01')).toBe(true);
    expect(spring.dates.every((date) => date > '2026-12-31')).toBe(true);
    // February belongs to one of them and not the other, which is the whole
    // reason the enrolment unit is asked at all.
    expect(fall.months.map((month) => month.id)).not.toContain('2027-02');
    expect(spring.months.map((month) => month.id)).toContain('2027-02');
  });

  it('gives a block its own run, and a closure inside it lengthens rather than shortens', () => {
    // Six Wednesdays from 14 October, over the Election Day closure: the run
    // ends a calendar week later and the family still gets six meetings.
    const { dates } = courseMeetings(year, bySlug('the-virtue-of-kindness'));

    expect(dates).toHaveLength(6);
    expect(dates).not.toContain('2026-11-03');
    expect(dates).toEqual(blockMeetingDates(year, 'Wednesday', '2026-10-14', 6));
    expect(dates.at(-1)).toBe('2026-11-18');
  });

  it('merges the two tracks of a course that meets twice a week', () => {
    const algebra = bySlug('algebra-1');
    const { dates } = courseMeetings(year, algebra);

    expect(dates).toEqual(
      [
        ...trackColumn(year, 'Monday').map((meeting) => meeting.date),
        ...trackColumn(year, 'Wednesday').map((meeting) => meeting.date),
      ].sort(),
    );
  });

  it('shows the dates the meeting-date computation returns, and no others', () => {
    // The reuse itself, so a second implementation cannot creep in: whatever
    // `meetingDatesOn` says for a course is what its page shows.
    for (const course of CATALOGUE) {
      const expected = course.days
        .flatMap((track) => meetingDatesOn(year, track, course.enrolment, course.dates) ?? [])
        .sort();

      expect(courseMeetings(year, course).dates).toEqual([...new Set(expected)]);
    }
  });

  it('calls a block with no start date unknown rather than empty', () => {
    const undated: Course = { ...bySlug('the-virtue-of-kindness'), dates: [] };
    const meetings = courseMeetings(year, undated);

    expect(meetings.unknown).toBe(true);
    expect(meetings.dates).toEqual([]);
    expect(meetings.summary).toBeNull();
  });

  it('meets on no days when the year gives the course’s track no term', () => {
    const noWednesday = { ...year, terms: year.terms.filter((term) => term.track !== 'Wednesday') };
    const meetings = courseMeetings(noWednesday, bySlug('introduction-to-church-and-bible-history'));

    expect(meetings.unknown).toBe(false);
    expect(meetings.dates).toEqual([]);
    expect(meetings.summary).toBeNull();
    expect(meetings.months).toEqual([]);
  });
});

describe('the summary line (#233)', () => {
  it('counts the meetings, names the weekday and gives the first and last date', () => {
    const { summary } = courseMeetings(year, bySlug('introduction-to-church-and-bible-history'));

    expect(summary).toBe('28 Wednesdays, 2 Sept to 7 Apr');
  });

  it('names both weekdays when a course meets twice a week', () => {
    const { summary } = courseMeetings(year, bySlug('algebra-1'));

    expect(summary).toBe('56 meetings on Mondays and Wednesdays, 31 Aug to 12 Apr');
  });

  it('summarises a block by its own short run', () => {
    expect(courseMeetings(year, bySlug('the-virtue-of-kindness')).summary).toBe(
      '6 Wednesdays, 14 Oct to 18 Nov',
    );
  });

  it('gives a single meeting no range', () => {
    const once: Course = { ...bySlug('the-virtue-of-kindness'), dates: ['2026-10-14'] };

    expect(courseMeetings(year, once).summary).toBe('1 Wednesday, 14 Oct');
  });
});

describe('the dates grouped by month (#233)', () => {
  it('heads each month and lists its dates under it, oldest first', () => {
    const { months } = courseMeetings(year, bySlug('the-virtue-of-kindness'));

    expect(months.map((month) => month.id)).toEqual(['2026-10', '2026-11']);
    expect(months[0]).toEqual({
      id: '2026-10',
      heading: 'October 2026',
      dates: [
        { date: '2026-10-14', label: 'Wednesday 14 October' },
        { date: '2026-10-21', label: 'Wednesday 21 October' },
        { date: '2026-10-28', label: 'Wednesday 28 October' },
      ],
    });
  });

  it('holds every date exactly once, across the months', () => {
    const { dates, months } = courseMeetings(year, bySlug('algebra-1'));

    expect(months.flatMap((month) => month.dates.map((one) => one.date))).toEqual(dates);
  });

  it('skips a month the course does not meet in', () => {
    // A block with a month's gap in the middle is still two months, not three.
    const gapped: Course = {
      ...bySlug('the-virtue-of-kindness'),
      dates: ['2026-10-14', '2026-12-02'],
    };

    expect(courseMeetings(year, gapped).months.map((month) => month.id)).toEqual([
      '2026-10',
      '2026-12',
    ]);
  });
});
