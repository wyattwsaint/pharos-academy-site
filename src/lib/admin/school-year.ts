import type { SchoolYearEdit } from '../calendar/store.js';
import { SEMESTERS, validateSchoolYear, type Closure, type Semester, type Term } from '../calendar/year.js';
import { DAY_TRACKS, type DayTrack } from '../courses/schedule.js';

/**
 * The school year, as the admin form posts it (#23).
 *
 * Works like the other parsers here: it always hands back values, valid or not,
 * so a rejected form redisplays what was typed, and it collects every complaint
 * at once rather than one per round trip.
 *
 * **A blank track is how a track is removed, and it is not an error.** A row
 * with no first class date and no week count is simply not a term — that is how
 * a year with no Tuesday track is typed, and the school confirmed on #14 that
 * this is data it enters rather than a fact to bake in. Half a row *is* an
 * error, because a date with no week count is a track that would run for no
 * weeks and a week count with no date is a track that starts nowhere.
 */

/** One track's row on the form, before it is known to be a term or a blank. */
export type TermFields = {
  firstClassDate: string;
  weeks: string;
};

/** One closure row. Both blank means the row was never filled in. */
export type ClosureFields = {
  date: string;
  label: string;
};

export type SchoolYearFields = {
  label: string;
  /** Keyed `fall.Monday`, so the form, the values and the errors all agree. */
  terms: Record<string, TermFields>;
  closures: ClosureFields[];
};

/** Keyed exactly as the fields are: `label`, `fall.Monday.weeks`, `closures.0.date`. */
export type SchoolYearErrors = Record<string, string>;

export type ParsedSchoolYear = {
  values: SchoolYearFields;
  /** The year to save. Only meaningful when `errors` is empty. */
  edit: SchoolYearEdit;
  errors: SchoolYearErrors;
};

/** `fall.Monday` — one key for the input name, the value and the error. */
export function termKey(semester: Semester, track: DayTrack): string {
  return `${semester}.${track}`;
}

/** How many blank closure rows the form always offers, on top of the real ones. */
export const SPARE_CLOSURE_ROWS = 4;

/** An empty form: every track blank, and nothing closed. */
export function emptyFields(): SchoolYearFields {
  const terms: Record<string, TermFields> = {};
  for (const semester of SEMESTERS) {
    for (const track of DAY_TRACKS) {
      terms[termKey(semester, track)] = { firstClassDate: '', weeks: '' };
    }
  }
  return { label: '', terms, closures: [] };
}

/** The year as the form shows it — every track present, empty or not. */
export function fieldsOf(year: {
  label: string;
  terms: readonly Term[];
  closures: readonly Closure[];
}): SchoolYearFields {
  const fields = emptyFields();
  fields.label = year.label;

  for (const term of year.terms) {
    fields.terms[termKey(term.semester, term.track)] = {
      firstClassDate: term.firstClassDate,
      weeks: String(term.weeks),
    };
  }
  fields.closures = year.closures.map((closure) => ({ date: closure.date, label: closure.label }));
  return fields;
}

/** Read a submitted form, with every complaint collected at once. */
export function parseSchoolYear(form: FormData): ParsedSchoolYear {
  const values = emptyFields();
  values.label = text(form, 'label');

  const errors: SchoolYearErrors = {};
  const terms: Term[] = [];

  for (const semester of SEMESTERS) {
    for (const track of DAY_TRACKS) {
      const key = termKey(semester, track);
      const fields: TermFields = {
        firstClassDate: text(form, `${key}.firstClassDate`),
        weeks: text(form, `${key}.weeks`),
      };
      values.terms[key] = fields;

      // Both blank: this track does not run this semester. A complete year.
      if (!fields.firstClassDate && !fields.weeks) continue;

      if (!fields.firstClassDate) {
        errors[`${key}.firstClassDate`] =
          'There is a week count here but no first class date. Give the date, or clear both to leave this track out.';
        continue;
      }
      if (!fields.weeks) {
        errors[`${key}.weeks`] =
          'There is a first class date here but no week count. Say how many weeks, or clear both to leave this track out.';
        continue;
      }

      const weeks = Number(fields.weeks);
      if (!Number.isInteger(weeks)) {
        errors[`${key}.weeks`] = 'A week count is a whole number of weeks.';
        continue;
      }

      terms.push({ semester, track, firstClassDate: fields.firstClassDate, weeks });
    }
  }

  const closures: Closure[] = [];
  const dates = form.getAll('closure.date').map(asText);
  const labels = form.getAll('closure.label').map(asText);

  for (let index = 0; index < Math.max(dates.length, labels.length); index += 1) {
    const date = dates[index] ?? '';
    const label = labels[index] ?? '';
    // A row nobody touched. The form always offers spares, so most are blank.
    if (!date && !label) continue;

    values.closures.push({ date, label });
    /*
     * Every filled-in row goes through, valid or not, so that this list and the
     * form's rows stay index-for-index aligned — `validateSchoolYear` keys its
     * complaints by position, and a list that quietly dropped the bad rows
     * would hang each message on the row below it. Nothing is saved while there
     * is an error, so an invalid row never reaches the store.
     */
    const position = values.closures.length - 1;
    if (date && closures.some((closure) => closure.date === date)) {
      errors[`closures.${position}.date`] = 'That day is already on the list.';
    }
    closures.push({ date, label });
  }

  /*
   * The domain's own rules, on top of the form's: a first class date that is
   * not that track's weekday, a spring that starts before its fall, a date that
   * is not a day on the calendar. They live in `calendar/year.ts` because the
   * browser preview applies exactly the same ones as it types.
   */
  const edit: SchoolYearEdit = { label: values.label, terms, closures };
  Object.assign(
    errors,
    validateSchoolYear({ ...edit, lastEditedBy: null, lastEditedAt: null }),
  );

  return { values, edit, errors };
}

function text(form: FormData, name: string): string {
  return asText(form.get(name));
}

function asText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}
