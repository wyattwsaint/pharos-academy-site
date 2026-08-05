import { describe, expect, it } from 'vitest';

import { CATALOGUE } from './catalogue.js';
import {
  activeTracks,
  coursesOnTrack,
  DAY_TRACKS,
  layoutDay,
  layoutWeek,
  markLabel,
  minutesOfDay,
  overlappingPairs,
  overlaps,
  timeLabel,
} from './schedule.js';

/**
 * #22 AC 3 and AC 4 — the two facts the live timetable gets wrong, and the one
 * it must not "fix".
 */

const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;

describe('reading a time', () => {
  it('turns HH:MM into minutes', () => {
    expect(minutesOfDay('09:00')).toBe(540);
    expect(minutesOfDay('12:10')).toBe(730);
  });

  it('refuses anything that is not a time, rather than guessing', () => {
    expect(() => minutesOfDay('9:00')).toThrow();
    expect(() => minutesOfDay('')).toThrow();
  });
});

describe('writing a time', () => {
  it('writes the meridiem once when both ends share it', () => {
    expect(timeLabel('09:00', '10:30')).toBe('9:00-10:30 a.m.');
  });

  it('writes it twice when the class crosses noon', () => {
    expect(timeLabel('11:20', '12:20')).toBe('11:20 a.m.-12:20 p.m.');
    expect(timeLabel('10:40', '12:10')).toBe('10:40 a.m.-12:10 p.m.');
  });

  it('labels an axis mark the same way', () => {
    expect(markLabel(540)).toBe('9:00 a.m.');
    expect(markLabel(720)).toBe('12:00 p.m.');
  });
});

describe('overlap', () => {
  it('is real overlap, not adjacency', () => {
    // CONTEXT.md, "clash": 10:00-11:00 and 11:00-12:00 do not overlap.
    const latin = bySlug('beginner-latin-grades-7-8'); // Monday 9:00-10:00
    const drawing = bySlug('principles-of-drawing'); // Monday 10:10-11:10
    expect(overlaps(latin, drawing)).toBe(false);
  });

  it('finds the two pairs the live timetable draws as consecutive rows', () => {
    // The whole reason this ticket exists. Both pairs are on the Monday track:
    // Algebra 1 also runs Wednesday, but Kingdom Math does not.
    const monday = coursesOnTrack(CATALOGUE, 'Monday');
    const pairs = overlappingPairs(monday).map(([a, b]) => [a.slug, b.slug].sort().join(' + '));

    expect(pairs).toContain('god-made-everything + principles-of-drawing');
    expect(pairs).toContain('algebra-1 + kingdom-math');
  });
});

describe('laying out a day', () => {
  it('never puts two overlapping classes in one lane', () => {
    // The guarantee that makes the rendering honest: geometry carries the
    // fact, so no warning string has to.
    for (const layout of layoutWeek(CATALOGUE)) {
      for (const a of layout.placed) {
        for (const b of layout.placed) {
          if (a === b || a.lane !== b.lane) continue;
          expect(overlaps(a.course, b.course), `${a.course.title} / ${b.course.title}`).toBe(false);
        }
      }
    }
  });

  it('draws the two real pairs as overlapping, not consecutive', () => {
    const monday = layoutDay(CATALOGUE, 'Monday');
    const placed = (slug: string) => monday.placed.find((item) => item.course.slug === slug)!;

    for (const [left, right] of [
      ['god-made-everything', 'principles-of-drawing'],
      ['kingdom-math', 'algebra-1'],
    ] as const) {
      const a = placed(left);
      const b = placed(right);
      // Different lanes, and extents that genuinely intersect — which is what
      // "visibly overlapping" means once this is drawn to scale.
      expect(a.lane, `${left} / ${right}`).not.toBe(b.lane);
      expect(a.startMinutes).toBeLessThan(b.endMinutes);
      expect(b.startMinutes).toBeLessThan(a.endMinutes);
    }
  });

  it('gives the Wednesday 10:40 slot five electives sharing it, and calls it nothing', () => {
    // Oversubscription by design (CONTEXT.md, "clash"), never an error. The
    // layout has nowhere to put a warning: it returns lanes, and that is all.
    const wednesday = layoutDay(CATALOGUE, 'Wednesday');
    const atTen40 = wednesday.placed.filter((item) => item.startMinutes === minutesOfDay('10:40'));

    expect(atTen40.map((item) => item.course.slug).sort()).toEqual([
      'insect-explorers',
      'nocturnal-wonders',
      'pilgrims-progress-for-kids',
      'the-virtue-of-kindness',
      'what-is-a-community',
    ]);
    expect(new Set(atTen40.map((item) => item.lane)).size).toBe(5);
    expect(Object.keys(wednesday)).not.toContain('warnings');
  });

  it('runs from the half hour before the first class to the one after the last', () => {
    const monday = layoutDay(CATALOGUE, 'Monday');
    expect(monday.startMinutes).toBe(minutesOfDay('09:00'));
    expect(monday.endMinutes).toBe(minutesOfDay('12:30'));
    expect(monday.marks[0]).toBe(monday.startMinutes);
    expect(monday.marks[monday.marks.length - 1]).toBe(monday.endMinutes);
  });

  it('places every class on the day exactly once', () => {
    for (const layout of layoutWeek(CATALOGUE)) {
      const onTrack = coursesOnTrack(CATALOGUE, layout.track);
      expect(layout.placed).toHaveLength(onTrack.length);
      expect(layout.placed.map((item) => item.course.slug)).toEqual(
        onTrack.map((course) => course.slug),
      );
    }
  });
});

describe('the day tracks', () => {
  it('are the school’s four, in calendar order', () => {
    expect([...DAY_TRACKS]).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
  });

  it('treat an empty Tuesday as complete, and simply do not draw it', () => {
    expect(coursesOnTrack(CATALOGUE, 'Tuesday')).toEqual([]);
    expect(activeTracks(CATALOGUE)).toEqual(['Monday', 'Wednesday', 'Thursday']);
  });

  it('draw a Tuesday the moment a Tuesday course exists', () => {
    const moved = CATALOGUE.map((course) =>
      course.slug === 'kingdom-math' ? { ...course, days: ['Tuesday' as const] } : course,
    );
    expect(activeTracks(moved)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
  });

  it('puts Algebra 1 on both of its day tracks', () => {
    expect(coursesOnTrack(CATALOGUE, 'Monday').map((c) => c.slug)).toContain('algebra-1');
    expect(coursesOnTrack(CATALOGUE, 'Wednesday').map((c) => c.slug)).toContain('algebra-1');
  });
});
