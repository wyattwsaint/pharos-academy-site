/**
 * Teaching here, and the one document behind it (#30).
 *
 * `/teach` is at the root and off the parent path on purpose: the reader is
 * somebody who might teach a class, not a family, and #9's four-item nav is for
 * families. It is reachable from the footer, which is on every page.
 *
 * The contract is a static file rather than a policy row. Every policy in the
 * editable set (#28) is a document a *parent* is sent to, the create form is
 * deliberately three fields, and adding an audience column to make room for one
 * contractor-facing PDF is a design decision that ticket declined. What that
 * costs is that replacing this file is a commit rather than an upload — which
 * is the honest trade for a document that changes when the school's lawyer says
 * so, not when a term turns.
 */
import { leadershipAmong, type SeedPerson } from '../people/person.js';

export const TEACH_PATH = '/teach';

/**
 * Who a prospective instructor writes to, by name (#105).
 *
 * The page names a person rather than saying "send us a note", because
 * somebody offering to teach is deciding whether to work here and that is a
 * conversation with one person. But the name is **not** written down here: it
 * is the top of the leadership list, which is the one place a person's name and
 * role exist (ADR-0004). Correct the title in the admin and this sentence
 * corrects with it; hand the job to somebody else and the page names them
 * instead.
 *
 * Named for what it returns and not `headOfSchool`, because the school's own
 * ordering is what decides it: today rank 1 is the Head of School, and if the
 * school ever seats somebody above her the page follows and says so. That is
 * why the page prints the role alongside the name — whoever is at the top, the
 * sentence stays true.
 *
 * `undefined` when nobody is marked as leadership, which the page renders as
 * the address on its own rather than a sentence with a hole in it.
 */
export function leadershipContact<T extends SeedPerson>(people: readonly T[]): T | undefined {
  return leadershipAmong(people)[0];
}

export const TEACHER_CONTRACT = {
  /** Served straight out of `public/`, so this is also its path on disk. */
  path: '/documents/teacher-contract.pdf',
  /** What the browser saves it as. */
  filename: 'pharos-academy-teacher-contract.pdf',
  /** What the link says, in the document's own terms. */
  label: 'Non-Employee Teacher Contract (PDF)',
} as const;
