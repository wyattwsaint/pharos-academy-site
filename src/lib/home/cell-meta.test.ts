import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { cellMeta } from './cell-meta.js';
import { TIMETABLE, type ClassEntry } from './timetable.js';

/**
 * #183: a cell says which semester its class runs in, when it runs in one.
 *
 * All three shapes the grid can hold are covered, including **spring** — no
 * spring class is in the grid today, and the one in the catalogue is not among
 * these cells, so the only thing standing between that path and a live page is
 * a hand edit to `TIMETABLE`. A test is what makes that edit safe.
 */

const RATES = SEEDED_MONEY_SETTINGS.rates;
const byslug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;
const entry = (meta: string): ClassEntry => ({
  id: 'test',
  title: 'A class',
  ends: 'ends 10:00 a.m.',
  meta,
  description: '',
});

describe('the line under a class in the week grid', () => {
  it('names the semester of a fall class, between the ages and the price', () => {
    expect(cellMeta(entry('Ages 5–10'), byslug('backyard-botany'), RATES)).toBe(
      'Ages 5–10 · fall · $140/sem',
    );
  });

  it('names the semester of a spring class, which no cell holds today', () => {
    expect(cellMeta(entry('Ages 7–10'), byslug('drawing-and-painting-grades-2-4'), RATES)).toBe(
      'Ages 7–10 · spring · $210/sem',
    );
  });

  it('marks a year-long class with nothing, because the year is the default', () => {
    expect(cellMeta(entry('Ages 6–8'), byslug('kingdom-math'), RATES)).toBe('Ages 6–8 · $420/yr');
  });

  it('marks a block with nothing either — a block publishes a length instead', () => {
    expect(cellMeta(entry('Ages 6–10'), byslug('what-is-a-community'), RATES)).not.toMatch(
      /fall|spring/,
    );
  });

  it('leaves a cell with no course exactly as the timetable types it', () => {
    expect(cellMeta(entry('Ages 5–10 · 12 weeks'), undefined, RATES)).toBe('Ages 5–10 · 12 weeks');
  });

  it('says nothing about a semester on any cell the grid holds but the fall two', () => {
    const marked = TIMETABLE.flatMap((slot) =>
      Object.values(slot.classes)
        .flat()
        .map((cell) => ({
          title: cell.title,
          meta: cellMeta(cell, cell.slug ? byslug(cell.slug) : undefined, RATES),
        })),
    ).filter((cell) => /·\s(fall|spring)\s·/.test(cell.meta));

    expect(marked.map((cell) => cell.title).sort()).toEqual(['Backyard Botany', 'Drawing & Painting']);
  });
});
