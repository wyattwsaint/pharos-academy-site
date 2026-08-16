import { describe, expect, it } from 'vitest';

import { SEEDED_SCHOOL_YEAR, type SchoolYear } from '../calendar/year.js';
import { ENROLMENT_UNITS, RATE_TIERS } from '../courses/course.js';
import {
  courseDeletion,
  parseCourse,
  RATE_LABELS,
  UNIT_LABELS,
  type CourseContext,
} from './courses.js';

/**
 * The course form (#24).
 *
 * The parser's job is the same as every other admin parser's — every complaint
 * at once, values always handed back — plus the two facts this screen exists
 * for: the days on offer are the year's running tracks and nothing else, and a
 * block's dates are its track's real meeting dates or honestly absent.
 */

const CONTEXT: CourseContext = {
  year: SEEDED_SCHOOL_YEAR,
  instructorSlugs: ['angela-fecteau', 'george-jensen'],
};

/** A good Thursday fall course, as the form would post it. */
function postedCourse(
  overrides: Record<string, string> = {},
  lists: Record<string, string[]> = {},
): FormData {
  const form = new FormData();
  form.set('title', 'Backyard Botany');
  form.set('description', 'Discover the trees and plants of Central Pennsylvania.');
  form.set('time', '11:10-12:10');
  form.set('enrolment', 'fall');
  form.set('weeks', '14');
  form.set('ageLabel', '5-10 (approximately K-6th grades)');
  form.set('ageMin', '5');
  form.set('ageMax', '10');
  form.set('rateTier', 'standard');
  form.set('materialsFee', '10');
  form.set('prerequisites', 'None (just a curious mind)');
  form.set('instructorSlug', 'angela-fecteau');

  const many: Record<string, string[]> = {
    stages: ['Elementary (Grammar Stage)'],
    days: ['Thursday'],
    enrolmentUnits: ['fall'],
    ...lists,
  };
  for (const [name, values] of Object.entries(many)) {
    for (const value of values) form.append(name, value);
  }
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe('the course form', () => {
  it('round-trips a good course without complaint', () => {
    const parsed = parseCourse(postedCourse(), CONTEXT);
    expect(parsed.errors).toEqual({});
    expect(parsed.edit).toEqual({
      title: 'Backyard Botany',
      description: 'Discover the trees and plants of Central Pennsylvania.',
      stages: ['Elementary (Grammar Stage)'],
      days: ['Thursday'],
      start: '11:10',
      end: '12:10',
      enrolment: 'fall',
      enrolmentUnits: ['fall'],
      weeks: 14,
      dates: [],
      ageLabel: '5-10 (approximately K-6th grades)',
      ageMin: 5,
      ageMax: 10,
      rateTier: 'standard',
      credit: null,
      requiredText: null,
      optionalText: null,
      materialsToBuy: null,
      materialsFee: 10,
      materialsFeeNote: null,
      assessmentFee: null,
      assessmentFeeNote: null,
      prerequisites: 'None (just a curious mind)',
      instructorSlug: 'angela-fecteau',
    });
  });

  it('collects every complaint of an empty form at once', () => {
    const parsed = parseCourse(new FormData(), CONTEXT);
    for (const field of [
      'title',
      'description',
      'stages',
      'days',
      'start',
      'end',
      'enrolment',
      'enrolmentUnits',
      'weeks',
      'ageLabel',
      'rateTier',
      'prerequisites',
    ] as const) {
      expect(parsed.errors[field], field).toBeTruthy();
    }
    // Every field but one. The instructor is the field an empty form may leave
    // empty (#257): a class the school means to run and has not staffed is a
    // real answer, so there is nothing to complain about.
    expect(parsed.errors.instructorSlug).toBeUndefined();
  });

  it('reads a picked slot as its two ends', () => {
    const parsed = parseCourse(postedCourse({ time: '09:00-10:30' }), CONTEXT);
    expect(parsed.errors).toEqual({});
    expect(parsed.edit.start).toBe('09:00');
    expect(parsed.edit.end).toBe('10:30');
  });

  it('takes a typed time when the pick is custom, and holds it to the clock', () => {
    const typed = postedCourse({ time: 'custom', start: '13:00', end: '14:15' });
    expect(parseCourse(typed, CONTEXT).errors).toEqual({});
    expect(parseCourse(typed, CONTEXT).edit.start).toBe('13:00');

    const sloppy = parseCourse(
      postedCourse({ time: 'custom', start: '9:00', end: '25:00' }),
      CONTEXT,
    );
    expect(sloppy.errors.start).toMatch(/24-hour/);
    expect(sloppy.errors.end).toMatch(/24-hour/);

    const backwards = parseCourse(
      postedCourse({ time: 'custom', start: '10:00', end: '09:00' }),
      CONTEXT,
    );
    expect(backwards.errors.end).toMatch(/end after it starts/);
  });

  it('offers only the days the year runs', () => {
    const noTuesday: SchoolYear = {
      ...SEEDED_SCHOOL_YEAR,
      terms: SEEDED_SCHOOL_YEAR.terms.filter((term) => term.track !== 'Tuesday'),
    };
    const parsed = parseCourse(postedCourse({}, { days: ['Tuesday'] }), {
      ...CONTEXT,
      year: noTuesday,
    });
    expect(parsed.errors.days).toMatch(/does not meet on Tuesday/);
  });

  it('requires at least one enrolment unit, never inferring one', () => {
    const parsed = parseCourse(postedCourse({}, { enrolmentUnits: [] }), CONTEXT);
    expect(parsed.errors.enrolmentUnits).toMatch(/at least one/);
  });

  it('turns a block start into that track’s real meeting dates', () => {
    const parsed = parseCourse(
      postedCourse(
        { enrolment: 'block', weeks: '5', blockStart: '2026-11-12' },
        { enrolmentUnits: ['block'] },
      ),
      CONTEXT,
    );
    expect(parsed.errors).toEqual({});
    // Five consecutive Thursday meetings: Thanksgiving's 26 November is
    // skipped, and the fall ends at 10 December, so the fifth is spring's
    // first Thursday — the column is the track's whole year.
    expect(parsed.edit.dates).toEqual([
      '2026-11-12',
      '2026-11-19',
      '2026-12-03',
      '2026-12-10',
      '2027-01-07',
    ]);
  });

  it('leaves a block with no start honestly dateless, and refuses a bad one', () => {
    const unpicked = parseCourse(
      postedCourse({ enrolment: 'block', weeks: '5' }, { enrolmentUnits: ['block'] }),
      CONTEXT,
    );
    expect(unpicked.errors).toEqual({});
    expect(unpicked.edit.dates).toEqual([]);

    const offDay = parseCourse(
      postedCourse(
        { enrolment: 'block', weeks: '5', blockStart: '2026-11-13' },
        { enrolmentUnits: ['block'] },
      ),
      CONTEXT,
    );
    expect(offDay.errors.blockStart).toMatch(/does not meet on 2026-11-13/);
  });

  it('holds a block to exactly one day track', () => {
    const parsed = parseCourse(
      postedCourse({ enrolment: 'block' }, { days: ['Monday', 'Thursday'], enrolmentUnits: ['block'] }),
      CONTEXT,
    );
    expect(parsed.errors.days).toMatch(/exactly one/);
  });

  it('takes both ends of the age range or neither, low to high', () => {
    const half = parseCourse(postedCourse({ ageMax: '' }), CONTEXT);
    expect(half.errors.ageMax).toMatch(/both ends/);

    const backwards = parseCourse(postedCourse({ ageMin: '12', ageMax: '5' }), CONTEXT);
    expect(backwards.errors.ageMax).toMatch(/youngest to oldest/);

    const none = parseCourse(postedCourse({ ageMin: '', ageMax: '' }), CONTEXT);
    expect(none.errors).toEqual({});
    expect(none.edit.ageMin).toBeNull();
    expect(none.edit.ageMax).toBeNull();
  });

  it('reads a fee in whole dollars and refuses a note with no fee', () => {
    const dollars = parseCourse(postedCourse({ materialsFee: '$50' }), CONTEXT);
    expect(dollars.errors).toEqual({});
    expect(dollars.edit.materialsFee).toBe(50);

    const words = parseCourse(postedCourse({ materialsFee: 'ten' }), CONTEXT);
    expect(words.errors.materialsFee).toMatch(/whole number of dollars/);

    const strayNote = parseCourse(
      postedCourse({ assessmentFee: '', assessmentFeeNote: 'for test scoring' }),
      CONTEXT,
    );
    expect(strayNote.errors.assessmentFeeNote).toMatch(/give the assessment fee/i);
  });

  it('refuses an instructor who is not on the people list', () => {
    const parsed = parseCourse(postedCourse({ instructorSlug: 'nobody' }), CONTEXT);
    expect(parsed.errors.instructorSlug).toMatch(/people list/);
  });

  it('saves a class nobody has been assigned to yet', () => {
    // #257. Nothing picked is an answer — the class is scheduled and not
    // staffed — and it is stored as null rather than as the empty string the
    // select posts, so every surface asks one question and gets one answer.
    const parsed = parseCourse(postedCourse({ instructorSlug: '' }), CONTEXT);
    expect(parsed.errors).toEqual({});
    expect(parsed.edit.instructorSlug).toBeNull();
  });

  /*
   * The form renders one control per unit and one per rate, from the domain's
   * own lists. A value with no label would render an empty box that still
   * posts — a control nobody can read but anybody can tick.
   */
  it('has a human label for every enrolment unit and every rate', () => {
    for (const unit of ENROLMENT_UNITS) expect(UNIT_LABELS[unit]).toBeTruthy();
    for (const tier of RATE_TIERS) expect(RATE_LABELS[tier]).toBeTruthy();
  });
});

/**
 * What the screen says before a class is deleted (#267, ADR-0021).
 *
 * Asserted here rather than through a browser because these sentences *are* the
 * safety net: there is no undo, and the office decides on nothing else. The
 * browser proves the round trip; this proves the words, including the case the
 * whole ticket turned on — a class families have already applied for.
 */
describe('the course deletion confirmation', () => {
  it('names the class in the question and in the button that answers it', () => {
    const deletion = courseDeletion('Backyard Botany', 0);

    expect(deletion.heading).toBe('Delete Backyard Botany?');
    expect(deletion.confirmLabel).toBe('Yes, delete Backyard Botany');
    // The way out says what it does, so neither control is read as the other.
    expect(deletion.declineLabel).toBe('Go back without deleting');
  });

  it('names the four surfaces the class comes off', () => {
    const { goes } = courseDeletion('Backyard Botany', 0);

    expect(goes).toContain('Backyard Botany');
    expect(goes).toContain('class lists');
    expect(goes).toContain('timetable');
    expect(goes).toContain('application');
    expect(goes).toContain('own page');
  });

  it('says there is no undo, and points at the press that has one', () => {
    // Retire is the thing the office may actually have meant — a class the
    // school is not running *this* year — so the irreversible screen names it.
    const { undo } = courseDeletion('Backyard Botany', 0);

    expect(undo).toContain('no undo');
    expect(undo).toContain('retire it instead');
  });

  it('says plainly that nobody has applied, which is the ordinary case', () => {
    // A class typed in by mistake, or one the school decided against before
    // anybody saw it. Nothing is riding on the press, and saying so is what
    // makes it obviously safe.
    expect(courseDeletion('Backyard Botany', 0).applied).toBe(
      'No family has applied for this class, so nothing anybody has sent mentions it.',
    );
  });

  it('says one application in the singular, all the way through the sentence', () => {
    // Written out whole rather than assembled, like `keptSentence` next door:
    // the subject is not the only word a count changes, and "one application …
    // changes none of them" is what assembling it produces.
    const { applied } = courseDeletion('Backyard Botany', 1);

    expect(applied).toContain('One application has');
    expect(applied).toContain('changes nothing about that application');
    expect(applied).not.toContain('none of them');
    expect(applied).toContain('Backyard Botany');
    expect(applied).toContain('no longer offered');
    expect(applied).toContain('tally');
  });

  it('counts them in the plural, and keeps the same promise', () => {
    const { applied } = courseDeletion('Backyard Botany', 3);

    expect(applied).toContain('3 applications have');
    expect(applied).toContain('changes none of them');
    expect(applied).toContain('tally');
  });

  it('never says the delete could be refused', () => {
    // The delete is unconditional (ADR-0021): after one application season a
    // refusal would mean no class could ever be deleted again. A confirmation
    // that warned of one would be describing a screen that does not exist.
    for (const applications of [0, 1, 5]) {
      const deletion = courseDeletion('Backyard Botany', applications);
      const words = `${deletion.goes} ${deletion.applied} ${deletion.undo}`;
      expect(words).not.toMatch(/cannot be deleted|will be refused|not allowed/i);
    }
  });
});
