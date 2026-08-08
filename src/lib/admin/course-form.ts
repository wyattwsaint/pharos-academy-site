import type { Meeting, SchoolYear } from '../calendar/year.js';
import type { Course } from '../courses/course.js';
import { isClockTime, type DayTrack } from '../courses/schedule.js';
import { blockStartChoices, clashWarnings, type ClashWarning } from '../courses/slots.js';
import { readCourseFormFields, type CourseFields, type CourseFormFields } from './courses.js';

/**
 * What the course editor can say about the form **as it currently stands**
 * (#59, #60, #61).
 *
 * The editor used to answer three questions from the saved row: does this class
 * clash, when does this block end, and which dates may it start on.
 * All three are questions about the form, and reading them from the store gave
 * the same wrong shape three times — nothing on the add form, nothing on a
 * redisplay after a validation error, and on the edit screen the answer to the
 * course as it was rather than as it is being typed. #24 AC 4 wants a clash
 * "found at authoring time rather than by a parent", and AC 6 wants an end date
 * computed and a picker offering "only that track's real meeting dates". A
 * warning that needs a write first is one save later than authoring time.
 *
 * So this reads `CourseFields` — the same strings the form posts and the same
 * ones a saved course is rendered into — and answers all three from there. It
 * is deliberately **lenient where `parseCourse` is strict**: a half-filled form
 * is the ordinary state of this screen, and every question here has an honest
 * "not yet" (no warnings, no end date, an empty picker).
 *
 * One refusal it does carry, because on a GET there is no parser to carry it.
 * `blockMeetingDates` throws when the start is off its track's column or the
 * year is too short for the weeks, and #60 puts that message beside the start
 * field. A block saved before the School Year screen moved its term is exactly
 * that case, and swallowing the throw would leave the screen saying nothing at
 * all. It would also feed the clash check `dates: []`, which means "the start
 * is not chosen yet" and reports a *possible clash* — asserting the school has
 * not picked a start for a block that has one. A run the year cannot hold is
 * not an unknown run: it is a refused one, so this reports the refusal and
 * leaves the clash question alone until the start is a real date again.
 *
 * **How current "current" is.** The clash warnings, the computed end date and
 * the refusal message are answers to the form as the server last received it,
 * which on a redisplay is the form as it is being typed. The picker's options
 * are the one exception: this screen carries no client script, so ticking a
 * day does not re-offer that track's dates on the tick — the narrowed picker
 * arrives with the next render of the form. Until then the picker is empty and
 * says so.
 *
 * That is a gap, not a rule. The School Year screen does run a script, and it
 * shows the shape a narrowing one would have to take: it imports the site's own
 * computation rather than reimplementing it, so the browser cannot disagree
 * with what the server publishes. A picker script would import
 * `blockStartChoices` on the same terms. #76 chose not to write it there and
 * then — the wording was the defect and the script is a feature — so if it is
 * wanted it is its own issue, and the server render stays the source of truth.
 */

/** Everything beyond the form itself that the three answers depend on. */
export type CourseFormContext = {
  /** The saved year: which days run, and every real meeting date. */
  year: SchoolYear;
  /** The catalogue as read before the save — what a clash would be with. */
  courses: readonly Course[];
  /** This course's own slug, or null on the add form, so it never clashes with itself. */
  slug: string | null;
  /**
   * `readCourseFormFields(values, year)`, when the caller has already run it —
   * on a POST the parser has, and one form is not worth reading twice for one
   * request (#75). Omitted, it is read here, which is every GET.
   *
   * It must be that reading of *these* `values`: it is the same function either
   * way, so handing it in is a saving and never a second opinion. The test
   * "answers the same either way" holds this end of the bargain.
   */
  fields?: CourseFormFields;
};

/** The three answers, each with its own honest "not yet". */
export type CourseFormView = {
  /** The occupied slots this form lands on. Empty until it says a day and a time. */
  warnings: ClashWarning[];
  /** The one track a block meets on, or null when the form has not said yet. */
  blockTrack: DayTrack | null;
  /** That track's real meeting dates — the only dates the picker offers. */
  blockMeetings: Meeting[];
  /** The block's computed last meeting, `YYYY-MM-DD`, or null when it is not knowable. */
  blockEnd: string | null;
  /**
   * Why the picked start gives no run — off its track's column, or a year too
   * short for the weeks. Null when the form has not picked a start yet, which
   * is a valid state and not a complaint. Belongs beside the start field (#60).
   */
  blockError: string | null;
};

export function courseFormView(
  values: CourseFields,
  context: CourseFormContext,
): CourseFormView {
  const { year, courses, slug } = context;

  /*
   * Read exactly as the parser reads them, from the one place both call: a
   * track the School Year screen gives no term is a day the school does not
   * meet, so a stale form naming one is not a schedule to warn about.
   */
  const {
    days,
    enrolment,
    blockTrack,
    run: { dates, refusal: blockError },
  } = context.fields ?? readCourseFormFields(values, year);

  /*
   * Only the ticked track's own dates are offered, and an empty picker is the
   * honest rendering of a form that has not said which track yet.
   */
  const blockMeetings = blockTrack ? blockStartChoices(year, blockTrack) : [];

  /*
   * A clash needs a day, a real time and a shape to be a fact about. Without
   * all three there is nothing to compare, and warning anyway would mean
   * guessing the missing half of a slot. A refused block is the same kind of
   * silence: its dates are unknowable rather than unpicked, and `clashWarnings`
   * reads no dates as no start yet, so it would call a *possible clash* on a
   * block whose start is picked and wrong.
   */
  const slotIsKnown =
    days.length > 0 &&
    enrolment !== null &&
    isClockTime(values.start) &&
    isClockTime(values.end) &&
    blockError === null;

  return {
    warnings: slotIsKnown
      ? clashWarnings(
          { slug, days, start: values.start, end: values.end, enrolment, dates },
          courses,
          year,
        )
      : [],
    blockTrack,
    blockMeetings,
    blockEnd: dates.at(-1) ?? null,
    blockError,
  };
}
