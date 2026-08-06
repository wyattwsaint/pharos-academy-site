import { describe, expect, it } from 'vitest';

import { parseEvent } from './calendar-events.js';
import { fieldsOf, parseSchoolYear } from './school-year.js';
import { SEEDED_SCHOOL_YEAR } from '../calendar/year.js';

/**
 * The two admin forms (#23).
 *
 * The interesting one is the blank track: a row with neither a date nor a week
 * count is a track that does not run, which is a complete year and not a
 * validation failure. Half a row is an error, and the message says which half.
 */

/** The seeded year as the form would post it back unchanged. */
function postedYear(overrides: Record<string, string> = {}): FormData {
  const fields = fieldsOf(SEEDED_SCHOOL_YEAR);
  const form = new FormData();
  form.set('label', fields.label);
  for (const [key, term] of Object.entries(fields.terms)) {
    form.set(`${key}.firstClassDate`, term.firstClassDate);
    form.set(`${key}.weeks`, term.weeks);
  }
  for (const closure of fields.closures) {
    form.append('closure.date', closure.date);
    form.append('closure.label', closure.label);
  }
  // The form always offers spare closure rows, and they post as empty pairs.
  form.append('closure.date', '');
  form.append('closure.label', '');

  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe('the school year form', () => {
  it('round-trips the published year without complaint', () => {
    const parsed = parseSchoolYear(postedYear());
    expect(parsed.errors).toEqual({});
    expect(parsed.edit.terms).toHaveLength(8);
    expect(parsed.edit.closures).toHaveLength(SEEDED_SCHOOL_YEAR.closures.length);
  });

  it('reads a blank Tuesday row as a track that does not run, not as an error', () => {
    const parsed = parseSchoolYear(
      postedYear({
        'fall.Tuesday.firstClassDate': '',
        'fall.Tuesday.weeks': '',
        'spring.Tuesday.firstClassDate': '',
        'spring.Tuesday.weeks': '',
      }),
    );

    expect(parsed.errors).toEqual({});
    expect(parsed.edit.terms).toHaveLength(6);
    expect(parsed.edit.terms.some((term) => term.track === 'Tuesday')).toBe(false);
  });

  it('refuses half a row, and says which half', () => {
    const noWeeks = parseSchoolYear(postedYear({ 'fall.Tuesday.weeks': '' }));
    expect(noWeeks.errors['fall.Tuesday.weeks']).toMatch(/how many weeks/);

    const noDate = parseSchoolYear(postedYear({ 'fall.Tuesday.firstClassDate': '' }));
    expect(noDate.errors['fall.Tuesday.firstClassDate']).toMatch(/first class date/);
  });

  it('refuses a first class date that is not that track’s weekday', () => {
    const parsed = parseSchoolYear(postedYear({ 'fall.Wednesday.firstClassDate': '2026-09-03' }));
    expect(parsed.errors['fall.Wednesday.firstClassDate']).toMatch(/Thursday/);
  });

  it('keeps the closure rows and their errors index-for-index', () => {
    const form = postedYear();
    form.set('label', '2026–2027');
    // Blank the label of the third closure row, leaving its date.
    const labels = form.getAll('closure.label');
    form.delete('closure.label');
    labels.forEach((value, index) => form.append('closure.label', index === 2 ? '' : value));

    const parsed = parseSchoolYear(form);
    expect(parsed.errors['closures.2.label']).toBeTruthy();
    expect(parsed.values.closures[2]?.date).toBe(SEEDED_SCHOOL_YEAR.closures[2]!.date);
  });

  it('refuses the same day closed twice', () => {
    const form = postedYear();
    form.append('closure.date', SEEDED_SCHOOL_YEAR.closures[0]!.date);
    form.append('closure.label', 'Labor Day again');
    const parsed = parseSchoolYear(form);
    expect(Object.values(parsed.errors).some((message) => /already on the list/.test(message))).toBe(
      true,
    );
  });
});

describe('the event form', () => {
  const posted = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return parseEvent(form);
  };

  it('takes a date, a title and nothing else', () => {
    const parsed = posted({ heldOn: '2027-05-12', title: 'Field day' });
    expect(parsed.errors).toEqual({});
    expect(parsed.edit).toEqual({
      heldOn: '2027-05-12',
      title: 'Field day',
      startTime: null,
      place: null,
      note: null,
    });
  });

  it('keeps a time when there is one', () => {
    const parsed = posted({ heldOn: '2026-10-17', title: 'Open house', startTime: '18:30' });
    expect(parsed.edit.startTime).toBe('18:30');
  });

  it('refuses a date that is not a day, a missing title and a time that is not one', () => {
    const parsed = posted({ heldOn: '2026-02-30', title: '', startTime: 'half six' });
    expect(parsed.errors.heldOn).toBeTruthy();
    expect(parsed.errors.title).toBeTruthy();
    expect(parsed.errors.startTime).toBeTruthy();
  });
});
