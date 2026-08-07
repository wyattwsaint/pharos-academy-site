import type { SchoolYear } from '../calendar/year.js';
import {
  isEnrolmentUnit,
  RATE_TIERS,
  STAGES,
  type Course,
  type EnrolmentUnit,
  type RateTier,
  type Stage,
} from '../courses/course.js';
import { isClockTime, minutesOfDay, type DayTrack } from '../courses/schedule.js';
import { blockMeetingDates, runningTracks } from '../courses/slots.js';
import type { CourseEdit } from '../courses/store.js';

/**
 * A course, as the admin form posts it (#24).
 *
 * Works like the other parsers here: it always hands back values, valid or not,
 * so a rejected form redisplays what was typed, and it collects every complaint
 * at once rather than one per round trip.
 *
 * Two absences are the design. **There is no price field to parse** — the price
 * is computed from the meeting times, the week count and the rate tier
 * (`pricing.ts`), and a parser with no field for it is how "cannot be typed
 * over" is a property rather than a promise. And **the days on offer are the
 * year's**, not a hard-coded week: a track the School Year screen gives no term
 * is a day the school does not meet, so a course posted onto it is refused with
 * the reason.
 */

/** The one time option that is not a slot: type the two ends yourself. */
export const CUSTOM_TIME = 'custom';

/** The form's fields as posted, kept as strings so a rejected form redisplays. */
export type CourseFields = {
  title: string;
  description: string;
  stages: string[];
  days: string[];
  /** The slot select's value: `HH:MM-HH:MM`, or `custom`, or nothing yet. */
  time: string;
  start: string;
  end: string;
  enrolment: string;
  enrolmentUnits: string[];
  weeks: string;
  /** A block's picked first meeting date, or nothing picked yet. */
  blockStart: string;
  ageLabel: string;
  ageMin: string;
  ageMax: string;
  rateTier: string;
  credit: string;
  requiredText: string;
  optionalText: string;
  materialsToBuy: string;
  materialsFee: string;
  materialsFeeNote: string;
  assessmentFee: string;
  assessmentFeeNote: string;
  prerequisites: string;
  instructorSlug: string;
};

export type CourseErrors = Partial<Record<keyof CourseFields, string>>;

export type ParsedCourse = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: CourseFields;
  /** The course to save. Only meaningful when `errors` is empty. */
  edit: CourseEdit;
  errors: CourseErrors;
};

/** What the parser needs to know beyond the form itself. */
export type CourseContext = {
  /** The saved school year — the days on offer and every block date come from it. */
  year: SchoolYear;
  /** Everybody on the people list. A course may only name one of them. */
  instructorSlugs: readonly string[];
};

/** The human names of the fields, used in both the form and its errors. */
export const LABELS: Record<keyof CourseFields, string> = {
  title: 'Title',
  description: 'Description',
  stages: 'Stages',
  days: 'Meets on',
  time: 'Meeting time',
  start: 'Starts at',
  end: 'Ends at',
  enrolment: 'Runs as',
  enrolmentUnits: 'Families can enrol for',
  weeks: 'Weeks',
  blockStart: 'Block start date',
  ageLabel: 'Ages, in the school’s words',
  ageMin: 'Youngest age',
  ageMax: 'Oldest age',
  rateTier: 'Rate',
  credit: 'Credit',
  requiredText: 'Required texts',
  optionalText: 'Optional texts',
  materialsToBuy: 'Materials to buy',
  materialsFee: 'Materials fee',
  materialsFeeNote: 'Materials fee note',
  assessmentFee: 'Assessment fee',
  assessmentFeeNote: 'Assessment fee note',
  prerequisites: 'Prerequisites',
  instructorSlug: 'Instructor',
};

/**
 * The four enrolment units in the school's own words.
 *
 * The stored value is the vocabulary (`year`, `fall`, …); this is what a person
 * reads beside a checkbox. Both the shape radios and the units checkboxes use
 * it, because they are the same four things asked twice — what the course *is*,
 * and what a family may *buy*.
 */
export const UNIT_LABELS: Record<EnrolmentUnit, string> = {
  year: 'Year',
  fall: 'Fall semester',
  spring: 'Spring semester',
  block: 'Block',
};

/** The two rates, named for the form rather than for the rate card. */
export const RATE_LABELS: Record<RateTier, string> = {
  standard: 'Standard',
  highSchoolCredit: 'High school credit',
};

/** An empty form: what `/admin/courses/new` opens on. */
export function emptyFields(): CourseFields {
  return {
    title: '',
    description: '',
    stages: [],
    days: [],
    time: '',
    start: '',
    end: '',
    enrolment: '',
    enrolmentUnits: [],
    weeks: '',
    blockStart: '',
    ageLabel: '',
    ageMin: '',
    ageMax: '',
    rateTier: '',
    credit: '',
    requiredText: '',
    optionalText: '',
    materialsToBuy: '',
    materialsFee: '',
    materialsFeeNote: '',
    assessmentFee: '',
    assessmentFeeNote: '',
    prerequisites: '',
    instructorSlug: '',
  };
}

/** A saved course as the form shows it. Its own time is always a real slot. */
export function fieldsOf(course: Course): CourseFields {
  return {
    title: course.title,
    description: course.description,
    stages: [...course.stages],
    days: [...course.days],
    time: `${course.start}-${course.end}`,
    start: course.start,
    end: course.end,
    enrolment: course.enrolment,
    enrolmentUnits: [...course.enrolmentUnits],
    weeks: String(course.weeks),
    blockStart: course.dates[0] ?? '',
    ageLabel: course.ageLabel,
    ageMin: course.ageMin === null ? '' : String(course.ageMin),
    ageMax: course.ageMax === null ? '' : String(course.ageMax),
    rateTier: course.rateTier,
    credit: course.credit ?? '',
    requiredText: course.requiredText ?? '',
    optionalText: course.optionalText ?? '',
    materialsToBuy: course.materialsToBuy ?? '',
    materialsFee: course.materialsFee === null ? '' : String(course.materialsFee),
    materialsFeeNote: course.materialsFeeNote ?? '',
    assessmentFee: course.assessmentFee === null ? '' : String(course.assessmentFee),
    assessmentFeeNote: course.assessmentFeeNote ?? '',
    prerequisites: course.prerequisites,
    instructorSlug: course.instructorSlug,
  };
}

/** Read a submitted form, with every complaint collected at once. */
export function parseCourse(form: FormData, context: CourseContext): ParsedCourse {
  const values: CourseFields = {
    ...emptyFields(),
    title: text(form, 'title'),
    description: multiline(form, 'description'),
    stages: form.getAll('stages').map(asText),
    days: form.getAll('days').map(asText),
    time: text(form, 'time'),
    enrolment: text(form, 'enrolment'),
    enrolmentUnits: form.getAll('enrolmentUnits').map(asText),
    weeks: text(form, 'weeks'),
    blockStart: text(form, 'blockStart'),
    ageLabel: text(form, 'ageLabel'),
    ageMin: text(form, 'ageMin'),
    ageMax: text(form, 'ageMax'),
    rateTier: text(form, 'rateTier'),
    credit: text(form, 'credit'),
    requiredText: multiline(form, 'requiredText'),
    optionalText: multiline(form, 'optionalText'),
    materialsToBuy: multiline(form, 'materialsToBuy'),
    materialsFee: text(form, 'materialsFee'),
    materialsFeeNote: text(form, 'materialsFeeNote'),
    assessmentFee: text(form, 'assessmentFee'),
    assessmentFeeNote: text(form, 'assessmentFeeNote'),
    prerequisites: text(form, 'prerequisites'),
    instructorSlug: text(form, 'instructorSlug'),
  };

  const errors: CourseErrors = {};

  if (!values.title) errors.title = `${LABELS.title} cannot be empty.`;
  if (!values.description) {
    errors.description = `${LABELS.description} cannot be empty — this is what a parent reads.`;
  }
  if (!values.prerequisites) {
    errors.prerequisites =
      'Say the prerequisites — the school writes “None” when there are none.';
  }
  if (!values.ageLabel) {
    errors.ageLabel =
      'Give the ages in the school’s own words — “5-10 (approximately K-6th grades)”.';
  }

  const stages = values.stages.filter(isStage);
  if (stages.length !== values.stages.length) {
    errors.stages = 'A stage is one of the three classical stages, as listed.';
  } else if (stages.length === 0) {
    errors.stages = 'Tick at least one stage — it decides which age bands show the class.';
  }

  /*
   * The days on offer are the year's running tracks and nothing else. A day the
   * School Year screen gives no term is a day the school does not meet, so a
   * course posted onto it — a stale form, or a year edited since — is refused
   * with the reason rather than saved onto a day that never comes.
   */
  const offered = runningTracks(context.year);
  const days = values.days.filter((day): day is DayTrack => offered.includes(day as DayTrack));
  if (days.length !== values.days.length) {
    const rejected = values.days.filter((day) => !offered.includes(day as DayTrack));
    errors.days = `The school does not meet on ${rejected.join(', ')} this year — see the School year screen.`;
  } else if (days.length === 0) {
    errors.days = 'Tick the day track this class meets on.';
  }

  const enrolment = isEnrolmentUnit(values.enrolment) ? values.enrolment : null;
  if (!enrolment) {
    errors.enrolment = 'Say what shape the course runs as — a year, a semester or a block.';
  }

  const units = values.enrolmentUnits.filter(isEnrolmentUnit);
  if (units.length !== values.enrolmentUnits.length) {
    errors.enrolmentUnits = 'An enrolment unit is Year, Fall, Spring or Block, as listed.';
  } else if (units.length === 0) {
    errors.enrolmentUnits =
      'Tick at least one — this is exactly what the application offers a family, never a guess.';
  }

  if (!isRateTier(values.rateTier)) {
    errors.rateTier = 'Pick which hourly rate this class is charged at.';
  }

  let weeks = 0;
  if (!/^\d+$/.test(values.weeks) || Number(values.weeks) < 1) {
    errors.weeks = 'How many weeks of classes — a whole number, at least 1.';
  } else {
    weeks = Number(values.weeks);
  }

  const { start, end } = readTime(values, form, errors);
  values.start = start;
  values.end = end;

  const ageMin = readAge(values.ageMin, 'ageMin', errors);
  const ageMax = readAge(values.ageMax, 'ageMax', errors);
  if ((values.ageMin === '') !== (values.ageMax === '')) {
    const missing = values.ageMin === '' ? 'ageMin' : 'ageMax';
    errors[missing] =
      'Give both ends of the age range, or neither — a class with no numeric range shows in every band.';
  } else if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    errors.ageMax = 'The ages run youngest to oldest.';
  }

  const materialsFee = readFee(values.materialsFee, 'materialsFee', errors);
  const assessmentFee = readFee(values.assessmentFee, 'assessmentFee', errors);
  if (values.materialsFeeNote && materialsFee === null) {
    errors.materialsFeeNote =
      'A note qualifies a fee — give the materials fee, or clear the note.';
  }
  if (values.assessmentFeeNote && assessmentFee === null) {
    errors.assessmentFeeNote =
      'A note qualifies a fee — give the assessment fee, or clear the note.';
  }

  if (!context.instructorSlugs.includes(values.instructorSlug)) {
    errors.instructorSlug = 'Pick who teaches it from the people list.';
  }

  /*
   * A block's dates come from its track's real meeting dates, or are honestly
   * absent. No start picked yet is a valid state — the clash check calls it
   * a *possible* clash rather than guessing — so `blockStart` is never required
   * here; a bad one is refused with the domain's own words.
   */
  let dates: string[] = [];
  if (enrolment === 'block') {
    if (days.length !== 1) {
      errors.days = 'A block meets on one day track — tick exactly one.';
    } else if (values.blockStart && weeks > 0) {
      try {
        dates = blockMeetingDates(context.year, days[0]!, values.blockStart, weeks);
      } catch (error) {
        errors.blockStart = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const edit: CourseEdit = {
    title: values.title,
    description: values.description,
    stages,
    days,
    start,
    end,
    enrolment: enrolment ?? 'year',
    enrolmentUnits: units,
    weeks,
    dates,
    ageLabel: values.ageLabel,
    ageMin,
    ageMax,
    rateTier: isRateTier(values.rateTier) ? values.rateTier : 'standard',
    credit: optional(values.credit),
    requiredText: optional(values.requiredText),
    optionalText: optional(values.optionalText),
    materialsToBuy: optional(values.materialsToBuy),
    materialsFee,
    materialsFeeNote: optional(values.materialsFeeNote),
    assessmentFee,
    assessmentFeeNote: optional(values.assessmentFeeNote),
    prerequisites: values.prerequisites,
    instructorSlug: values.instructorSlug,
  };

  return { values, edit, errors };
}

/**
 * The meeting time, from the slot select or the two typed ends.
 *
 * A picked slot *is* its two ends — the select's value carries them — so the
 * typed inputs only matter when the pick is `custom`. That keeps "chosen from
 * real meeting slots" the ordinary path while leaving a way in for the first
 * course on an empty track, which has no slots to choose from yet.
 */
function readTime(
  values: CourseFields,
  form: FormData,
  errors: CourseErrors,
): { start: string; end: string } {
  let start = '';
  let end = '';

  if (values.time && values.time !== CUSTOM_TIME) {
    const slot = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(values.time);
    if (!slot) {
      errors.time = 'Pick a meeting time from the list, or choose “Another time”.';
      return { start, end };
    }
    [, start, end] = slot as unknown as [string, string, string];
  } else {
    start = text(form, 'start');
    end = text(form, 'end');
  }

  if (!start) {
    errors.start = 'Give the meeting time — pick a slot, or type when the class starts.';
  } else if (!isClockTime(start)) {
    errors.start = 'A start time reads “09:00” — hours and minutes on a 24-hour clock.';
  }
  if (!end) {
    errors.end = 'Type when the class ends.';
  } else if (!isClockTime(end)) {
    errors.end = 'An end time reads “10:30” — hours and minutes on a 24-hour clock.';
  }
  if (isClockTime(start) && isClockTime(end) && minutesOfDay(start) >= minutesOfDay(end)) {
    errors.end = 'The class has to end after it starts.';
  }

  return { start, end };
}

/** An optional whole-number age. Typed badly is an error; empty is no gate. */
function readAge(raw: string, field: 'ageMin' | 'ageMax', errors: CourseErrors): number | null {
  if (raw === '') return null;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    errors[field] = `${LABELS[field]} is a whole number of years, or blank for no numeric range.`;
    return null;
  }
  return Number(raw);
}

/**
 * An optional fee, in whole dollars.
 *
 * Zero is refused rather than stored: a $0 fee is no fee, and the honest way to
 * say "no fee" is to leave the box empty — the class page then prints nothing
 * rather than a free fee.
 */
function readFee(
  raw: string,
  field: 'materialsFee' | 'assessmentFee',
  errors: CourseErrors,
): number | null {
  if (raw === '') return null;
  const amount = raw.replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+$/.test(amount) || Number(amount) < 1) {
    errors[field] = `${LABELS[field]} is a whole number of dollars — leave it empty when there is none.`;
    return null;
  }
  return Number(amount);
}

function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

function isRateTier(value: string): value is RateTier {
  return (RATE_TIERS as readonly string[]).includes(value);
}

function text(form: FormData, name: string): string {
  return asText(form.get(name));
}

/** A textarea's text, with Windows line endings folded before they are stored. */
function multiline(form: FormData, name: string): string {
  return text(form, name).replace(/\r\n/g, '\n');
}

function asText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Nothing typed is nothing stored — null, so the page renders no element at all. */
function optional(value: string): string | null {
  return value ? value : null;
}
