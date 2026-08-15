import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { DAY_TRACKS } from '../courses/schedule.js';
import type { CalendarEvent } from './event.js';
import { monthGrid, printedYear, type MonthCell } from './months.js';
import {
  addDays,
  previewRows,
  SEEDED_SCHOOL_YEAR,
  SEMESTERS,
  trackColumn,
  trackOfDate,
  type SchoolYear,
} from './year.js';

/**
 * The month grid, against the year the school has already published (#186).
 *
 * The load-bearing assertion is the last one: the grid and the sheet are two
 * drawings of one year on one page, and the failure that matters is not a
 * misplaced cell but the two of them disagreeing about whether the school is
 * open. That is asserted date by date rather than spot-checked.
 */

/** Every cell of every month, by date — the blanks dropped. */
function datedCells(blocks: ReturnType<typeof monthGrid>): Map<string, MonthCell> {
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
    const blocks = monthGrid(SEEDED_SCHOOL_YEAR, [], []);

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
    const blocks = monthGrid(SEEDED_SCHOOL_YEAR, [], []);
    const july = monthGrid(
      {
        ...SEEDED_SCHOOL_YEAR,
        terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.semester === 'fall'),
      },
      [event('2027-07-04', 'Independence Day picnic')],
      [],
    );

    // The fall alone runs to December; a July one-off pulls the span out to it,
    // and the six months in between are drawn empty rather than skipped.
    expect(july.map((block) => block.id)).toContain('2027-05');
    expect(blocks.map((block) => block.id)).not.toContain('2027-05');
  });

  it('lays each month out in whole weeks, Monday first', () => {
    const november = monthGrid(SEEDED_SCHOOL_YEAR, [], []).find((block) => block.id === '2026-11')!;

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
    const cells = datedCells(monthGrid(SEEDED_SCHOOL_YEAR, events, []));

    expect(cells.get('2026-09-18')?.events.map((one) => one.title)).toEqual(['Fall open house']);
    expect(cells.get('2027-03-04')?.events.map((one) => one.title)).toEqual(['Picture day']);
  });

  it('keeps two one-offs on one date as two, in the order it was given them', () => {
    const events = [event('2026-10-17', 'Open house'), event('2026-10-17', 'Bake sale')];
    const cells = datedCells(monthGrid(SEEDED_SCHOOL_YEAR, events, []));

    expect(cells.get('2026-10-17')?.events.map((one) => one.title)).toEqual([
      'Open house',
      'Bake sale',
    ]);
  });
});

describe('the days the school is shut', () => {
  const cells = datedCells(monthGrid(SEEDED_SCHOOL_YEAR, [], []));

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
    const shortCells = datedCells(monthGrid(short, [], []));

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
   * handed — so the grid is held to it rather than the other way round, and for
   * every date of the year rather than for a handful.
   *
   * Both directions, because only one of them is the interesting one. That the
   * grid never contradicts a date the sheet holds is the easy half; that it
   * marks **every** teaching weekday the sheet leaves out is the half a grid
   * that simply drew nothing would also pass.
   */
  it('agrees with the sheet, date for date', () => {
    const semesters = SEMESTERS.map((semester) => {
      const dates = previewRows(SEEDED_SCHOOL_YEAR, semester)
        .flatMap((row) => (row.kind === 'week' ? DAY_TRACKS.map((track) => row.cells[track]) : []))
        .filter((date): date is string => date !== null)
        .sort();
      return { held: new Set(dates), from: dates[0]!, to: dates[dates.length - 1]! };
    });

    let checked = 0;
    for (const term of semesters) {
      for (let date = term.from; date <= term.to; date = addDays(date, 1)) {
        const cell = cells.get(date);
        expect(cell, date).toBeDefined();
        // Marked exactly when the school teaches that weekday and no column of
        // the sheet holds the date.
        expect(cell!.noSchool, date).toBe(trackOfDate(date) !== null && !term.held.has(date));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);

    // And nothing between the semesters or outside them is marked at all.
    for (const [date, cell] of cells) {
      if (semesters.some((term) => date >= term.from && date <= term.to)) continue;
      expect(cell.noSchool, date).toBe(false);
    }
  });
});

/**
 * What meets on a date (#235).
 *
 * The grid reveals the **meetings** rather than printing them, and this is where
 * the revealing is proved: which offerings a date carries, which it does not, and
 * how they are grouped. What Playwright is left is the one thing only a browser
 * has — that the control opens, and opens from a keyboard.
 */
describe('the classes a date reveals', () => {
  const cells = datedCells(monthGrid(SEEDED_SCHOOL_YEAR, [], CATALOGUE));
  const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;
  /** Every offering on a date, slots flattened, as the links the panel shows. */
  const hrefsOn = (date: string) =>
    (cells.get(date)?.slots ?? []).flatMap((slot) => slot.offerings.map((one) => one.href));

  it('carries the offerings meeting that day and no others', () => {
    // The Monday of week 10, where the fall's Drawing joins the six year courses
    // and the spring's Drawing — same track, same slot — is nowhere near it.
    expect(hrefsOn('2026-11-09').sort()).toEqual(
      [
        '/classes/algebra-1',
        '/classes/beginner-latin-grades-5-6',
        '/classes/beginner-latin-grades-7-8',
        '/classes/drawing-and-painting-grades-5-8',
        '/classes/god-made-everything',
        '/classes/kingdom-math',
        '/classes/principles-of-drawing',
      ].sort(),
    );
    expect(cells.get('2026-11-09')?.classLabel).toBe('7 classes');
  });

  it('gives a date whose day track runs nothing no control at all', () => {
    /*
     * The Tuesday track meets fourteen times in the seeded year and carries no
     * courses, which is its routine state rather than a gap. The cell stays a
     * school day — it is not marked shut — and simply offers nothing to open.
     */
    const tuesday = cells.get('2026-11-10')!;

    expect(tuesday.noSchool).toBe(false);
    expect(tuesday.slots).toEqual([]);
    expect(tuesday.classLabel).toBeNull();
  });

  it('says "1 class" when one class meets', () => {
    const alone = datedCells(monthGrid(SEEDED_SCHOOL_YEAR, [], [bySlug('kingdom-math')]));

    expect(alone.get('2026-11-09')?.classLabel).toBe('1 class');
  });

  it('keeps a fall offering out of February and lets the spring one in', () => {
    const february = trackColumn(SEEDED_SCHOOL_YEAR, 'Monday')
      .map((meeting) => meeting.date)
      .find((date) => date.startsWith('2027-02'))!;

    // Both Drawings are the Monday 10:40 slot; the enrolment unit is the whole
    // of what keeps them apart, and February is where it shows.
    expect(hrefsOn(february)).toContain('/classes/drawing-and-painting-grades-2-4');
    expect(hrefsOn(february)).not.toContain('/classes/drawing-and-painting-grades-5-8');
    expect(hrefsOn('2026-11-09')).not.toContain('/classes/drawing-and-painting-grades-2-4');
  });

  it('gives a block only its own run', () => {
    // Six Wednesdays from 14 October, over the Election Day closure, ending on
    // 18 November — and nothing on the Wednesday after it.
    const run = bySlug('the-virtue-of-kindness').dates;
    const href = '/classes/the-virtue-of-kindness';

    for (const date of run) expect(hrefsOn(date), date).toContain(href);
    expect(hrefsOn('2026-11-25')).not.toContain(href);
    expect(hrefsOn('2026-10-07')).not.toContain(href);
    // And every date it is drawn on is one of its own.
    for (const [date, cell] of cells) {
      if (cell.slots.some((slot) => slot.offerings.some((one) => one.href === href))) {
        expect(run, date).toContain(date);
      }
    }
  });

  it('groups the offerings by their time slot, earliest slot first', () => {
    const monday = cells.get('2026-11-09')!;

    expect(monday.slots.map((slot) => slot.time)).toEqual([
      '9:00-10:00 a.m.',
      '9:00-10:30 a.m.',
      '10:10-11:10 a.m.',
      '10:40 a.m.-12:10 p.m.',
      '11:20 a.m.-12:20 p.m.',
    ]);
    // The 10:40 slot is two alternatives at once, not a sequence of two, and it
    // is one group saying so rather than two lines that look consecutive.
    expect(monday.slots[3]?.offerings.map((one) => one.title)).toEqual([
      bySlug('drawing-and-painting-grades-5-8').title,
      bySlug('kingdom-math').title,
    ]);
  });

  it('reveals nothing when it is given no catalogue', () => {
    // The page passes the courses; a caller that does not gets a grid with no
    // controls on it rather than a grid that has invented a timetable.
    for (const cell of datedCells(monthGrid(SEEDED_SCHOOL_YEAR, [], [])).values()) {
      expect(cell.slots, cell.date).toEqual([]);
      expect(cell.classLabel, cell.date).toBeNull();
    }
  });
});

describe('a year with nothing in it', () => {
  it('draws no months at all', () => {
    const empty: SchoolYear = { ...SEEDED_SCHOOL_YEAR, terms: [], closures: [] };
    expect(monthGrid(empty, [], [])).toEqual([]);
  });
});

/**
 * The year on paper (#236).
 *
 * Asserted here rather than through a stylesheet: the folding is arithmetic over
 * dates and names, and the case that would be caught in a school office — a run
 * crossing a month boundary — is one no rendered page makes obvious.
 */
describe('the year as a printed list', () => {
  const printed = (year: SchoolYear, events: CalendarEvent[] = []) =>
    printedYear(monthGrid(year, events, []));

  /** Every line of every month, in the order paper prints them. */
  const linesOf = (months: ReturnType<typeof printedYear>) =>
    months.flatMap((month) => month.lines);

  it('lists the year month by month, and only the months carrying something', () => {
    const months = printed(SEEDED_SCHOOL_YEAR);

    /*
     * The four months the seeded year has closures in — and December is not one
     * of them, which is the boundary case rather than an omission: its only
     * closed day is 1 December, and that is the far end of a Thanksgiving run
     * that opened on 30 November and prints as one line under November.
     */
    expect(months.map((month) => month.id)).toEqual(['2026-09', '2026-11', '2027-03']);
    expect(months[0]?.heading).toBe('September 2026');
    // Every line belongs to the month it is printed under.
    for (const month of months) {
      for (const line of month.lines) expect(line.date.slice(0, 7), line.days).toBe(month.id);
    }
  });

  it('prints only the dates carrying something', () => {
    const dates = new Set(linesOf(printed(SEEDED_SCHOOL_YEAR)).map((line) => line.date));

    // The school's own closures, and not the 112 dates it teaches on.
    expect(dates).toContain('2026-09-07');
    expect(dates).not.toContain('2026-09-08');
    expect(dates).not.toContain('2026-09-02');
  });

  it('prints a one-off’s title, its time and its place', () => {
    const evening: CalendarEvent = {
      ...event('2026-10-17', 'Fall open house'),
      startTime: '18:30',
      place: 'The gym',
    };
    const months = printed(SEEDED_SCHOOL_YEAR, [evening]);

    expect(linesOf(months)).toContainEqual({
      date: '2026-10-17',
      through: '2026-10-17',
      days: '17',
      entry: { kind: 'one-off', title: 'Fall open house', time: '6.30pm', place: 'The gym' },
    });
  });

  it('prints a one-off with no time as its title alone, saying nothing is missing', () => {
    const months = printed(SEEDED_SCHOOL_YEAR, [event('2026-10-17', 'Field day')]);

    const line = linesOf(months).find((one) => one.date === '2026-10-17');

    expect(line?.entry).toEqual({ kind: 'one-off', title: 'Field day', time: null, place: null });
  });

  it('carries a one-off the school keeps in its own Google calendar', () => {
    /*
     * A synced one-off is the same shape as a typed one and arrives on the same
     * list (#153), so what this proves is that nothing here filters by where a
     * one-off came from — which is the whole of AC 4.
     */
    const synced = { ...event('2027-02-11', 'Founders’ day'), slug: 'google-abc123' };
    const dates = linesOf(printed(SEEDED_SCHOOL_YEAR, [synced])).map((line) => line.date);

    expect(dates).toContain('2027-02-11');
  });

  it('folds consecutive closures sharing a name into one line', () => {
    // Thanksgiving's Wednesday and Thursday, which the school named once.
    const thanksgiving = linesOf(printed(SEEDED_SCHOOL_YEAR)).find(
      (line) => line.date === '2026-11-25',
    );

    expect(thanksgiving).toEqual({
      date: '2026-11-25',
      through: '2026-11-26',
      days: '25–26',
      entry: { kind: 'closure', label: 'Thanksgiving' },
    });
  });

  it('leaves a single closure a single line, not a range of one', () => {
    const labor = linesOf(printed(SEEDED_SCHOOL_YEAR)).find((line) => line.date === '2026-09-07');

    expect(labor).toMatchObject({ through: '2026-09-07', days: '7' });
  });

  it('keeps two adjacent closures called different things as two lines', () => {
    const year: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      closures: [
        { date: '2026-11-25', label: 'Thanksgiving' },
        { date: '2026-11-26', label: 'Staff day' },
      ],
    };
    const lines = linesOf(printed(year)).filter((line) => line.date.startsWith('2026-11-2'));

    // The name is the only thing that says two shut days are one thing.
    expect(lines.map((line) => line.days)).toEqual(['25', '26']);
  });

  it('never folds two shut days the school has not named', () => {
    /*
     * The same year `the days the school is shut` uses: a Monday track two
     * weeks short leaves 7 and 14 December taught by nobody and called nothing.
     * Two *adjacent* such days would fold on `null === null` and print as a
     * range the school never gave a reason for, so the fall's last Wednesday and
     * Thursday are taken off here to make a pair that sits side by side.
     */
    const year: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.map((term) =>
        term.semester === 'fall' && (term.track === 'Wednesday' || term.track === 'Thursday')
          ? { ...term, weeks: 13 }
          : term,
      ),
    };
    const unnamed = linesOf(printed(year)).filter(
      (line) => line.entry.kind === 'closure' && line.entry.label === null,
    );

    // 9 and 10 December, side by side and each on its own line.
    expect(unnamed.map((line) => line.date)).toEqual(['2026-12-09', '2026-12-10']);
    for (const line of unnamed) expect(line.through, line.days).toBe(line.date);
  });

  it('folds a run that crosses a month boundary, and says both months', () => {
    const year: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      closures: [
        { date: '2026-11-30', label: 'Thanksgiving' },
        { date: '2026-12-01', label: 'Thanksgiving' },
      ],
    };
    const lines = linesOf(printed(year)).filter((line) => line.entry.kind === 'closure');

    // One line, printed under the month it starts in, naming the month it ends in.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      date: '2026-11-30',
      through: '2026-12-01',
      days: '30 November–1 December',
    });
    expect(printed(year).find((month) => month.id === '2026-11')?.lines).toContainEqual(lines[0]);
    expect(printed(year).map((month) => month.id)).not.toContain('2026-12');
  });

  it('prints the closure of a date above the one-offs held on it', () => {
    const year: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      closures: [{ date: '2026-11-25', label: 'Thanksgiving' }],
    };
    const lines = linesOf(printed(year, [event('2026-11-25', 'Turkey trot')]));
    const kinds = lines
      .filter((line) => line.date === '2026-11-25')
      .map((line) => line.entry.kind);

    expect(kinds).toEqual(['closure', 'one-off']);
  });
});
