import { unitLabel } from '../application/offerings.js';
import { SCHOOL_TIMEZONE } from '../calendar/year.js';
import type { RateCard } from '../money/settings.js';
import { absoluteUrl } from '../routes.js';
import { schoolRef } from '../structured-data.js';
import { ageLine, hasNumericAges } from './ages.js';
import { durationLabel, type Course, type EnrolmentUnit } from './course.js';
import { coursePrice } from './pricing.js';
import { contactHours, meetingHours, type DayTrack } from './schedule.js';
import { classPath } from './views.js';

/**
 * A class, describing itself (#151).
 *
 * The question this answers is not "what does the school teach" — the pages say
 * that — but "what can a machine that has never rendered a page say about it".
 * A parent asking an assistant *what does Pharos offer for a nine-year-old on a
 * Wednesday morning, and what does it cost* is asking three questions the site
 * already answers in prose and answered nowhere a machine could read.
 *
 * **Not one value here is typed.** Every field is the same call the visible page
 * makes — `ageLine`, `durationLabel`, `coursePrice`, `contactHours` — for the
 * reason the school node reads the details row: nineteen classes with a
 * hand-written copy of their own price in the markup is exactly the drift that
 * left the live site's nine artefacts disagreeing about ages, days and texts.
 * The markup and the page cannot say different things because there is one
 * source for both, and `structured-data.test.ts` recomputes it.
 *
 * The rate card is an argument for the reason it is everywhere else (#29 AC 1):
 * nothing that publishes a price may hold its own copy of the rates.
 */

export type CourseJsonLdInput = {
  course: Course;
  /** The two hourly rates, read from the money settings by the page. */
  rates: RateCard;
  /**
   * Who teaches it, resolved from the one list of people (#26) — never a name
   * typed onto the course. Absent when the page could not resolve one, in which
   * case the instructor is simply not claimed.
   */
  instructorName?: string | null;
  site: string | URL;
};

/**
 * The classes a list view shows, as a list of the pages that describe them.
 *
 * The three list views publish the same nineteen classes three ways, and none of
 * them is where a class is *described* — that is its own page, and repeating a
 * full `Course` node nineteen times on three surfaces would be four copies of
 * every class in the markup, which is the duplication this whole area exists to
 * end. What a list page can say truthfully is: here are the classes, in this
 * order, each at its own address.
 *
 * Deduplicated by slug, because By Age genuinely shows a class more than once —
 * a course appears under every band its range touches — and an `ItemList` that
 * repeated it would be claiming two classes where there is one.
 */
export function courseListJsonLd(
  courses: readonly Course[],
  listPath: string,
  site: string | URL,
) {
  const seen = new Set<string>();
  const items = courses
    .filter((course) => (seen.has(course.slug) ? false : seen.add(course.slug)))
    .map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: course.title,
      url: absoluteUrl(site, classPath(course.slug)),
    }));

  return {
    '@type': 'ItemList',
    '@id': `${absoluteUrl(site, listPath)}#classes`,
    // The count the page's own heading states, from the same list (#138).
    numberOfItems: items.length,
    itemListElement: items,
  };
}

/**
 * `https://schema.org/Wednesday` — the weekday a day track meets on, as
 * schema.org names it.
 *
 * A day track is **not** a day of the week (CONTEXT.md, "day track"): it is the
 * school's own thread of dates, with its own week numbering, and week 10 falls on
 * a different date in each of the four. What is true — and all that is being
 * claimed here — is that a track meets on the weekday it is named after, which is
 * the one part of it schema.org has a vocabulary for. The week numbering is the
 * calendar page's job and does not belong in a `Schedule`.
 */
function weekdayOf(track: DayTrack): string {
  return `https://schema.org/${track}`;
}

/** `PT56H` — hours as an ISO 8601 duration, which is what schema.org wants. */
function hoursDuration(hours: number): string {
  // Half-hour meetings are real (90 minutes is 1.5 hours), so minutes are
  // carried rather than rounded away: `PT1H30M`, never `PT1H`.
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `PT${whole}H`;
  return whole === 0 ? `PT${minutes}M` : `PT${whole}H${minutes}M`;
}

/**
 * What one purchasable unit costs, from the same figures the cost line prints.
 *
 * Keyed off `enrolmentUnits` — what a family may actually buy — and not off the
 * course's shape (#24). Nine year courses publish a semester price while
 * offering no semester enrolment, so pricing every unit the shape allows would
 * invent a $210 offering the school does not sell.
 */
function unitPrice(course: Course, rates: RateCard, unit: EnrolmentUnit): number | null {
  const price = coursePrice(course, rates);
  // A lookup rather than a second `switch` on the unit: `coursePrice` already
  // decided which figures a course has, and this only says which of them a unit
  // is sold at. A semester of a year course and a whole one-semester course are
  // the same figure, which is `pricing.ts`'s decision and not one to restate.
  return { year: price.year, fall: price.semester, spring: price.semester, block: price.flat }[
    unit
  ];
}

/**
 * The `Course` node, with the one instance of it the school runs.
 *
 * A `CourseInstance` rather than a bare `Course` because the ticket's criterion
 * is *when it runs*, and a `Course` has nowhere to say that: the days, the clock
 * times, the week count and the room are all properties of a run of the course,
 * which is precisely the distinction schema.org draws. There is one instance and
 * not one per semester — the school publishes one schedule per class, and
 * splitting it here would be the markup asserting two runs that no page mentions.
 *
 * `courseMode: 'blended'` is the honest reading of what the school is: the class
 * meets in Enola on its morning and the rest of the work is done at home. Not
 * `onsite`, which would claim the whole course happens in the room, and not
 * `online`, which it plainly is not.
 */
export function courseJsonLd({ course, rates, instructorName, site }: CourseJsonLdInput) {
  const url = absoluteUrl(site, classPath(course.slug));
  const offers = course.enrolmentUnits
    .map((unit) => ({ unit, price: unitPrice(course, rates, unit) }))
    .filter((offer): offer is { unit: EnrolmentUnit; price: number } => offer.price !== null)
    .map((offer) => ({
      '@type': 'Offer',
      // The picker's own words for the unit (`application/offerings.ts`), not a
      // second set typed here: a family choosing "Fall semester" in the
      // application and an assistant quoting one must be quoting the same thing.
      name: unitLabel(offer.unit),
      price: offer.price,
      priceCurrency: 'USD',
      category: 'Tuition',
      availability: 'https://schema.org/InStock',
      url,
    }));

  return {
    '@type': 'Course',
    // The class's own page, fragment-qualified: the node is the course, and the
    // page is a thing that describes it.
    '@id': `${url}#course`,
    url,
    name: course.title,
    description: course.description,
    provider: schoolRef(site),
    // The classical stage, which is the school's own level language and is a list
    // because Algebra 1 sits in two of them.
    educationalLevel: [...course.stages],
    /*
     * Who it is for, in the school's own age wording (#151 AC 1).
     *
     * `typicalAgeRange` is emitted **only** when the school publishes a numeric
     * range. Algebra 1's gate is "8th Grade and older (or younger students who
     * demonstrate proficiency)", which is a prerequisite and not an age; forcing
     * a number onto it would publish an age gate the school has deliberately not
     * set, and would exclude exactly the younger student the sentence invites.
     * The sentence itself still reaches a reader, as the audience's own
     * description.
     */
    ...(hasNumericAges(course) ? { typicalAgeRange: course.ageLabel } : {}),
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: ageLine(course),
    },
    ...(course.credit ? { educationalCredentialAwarded: course.credit } : {}),
    // The school's own word, "None" included — that is its answer and not a gap.
    coursePrerequisites: course.prerequisites,
    // What the price is computed from, so the arithmetic on the page is checkable
    // here too.
    timeRequired: hoursDuration(contactHours(course)),
    /*
     * What it costs, on the course rather than on the run of it.
     *
     * Both are legal in the vocabulary and the placement is the whole point: a
     * price is read off the `Course`, and an offer buried in the instance is a
     * price a consumer looking at the course does not find. There is one run of
     * each class anyway, so nothing is lost by stating it at the top.
     */
    ...(offers.length > 0 ? { offers } : {}),
    hasCourseInstance: {
      '@type': 'CourseInstance',
      '@id': `${url}#instance`,
      name: `${course.title} — ${durationLabel(course)}`,
      courseMode: 'blended',
      // Where it meets: the school itself, by reference. The address is stated
      // once, on the school node, and never restated here.
      location: schoolRef(site),
      ...(instructorName ? { instructor: { '@type': 'Person', name: instructorName } } : {}),
      // Hours in the room per week — one meeting, times the tracks it meets on.
      courseWorkload: hoursDuration(meetingHours(course) * course.days.length),
      courseSchedule: {
        '@type': 'Schedule',
        repeatFrequency: 'weekly',
        // Weeks per day track, which is what the school publishes and what the
        // contact hours are computed from.
        repeatCount: course.weeks,
        byDay: course.days.map(weekdayOf),
        startTime: course.start,
        endTime: course.end,
        scheduleTimezone: SCHOOL_TIMEZONE,
      },
      /*
       * A block's published dates, when it has them.
       *
       * Only a `block` course carries dates, and for one the first and last of
       * them are the run's real bounds — a five-week block in February is not the
       * school year. A year or semester course has no dates on it at all, and
       * inventing bounds from the school year would be this module deciding
       * something the class page does not say.
       */
      ...(course.dates.length > 0
        ? {
            startDate: course.dates[0],
            endDate: course.dates[course.dates.length - 1],
          }
        : {}),
    },
  };
}
