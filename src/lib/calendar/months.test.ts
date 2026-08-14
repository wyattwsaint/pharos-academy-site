import { describe, expect, it } from 'vitest';

import { DAY_TRACKS } from '../courses/schedule.js';
import type { CalendarEvent } from './event.js';
import { monthGrid, type MonthCell } from './months.js';
import { previewRows, SEEDED_SCHOOL_YEAR, SEMESTERS, type SchoolYear } from './year.js';

/**
 * The month grid, against the year the school has already published (#186).
 *
 * The load-bearing assertion is the last one: the grid and the sheet are two
 * drawings of one year on one page, and the failure that matters is not a
 * misplaced cell but the two of them disagreeing about whether the school is
 * open. That is asserted date by date rather than spot-checked.
 */

/** Every cell of every month, flattened — the blanks dropped. */
function cellsOf(blocks: ReturnType<typeof monthGrid>): Map<string, MonthCell> {
  return new Map(
    blocks.flatMap((block) =>
      block.weeks.flat().filter((cell): cell is MonthCell => cell !== null).map((cell) => [cell.date, cell]),
    ),
  );
}

function event(heldOn: string, title: string): CalendarEvent {
  return {
    slug: `${heldOn}-${title.toLowerCase().replace(/\W+/g, '-')}`,
    heldOn,
    title,
    startTime: null,
    place: null,
    note: null,
    lastEditedBy: null,
    lastEditedAt: null,
  };
}

describe('the months it draws', () => {
  it('spans every month the year touches, and none outside it', () => {
    const blocks = monthGrid(SEEDED_SCHOOL_YEAR, []);

    // The Monday track opens on 31 August 2026 and the spring's last meeting is
    // 12 April 2027, so those are the two ends and everything between is drawn.
    expect(blocks.map((block) => block.id)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ]);
    expect(blocks[0]?.heading).toBe('August 2026');
  });

  it('draws a month between the ends even when it holds nothing', () => {
    const blocks = monthGrid(SEEDED_SCHOOL_YEAR, []);
    const july = monthGrid(
      {
        ...SEEDED_SCHOOL_YEAR,
        terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.semester === 'fall'),
      },
      [event('2027-07-04', 'Independence Day picnic')],
    );

    // The fall alone runs to December; a July one-off pulls the span out to it,
    // and the six months in between are drawn empty rather than skipped.
    expect(july.map((block) => block.id)).toContain('2027-05');
    expect(blocks.map((block) => block.id)).not.toContain('2027-05');
  });

  it('lays each month out in whole weeks, Monday first', () => {
    const november = monthGrid(SEEDED_SCHOOL_YEAR, []).find((block) => block.id === '2026-11')!;

    for (const week of november.weeks) expect(week).toHaveLength(7);
    // 1 November 2026 is a Sunday: six blanks, then the 1st in the last column.
    expect(november.weeks[0]?.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(november.weeks[0]?.[6]?.day).toBe(1);
    expect(november.weeks.flat().filter(Boolean)).toHaveLength(30);
  });
});

describe('the one-offs on it', () => {
  it('draws every one the site holds, the ones that have been and gone included', () => {
    const events = [event('2026-09-18', 'Fall open house'), event('2027-03-04', 'Picture day')];
    const cells = cellsOf(monthGrid(SEEDED_SCHOOL_YEAR, events));

    expect(cells.get('2026-09-18')?.events.map((one) => one.title)).toEqual(['Fall open house']);
    expect(cells.get('2027-03-04')?.events.map((one) => one.title)).toEqual(['Picture day']);
  });

  it('keeps two one-offs on one date as two, in the order it was given them', () => {
    const events = [event('2026-10-17', 'Open house'), event('2026-10-17', 'Bake sale')];
    const cells = cellsOf(monthGrid(SEEDED_SCHOOL_YEAR, events));

    expect(cells.get('2026-10-17')?.events.map((one) => one.title)).toEqual([
      'Open house',
      'Bake sale',
    ]);
  });
});

describe('the days the school is shut', () => {
  const cells = cellsOf(monthGrid(SEEDED_SCHOOL_YEAR, []));

  it('marks a closed weekday inside a semester, and names it', () => {
    // Thanksgiving off three tracks, plus the Tuesday the school's own sheets
    // leave blank without saying why, plus Election Day.
    expect(cells.get('2026-11-03')).toMatchObject({ noSchool: true, closure: 'Election Day' });
    for (const date of ['2026-11-25', '2026-11-26', '2026-11-30', '2026-12-01']) {
      expect(cells.get(date), date).toMatchObject({ noSchool: true, closure: 'Thanksgiving' });
    }
  });

  it('marks a weekday nobody meets on even where no closure names it', () => {
    /*
     * The seeded year has no such day — every weekday it does not teach on is
     * one the school has named — so this is a year where one track finishes
     * two weeks before the others. The Mondays of 7 and 14 December are then
     * inside the fall and taught by nobody, and the mark is bare because there
     * is nothing to call them.
     */
    const short: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.map((term) =>
        term.track === 'Monday' && term.semester === 'fall' ? { ...term, weeks: 12 } : term,
      ),
    };
    const shortCells = cellsOf(monthGrid(short, []));

    expect(shortCells.get('2026-12-07')).toMatchObject({ noSchool: true, closure: null });
    expect(shortCells.get('2026-12-14')).toMatchObject({ noSchool: true, closure: null });
  });

  it('leaves a Tuesday the Tuesday track meets alone, courses or no courses', () => {
    // The Tuesday track carries no courses in the seeded year and meets all the
    // same; the sheet prints 10 November, so the grid cannot call it a day off.
    expect(cells.get('2026-11-10')?.noSchool).toBe(false);
  });

  it('never marks a Friday, and never marks a date outside a semester', () => {
    for (const [date, cell] of cells) {
      if (!cell.noSchool) continue;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      expect(weekday, date).toBeGreaterThanOrEqual(1);
      expect(weekday, date).toBeLessThanOrEqual(4);
    }

    // The summer either side, the Christmas break, and Easter Monday's Friday.
    for (const date of ['2026-08-24', '2026-12-21', '2026-12-28', '2027-04-19', '2027-03-26']) {
      expect(cells.get(date)?.noSchool, date).toBe(false);
    }
  });

  /**
   * The one that would be caught in public: one page, two drawings, one year.
   *
   * The sheet is the source a family already trusts — it is the PDF they were
   * handed — so the grid is held to it rather than the other way round, for
   * every date in the year rather than for a handful.
   */
  it('agrees with the sheet, date for date', () => {
    const sheet = new Set(
      SEMESTERS.flatMap((semester) => previewRows(SEEDED_SCHOOL_YEAR, semester))
        .flatMap((row) => (row.kind === 'week' ? DAY_TRACKS.map((track) => row.cells[track]) : []))
        .filter((date): date is string => date !== null),
    );

    for (const [date, cell] of cells) {
      if (sheet.has(date)) expect(cell.noSchool, date).toBe(false);
      else if (cell.noSchool) expect(sheet.has(date), date).toBe(false);
    }

    // And the mark is drawn on every school-shaped day the sheet does not hold,
    // which is the half a "never marks the wrong day" test would miss.
    const marked = [...cells.values()].filter((cell) => cell.noSchool).length;
    expect(marked).toBeGreaterThan(0);
    for (const date of sheet) expect(cells.get(date)?.noSchool, date).toBe(false);
  });
});

describe('a year with nothing in it', () => {
  it('draws no months at all', () => {
    const empty: SchoolYear = { ...SEEDED_SCHOOL_YEAR, terms: [], closures: [] };
    expect(monthGrid(empty, [])).toEqual([]);
  });
});
