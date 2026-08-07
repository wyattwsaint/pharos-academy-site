import { describe, expect, it } from 'vitest';

import { SEEDED_SCHOOL_YEAR } from '../calendar/year.js';
import { CATALOGUE } from '../courses/catalogue.js';
import { courseFormView } from './course-form.js';
import { emptyFields, fieldsOf, type CourseFields } from './courses.js';

/**
 * #59, #60 and #61 — the three things the editor showed from the saved row and
 * therefore did not show at all until a save had happened.
 *
 * Every case here reads the form as it stands. That is the whole point: a
 * warning, an end date and a date picker that need a write first are each one
 * save later than authoring time (#24 AC 4 and AC 6).
 */

const year = SEEDED_SCHOOL_YEAR;
const bySlug = (slug: string) => CATALOGUE.find((course) => course.slug === slug)!;

/** The seeded block: six Wednesdays from 3 March 2027, in the 10:40 slot. */
const BLOCK = bySlug('insect-explorers');

const view = (values: CourseFields, slug: string | null = null) =>
  courseFormView(values, { year, courses: CATALOGUE, slug });

/** The add form part-way through being filled in — nothing saved yet. */
const typing = (over: Partial<CourseFields>): CourseFields => ({ ...emptyFields(), ...over });

describe('the clash warning, before any save (#59)', () => {
  it('warns about a course as it is loaded, with nothing posted', () => {
    // Basic Spanish already shares its slot. Opening it must say so.
    const spanish = bySlug('basic-spanish-grades-9-12');
    const warnings = view(fieldsOf(spanish), spanish.slug).warnings;

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.course.slug !== spanish.slug)).toBe(true);
  });

  it('warns about a course being typed, from the fields alone', () => {
    const warnings = view(
      typing({
        days: ['Wednesday'],
        start: '10:40',
        end: '12:10',
        enrolment: 'year',
        weeks: '28',
      }),
    ).warnings;

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.track === 'Wednesday')).toBe(true);
  });

  it('says nothing at all on an empty add form', () => {
    // No day, no time: there is no schedule to be double-booked yet.
    expect(view(emptyFields()).warnings).toEqual([]);
  });

  it('says nothing while the time is half-typed', () => {
    // A start with no end is not a slot, and guessing one would invent a clash.
    const warnings = view(
      typing({ days: ['Wednesday'], start: '10:40', end: '', enrolment: 'year' }),
    ).warnings;

    expect(warnings).toEqual([]);
  });

  it('ignores a day the school year does not run', () => {
    const warnings = view(
      typing({ days: ['Friday'], start: '10:40', end: '12:10', enrolment: 'year' }),
    ).warnings;

    expect(warnings).toEqual([]);
  });

  it('calls a block with no start date a possible clash, not a certain one', () => {
    const warnings = view(
      typing({ days: ['Wednesday'], start: '10:40', end: '12:10', enrolment: 'block', weeks: '6' }),
    ).warnings;

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.severity === 'possible')).toBe(true);
  });
});

describe('the computed end date, before any save (#60)', () => {
  it('works the end out from the fields being typed', () => {
    const end = view(
      typing({
        days: ['Wednesday'],
        enrolment: 'block',
        weeks: '6',
        blockStart: BLOCK.dates[0]!,
      }),
    ).blockEnd;

    expect(end).toBe(BLOCK.dates.at(-1));
  });

  it('follows the week count as it is edited, not the saved run', () => {
    const shorter = view({ ...fieldsOf(BLOCK), weeks: '3' }, BLOCK.slug).blockEnd;

    expect(shorter).toBe(BLOCK.dates[2]);
    expect(shorter).not.toBe(BLOCK.dates.at(-1));
  });

  it('shows no end date until a start is picked', () => {
    const end = view(
      typing({ days: ['Wednesday'], enrolment: 'block', weeks: '6', blockStart: '' }),
    ).blockEnd;

    expect(end).toBeNull();
  });

  it('shows no end date for a run the year cannot hold', () => {
    // `blockMeetingDates` refuses this outright; the complaint belongs beside
    // the start field, where the parser already puts it, not here.
    const end = view(
      typing({
        days: ['Wednesday'],
        enrolment: 'block',
        weeks: '99',
        blockStart: BLOCK.dates[0]!,
      }),
    ).blockEnd;

    expect(end).toBeNull();
  });

  it('shows no end date for a course that is not a block', () => {
    const end = view({ ...fieldsOf(BLOCK), enrolment: 'year' }, BLOCK.slug).blockEnd;

    expect(end).toBeNull();
  });
});

describe('the block start picker (#61)', () => {
  it('offers the ticked track’s own meeting dates and no others', () => {
    const picker = view(typing({ days: ['Wednesday'], enrolment: 'block', weeks: '6' }));

    expect(picker.blockTrack).toBe('Wednesday');
    expect(picker.blockMeetings.length).toBeGreaterThan(0);
    expect(picker.blockMeetings.every((meeting) => meeting.track === 'Wednesday')).toBe(true);
  });

  it('offers nothing until a day is ticked', () => {
    const picker = view(typing({ enrolment: 'block', weeks: '6' }));

    expect(picker.blockTrack).toBeNull();
    expect(picker.blockMeetings).toEqual([]);
  });

  it('offers nothing while two days are ticked', () => {
    // A block meets on one track; the parser says so too.
    const picker = view(
      typing({ days: ['Monday', 'Wednesday'], enrolment: 'block', weeks: '6' }),
    );

    expect(picker.blockTrack).toBeNull();
    expect(picker.blockMeetings).toEqual([]);
  });

  it('offers nothing for a course that is not a block', () => {
    const picker = view(typing({ days: ['Wednesday'], enrolment: 'year', weeks: '28' }));

    expect(picker.blockTrack).toBeNull();
    expect(picker.blockMeetings).toEqual([]);
  });

  it('opens a saved block on its own track', () => {
    const picker = view(fieldsOf(BLOCK), BLOCK.slug);

    expect(picker.blockTrack).toBe('Wednesday');
    expect(picker.blockMeetings.some((meeting) => meeting.date === BLOCK.dates[0])).toBe(true);
  });
});
