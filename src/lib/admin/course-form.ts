import type { Meeting, SchoolYear } from '../calendar/year.js';
import { isEnrolmentUnit, type Course } from '../courses/course.js';
import { isClockTime, type DayTrack } from '../courses/schedule.js';
import {
  blockMeetingDates,
  blockStartChoices,
  clashWarnings,
  runningTracks,
  type ClashWarning,
} from '../courses/slots.js';
import type { CourseFields } from './courses.js';

/**
 * What the course editor can say about the form **as it currently stands**
 * (#59, #60, #61).
 *
 * The editor used to answer three questions from the saved row: is this class
 * double-booked, when does this block end, and which dates may it start on.
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
 */

/** Everything beyond the form itself that the three answers depend on. */
export type CourseFormContext = {
  /** The saved year: which days run, and every real meeting date. */
  year: SchoolYear;
  /** The catalogue as read before the save — what a clash would be with. */
  courses: readonly Course[];
  /** This course's own slug, or null on the add form, so it never clashes with itself. */
  slug: string | null;
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
   * The year is the authority on which days exist, exactly as the parser has
   * it: a track the School Year screen gives no term is a day the school does
   * not meet, so a stale form naming one is not a schedule to warn about.
   */
  const offered = runningTracks(year);
  const days = values.days.filter((day): day is DayTrack => offered.includes(day as DayTrack));
  const enrolment = isEnrolmentUnit(values.enrolment) ? values.enrolment : null;
  const weeks = /^\d+$/.test(values.weeks) && Number(values.weeks) >= 1 ? Number(values.weeks) : 0;

  /*
   * A block meets on one track — the parser enforces it — and that track is
   * where its dates come from. Two ticked, or none, is a form that has not said
   * yet, and an empty picker is the honest rendering of not knowing.
   */
  const blockTrack = enrolment === 'block' && days.length === 1 ? days[0]! : null;
  const blockMeetings = blockTrack ? blockStartChoices(year, blockTrack) : [];

  /*
   * The run the form describes, and empty when it does not describe one yet.
   * A refused start is kept as its message rather than discarded: the parser
   * says the same thing on a POST, and on a GET nothing else would say it.
   */
  let dates: string[] = [];
  let blockError: string | null = null;
  if (blockTrack && values.blockStart && weeks > 0) {
    try {
      dates = blockMeetingDates(year, blockTrack, values.blockStart, weeks);
    } catch (error) {
      blockError = error instanceof Error ? error.message : String(error);
    }
  }

  /*
   * A clash needs a day, a real time and a shape to be a fact about. Without
   * all three there is nothing to compare, and warning anyway would mean
   * guessing the missing half of a slot. A refused block is the same kind of
   * silence: its dates are unknowable rather than unpicked, and `clashWarnings`
   * reads no dates as no start yet, so it would call a *possible clash* on a
   * block whose start is picked and wrong.
   */
  const sayable =
    days.length > 0 &&
    enrolment !== null &&
    isClockTime(values.start) &&
    isClockTime(values.end) &&
    blockError === null;

  return {
    warnings: sayable
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
