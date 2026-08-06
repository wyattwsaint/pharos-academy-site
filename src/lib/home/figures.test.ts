import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../courses/catalogue.js';
import { priceSummary } from '../courses/pricing.js';
import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { costFigures } from './content.js';
import { allClasses } from './timetable.js';

/**
 * The homepage's own money, read rather than typed (#29 AC 1).
 *
 * Two surfaces on the page quote figures — the costs band and the price on each
 * timetable cell — and both used to hold typed strings. What is asserted here
 * is that they now derive: change the settings and the page changes.
 */

const settings = SEEDED_MONEY_SETTINGS;

describe('the costs band', () => {
  it('quotes the catalogue’s real range, the registration fee and the deposit', () => {
    const figures = costFigures(CATALOGUE, settings);

    expect(figures.map((figure) => figure.amount)).toEqual(['$90–840', '$25', '$100']);
  });

  it('keeps the school’s own wording beside each figure', () => {
    expect(costFigures(CATALOGUE, settings).map((figure) => figure.note)).toEqual([
      'per class per year, paid directly to your instructor',
      'registration, once per student per year',
      'deposit per class, by cheque, holds the seat',
    ]);
  });

  it('follows the settings rather than restating them', () => {
    const raised = {
      ...settings,
      registrationFee: 40,
      classDeposit: 125,
      rates: { standard: 20, highSchoolCredit: 30 },
    };

    const figures = costFigures(CATALOGUE, raised);

    expect(figures.map((figure) => figure.amount)).toEqual(['$180–1680', '$40', '$125']);
  });

  it('omits the range rather than inventing one when there are no classes', () => {
    expect(costFigures([], settings).map((figure) => figure.amount)).toEqual(['$25', '$100']);
  });
});

describe('the timetable’s prices', () => {
  const bySlug = new Map(CATALOGUE.map((course) => [course.slug, course]));

  it('types no price into any cell’s meta line', () => {
    for (const entry of allClasses()) {
      expect(entry.meta, entry.id).not.toMatch(/\$\d/);
    }
  });

  it('names a real catalogue class wherever a price is meant to show', () => {
    const priced = allClasses().filter((entry) => entry.slug);
    // Thirteen of the fifteen cells. The two without a slug are the ones the
    // school quotes by length rather than by price.
    expect(priced.length).toBe(allClasses().length - 2);
    for (const entry of priced) {
      expect(bySlug.has(entry.slug!), entry.id).toBe(true);
    }
  });

  it('prices each of them at the figures the school publishes today', () => {
    const summaries = Object.fromEntries(
      allClasses()
        .filter((entry) => entry.slug)
        .map((entry) => [entry.id, priceSummary(bySlug.get(entry.slug!)!, settings.rates)]),
    );

    expect(summaries).toEqual({
      'latin-beginner': '$280/yr',
      'science-god-made-everything': '$420/yr',
      'spanish-basic-5-8': '$280/yr',
      'church-bible-history': '$420/yr',
      'letter-of-the-week': '$420/yr',
      'drawing-principles': '$420/yr',
      'spanish-basic-9-12': '$420/yr',
      'poetry-plays-patterns': '$420/yr',
      'kingdom-math': '$420/yr',
      'drawing-painting': '$210/sem',
      'backyard-botany': '$140/sem',
      'algebra-1-monday': '$840/yr',
      'algebra-1-wednesday': '$840/yr',
    });
  });

  it('leaves the two cells the school quotes by length alone', () => {
    const unpriced = allClasses().filter((entry) => !entry.slug);
    expect(unpriced.map((entry) => entry.meta)).toEqual([
      'Ages 5–10 · 12 weeks',
      'Ages 6–10 · rotating',
    ]);
  });
});
