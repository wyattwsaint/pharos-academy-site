import { describe, expect, it } from 'vitest';

import { SEEDED_MONEY_SETTINGS } from '../money/settings.js';
import { CATALOGUE } from './catalogue.js';
import { coursePrice, priceLabel, priceLine, priceSummary } from './pricing.js';
import { contactHours } from './schedule.js';
import { MIRROR_RATE_CARD, mirrorFor } from './mirror.test-helper.js';

/**
 * #22 AC 2: every displayed price is computed from contact hours × rate tier
 * and matches the published figure for all nineteen courses.
 *
 * Both halves are asserted against the capture of the live site rather than
 * against numbers retyped here — the whole claim is "the formula agrees with
 * what the school already publishes", and a fixture that agreed with the
 * formula by construction would assert nothing.
 *
 * The rates are money settings now (#29), so every call here passes them in.
 * `RATES` is the seeded card — the figures the school publishes today — which
 * keeps these assertions comparing the formula against the live site rather
 * than against whatever a database happens to hold.
 */

const RATES = SEEDED_MONEY_SETTINGS.rates;

describe('the rate card', () => {
  it('is the two rates the school publishes', () => {
    expect(`$${RATES.standard}/hour`).toBe(MIRROR_RATE_CARD.standard);
    expect(`$${RATES.highSchoolCredit}/hour`).toBe(MIRROR_RATE_CARD.highSchoolCredit);
  });

  it('is what the price follows — a different card is a different price', () => {
    const algebra = CATALOGUE.find((course) => course.slug === 'algebra-1')!;
    expect(coursePrice(algebra, { standard: 10, highSchoolCredit: 30 }).total).toBe(1680);
  });
});

describe('contact hours', () => {
  it('are computed from the meeting times, and match the published figure', () => {
    // Weeks × meetings a week × the length of a meeting. Algebra 1's 56 is the
    // interesting one: it is the only course meeting twice in a week.
    for (const course of CATALOGUE) {
      expect(contactHours(course), course.title).toBe(mirrorFor(course.title).contactHours);
    }
  });
});

describe('the price', () => {
  it('is contact hours × the rate, for every one of the nineteen', () => {
    for (const course of CATALOGUE) {
      const price = coursePrice(course, RATES);
      expect(price.total, course.title).toBe(contactHours(course) * price.ratePerHour);
    }
  });

  it('matches every published figure', () => {
    for (const course of CATALOGUE) {
      const published = mirrorFor(course.title).cost;
      const price = coursePrice(course, RATES);
      expect({ ...price }, course.title).toMatchObject({
        year: published.year ?? null,
        semester: published.semester ?? null,
        flat: published.flat ?? null,
      });
    }
  });

  it('charges the rate the school publishes for that course', () => {
    for (const course of CATALOGUE) {
      const price = coursePrice(course, RATES);
      expect(`$${price.ratePerHour}/hour`, course.title).toBe(mirrorFor(course.title).cost.rate);
    }
  });

  it('halves a year course for its semester figure and never invents one', () => {
    const yearCourse = CATALOGUE.find((course) => course.slug === 'algebra-1');
    expect(coursePrice(yearCourse!, RATES)).toMatchObject({ year: 840, semester: 420, flat: null });

    // A one-semester course has no year price at all — the school does not sell
    // one, so the site must not print one.
    const fallOnly = CATALOGUE.find((course) => course.slug === 'backyard-botany');
    expect(coursePrice(fallOnly!, RATES)).toMatchObject({ year: null, semester: 140, flat: null });

    const block = CATALOGUE.find((course) => course.slug === 'insect-explorers');
    expect(coursePrice(block!, RATES)).toMatchObject({ year: null, semester: null, flat: 90 });
  });
});

describe('how a price reads', () => {
  it('writes the school’s own cost line', () => {
    const algebra = CATALOGUE.find((course) => course.slug === 'algebra-1')!;
    expect(priceLine(algebra, RATES)).toBe('$420/semester, $840/year ($15/hour)');

    const botany = CATALOGUE.find((course) => course.slug === 'backyard-botany')!;
    expect(priceLine(botany, RATES)).toBe('$140/semester ($10/hour)');

    const block = CATALOGUE.find((course) => course.slug === 'what-is-a-community')!;
    expect(priceLine(block, RATES)).toBe('$120 ($10/hour)');
  });

  it('gives a card one figure, never two', () => {
    for (const course of CATALOGUE) {
      expect(priceSummary(course, RATES), course.title).not.toContain(',');
      expect(priceSummary(course, RATES), course.title).toMatch(/^\$\d+(\/(yr|sem))?$/);
    }
  });

  it('never prints a bare number without its unit', () => {
    for (const course of CATALOGUE) {
      expect(priceLabel(course, RATES), course.title).toMatch(/^\$/);
    }
  });
});
