/**
 * The classes an application says a child chose (#259).
 *
 * An application is the record of what a family sent, and until this module
 * existed the Applications screen did not read it that way: it walked the
 * **live** catalogue and kept the offerings whose key the child had ticked. A
 * course renamed since read as its new name, and a course gone from the
 * catalogue read as nothing at all — the class did not appear as removed, it
 * simply vanished off a submitted application and out of the **class tally**.
 * That is loss the office cannot see happen, and it is the one thing the
 * governing rule for removal forbids.
 *
 * So an application **captures** the title of every offering it was submitted
 * with, written once at submit and never touched again — the same construction
 * and the same reasoning as **agreed terms** (ADR-0006): record what the family
 * was shown rather than resolving it later against a catalogue that moves. It
 * is a freeze, not a foreign key. Nothing keeps it in step with anything.
 *
 * Two consequences follow, and both are deliberate.
 *
 * **The capture wins outright.** A title is never taken from today's catalogue,
 * even when today's catalogue still has the course — reading live is precisely
 * the bug, and a rule that read live "just for the rows that still resolve"
 * would still let a rename rewrite history for exactly those rows.
 *
 * **A row written before the capture falls back to the slug** out of the key,
 * and is not backfilled. There is no honest title to recover for it; the slug
 * is stable, which is the property that matters, and inventing a title from
 * the live catalogue would reintroduce the bug for the oldest rows.
 *
 * The catalogue is still consulted for one thing only: whether the offering is
 * *still* offered, which is a fact about today and belongs to today.
 */

import type { EnrolmentUnit } from '../courses/course.js';
import { classAndUnit, findOffering, splitOfferingKey, type Offering } from './offerings.js';

/** How both admin screens say a class the catalogue no longer has. */
export const NO_LONGER_OFFERED = 'no longer offered';

/**
 * What a child chose, and what the application knows of it.
 *
 * The two readers of a submitted application — the Applications screen and the
 * **class tally** — both want this and nothing else, so it is one type rather
 * than the same three fields written out at each of them.
 */
export type ChosenBy = {
  offeringKeys: readonly string[];
  /** Frozen at submission. Absent on a row written before the capture existed. */
  offeringTitles?: Readonly<Record<string, string>>;
};

/** One class on one child, as the application recorded it. */
export type ChosenClass = {
  /** The `<slug>:<unit>` key the family's form posted. */
  key: string;
  courseSlug: string;
  unit: EnrolmentUnit;
  /** Captured at submission, or the slug for a row written before capture. */
  title: string;
  /**
   * Whether the **course** is still in the catalogue. A fact about today.
   *
   * Asked of the course rather than of the exact offering, and asked that way
   * by both readers, so the two cannot disagree about one class. A school that
   * stopped selling the fall of a class it still runs has not removed the
   * class, and telling the office it did would be the same kind of lie as
   * dropping it: "no longer offered" is for a class that is gone.
   */
  offered: boolean;
};

/** Every course the catalogue still has, by slug. The one rule both readers ask. */
export function catalogueCourses(offerings: readonly Offering[]): Set<string> {
  return new Set(offerings.map((offering) => offering.course.slug));
}

/**
 * The titles to freeze onto a child, as `<key>=<title>` pairs.
 *
 * Pairs rather than an array parallel to the keys, for the reason the faith
 * answers are pairs: a positional array is a shape two writers can put out of
 * step, and a pair carries its own subject. The title captured is the
 * **course's**, not the offering's — the unit is in the key and is not the
 * catalogue's to change.
 *
 * A key the catalogue cannot resolve captures nothing. The family cannot tick a
 * box that was not drawn, so this is the stale-form case the picker already
 * drops, and a captured title of `""` would be worse than the slug.
 */
export function captureOfferingTitles(
  offerings: readonly Offering[],
  keys: readonly string[],
): string[] {
  const captured: string[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) continue;
    const offering = findOffering(offerings, key);
    if (!offering) continue;
    seen.add(key);
    captured.push(`${key}=${offering.course.title}`);
  }

  return captured;
}

/** The stored pairs, read back. A malformed pair is dropped rather than shown. */
export function decodeOfferingTitles(pairs: readonly string[]): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const title = pair.slice(at + 1);
    if (title) titles[pair.slice(0, at)] = title;
  }
  return titles;
}

/**
 * What one child of one application chose, in the order the form posted it.
 *
 * Takes the catalogue as the slugs already gathered out of it rather than as
 * the offerings, because both callers hold that set anyway — the tally for its
 * own ordering, the screen for every child on the page — and rebuilding it per
 * child would be the same set built once a row.
 */
export function chosenClasses(child: ChosenBy, courses: ReadonlySet<string>): ChosenClass[] {
  const titles = child.offeringTitles ?? {};

  return child.offeringKeys.flatMap((key) => {
    const parsed = splitOfferingKey(key);
    if (!parsed) return [];

    return [
      {
        key,
        courseSlug: parsed.courseSlug,
        unit: parsed.unit,
        title: titles[key] ?? parsed.courseSlug,
        offered: courses.has(parsed.courseSlug),
      },
    ];
  });
}

/**
 * One chosen class as a line on the Applications screen.
 *
 * The class and the unit read as one name, the way the family's own picker
 * says it, and a class the catalogue has lost is **named and then marked** —
 * never omitted, and never marked without being named.
 */
export function chosenClassLabel(chosen: ChosenClass): string {
  const name = classAndUnit(chosen.title, chosen.unit);
  return chosen.offered ? name : `${name} — ${NO_LONGER_OFFERED}`;
}
