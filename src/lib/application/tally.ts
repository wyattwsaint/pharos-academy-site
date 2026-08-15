/**
 * The class tally — how many children are actually in each class (#32 AC 1).
 *
 * This is the number Jill decides whether a class runs on, which is the whole
 * reason it is deduplicated. A family applies twice for ordinary reasons — a
 * second child added a week later, a change of mind about the unit, a form sent
 * again because nobody replied — and every one of those doubles that family's
 * own rows in a naive count. A class that runs on a count of six should not run
 * on a count of three that was written down twice.
 *
 * **The key is family, child and course**, and it is deliberately not the email
 * address. Two households share an address, and *blocking* a second application
 * on one is the failure this replaces: the site accepts both submissions, keeps
 * both rows, and reconciles them here where a wrong guess is a display detail
 * rather than a family locked out.
 *
 * **Nothing is stored.** There is no `supersedes` column and no pointer written
 * at submission time, because that would be deciding at write time — on one
 * family's spelling of their own name — a question the school reads at a
 * glance. Recomputing it means a correction is a correction rather than a
 * migration, and it means the raw record of what each family sent stays exactly
 * what they sent.
 */

import type { EnrolmentUnit } from '../courses/course.js';
import {
  catalogueCourses,
  chosenClasses,
  NO_LONGER_OFFERED,
  type ChosenBy,
} from './chosen-classes.js';
import { countsInTally, type ApplicationState } from './lifecycle.js';
import { unitLabel, type Offering } from './offerings.js';

/**
 * What the tally needs of an application, and no more.
 *
 * A structural shape rather than the store's `ApplicationRecord`, so this
 * module has no database and its tests need no fixtures beyond a name and a
 * list of keys. The record satisfies it.
 */
export type TalliedApplication = {
  id: string;
  familyName: string;
  receivedAt: Date;
  state: ApplicationState;
  children: readonly (ChosenBy & { name: string })[];
};

/** One child in one class, however many applications said so. */
export type TallySeat = {
  familyName: string;
  /** As typed on the newest application. Empty is real — a half-filled form. */
  childName: string;
  /** The unit the family last chose. */
  unit: EnrolmentUnit;
  /** Every application that asked for this seat, newest first. */
  applicationIds: string[];
  /** More than one application asked for it — the second-submission note. */
  resubmitted: boolean;
};

/** One class, and who is in it. */
export type TallyEntry = {
  courseSlug: string;
  /**
   * As the applications named it — the newest capture, or the slug for rows
   * written before the capture existed (#259). Never today's catalogue: a
   * rename must not change a number the school already decided on.
   */
  title: string;
  /**
   * Whether the catalogue still has the course. A fact about today, not about
   * the row — and the same question the Applications screen asks of the same
   * class, so the two surfaces cannot describe one class two ways.
   */
  offered: boolean;
  seats: TallySeat[];
};

/**
 * Who is in each class, counted once each.
 *
 * Newest application first, so the first sighting of a seat is the family's
 * latest word on it and later sightings only add the note. Courses come back in
 * catalogue order and only when somebody chose them: a tally listing the whole
 * catalogue, most of it empty, is a tally nobody reads to the bottom of.
 *
 * **A class the catalogue no longer has is still counted** (#259). It is named
 * out of what the applications captured and marked as gone, and it sorts after
 * the catalogue because it is no longer part of it. Dropping it was the old
 * behaviour and it silently moved the number Jill decides on.
 */
export function classTally(
  applications: readonly TalliedApplication[],
  offerings: readonly Offering[],
): TallyEntry[] {
  const seats = new Map<string, TallySeat & { courseSlug: string }>();
  /** How each class was named, by the newest application that named it. */
  const named = new Map<string, string>();
  /** The one rule about what the catalogue still has — `chosenClasses`'s own. */
  const catalogue = catalogueCourses(offerings);

  const newestFirst = [...applications]
    .filter((application) => countsInTally(application.state))
    .sort((one, other) => other.receivedAt.getTime() - one.receivedAt.getTime());

  for (const application of newestFirst) {
    application.children.forEach((child, position) => {
      for (const chosen of chosenClasses(child, catalogue)) {
        if (!named.has(chosen.courseSlug)) named.set(chosen.courseSlug, chosen.title);

        const id = seatKey(application.familyName, child.name, position, chosen.courseSlug);
        const seen = seats.get(id);
        if (seen) {
          seen.applicationIds.push(application.id);
          seen.resubmitted = true;
          continue;
        }

        seats.set(id, {
          courseSlug: chosen.courseSlug,
          familyName: application.familyName.trim(),
          childName: child.name.trim(),
          unit: chosen.unit,
          applicationIds: [application.id],
          resubmitted: false,
        });
      }
    });
  }

  const entries: TallyEntry[] = [];
  const entryFor = (slug: string) => {
    const mine = [...seats.values()].filter((seat) => seat.courseSlug === slug);
    if (mine.length === 0) return;
    entries.push({
      courseSlug: slug,
      title: named.get(slug)!,
      offered: catalogue.has(slug),
      seats: mine.map(strip),
    });
  };

  for (const slug of catalogue) entryFor(slug);
  // Then whatever the catalogue has lost, in the order the newest applications
  // named it, so the list is stable from one page load to the next.
  for (const slug of named.keys()) {
    if (!catalogue.has(slug)) entryFor(slug);
  }

  return entries;
}

/**
 * The deduplication key: family, child, course.
 *
 * Names are compared the way a person compares them — case and stray spaces
 * are not two different families. The unit is deliberately *not* in the key:
 * a family who applied for the fall and then for the year is one child asking
 * for one class twice, and counting them as two seats is the exact bug.
 *
 * An unnamed child falls back to their row on the form. Two blank rows on one
 * application are two children who have not been typed in yet, not one child
 * choosing twice; across two applications the fallback assumes the family filled
 * the rows in the same order, which is the best guess available and is why the
 * note says the seat was submitted twice rather than silently merging in
 * silence.
 */
function seatKey(familyName: string, childName: string, position: number, slug: string): string {
  const child = normalise(childName) || `row ${position}`;
  return `${normalise(familyName)}|${child}|${slug}`;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function strip(seat: TallySeat & { courseSlug: string }): TallySeat {
  const { courseSlug: _slug, ...rest } = seat;
  return rest;
}

/**
 * The tally as the school's notification email prints it.
 *
 * One line per class, with the units broken out — "will Latin I run?" is
 * answered by the count, and "do we run it in the fall or all year?" by the
 * split. The second-submission note rides on the line rather than in a footnote,
 * because the note exists to explain a count that would otherwise look wrong.
 *
 * A class the catalogue has lost is marked beside its name rather than dropped
 * (#259) — the count is what a decision was made on, and a line quietly missing
 * from the list is the only thing worse than a line that needs explaining.
 */
export function tallyLines(tally: readonly TallyEntry[]): string[] {
  return tally.map((entry) => {
    const units = countUnits(entry.seats);
    const resubmitted = entry.seats.filter((seat) => seat.resubmitted).length;
    const note = resubmitted > 0 ? ` — includes ${resubmitted} second submission${resubmitted === 1 ? '' : 's'}, counted once` : '';
    const name = entry.offered ? entry.title : `${entry.title} (${NO_LONGER_OFFERED})`;
    return `${name}: ${entry.seats.length} (${units})${note}`;
  });
}

/** "2 full year, 1 fall semester", in the picker's own words. */
function countUnits(seats: readonly TallySeat[]): string {
  const counts = new Map<EnrolmentUnit, number>();
  for (const seat of seats) counts.set(seat.unit, (counts.get(seat.unit) ?? 0) + 1);
  return [...counts.entries()]
    .map(([unit, count]) => `${count} ${unitLabel(unit).toLowerCase()}`)
    .join(', ');
}
