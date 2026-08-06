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
export const TEACH_PATH = '/teach';

export const TEACHER_CONTRACT = {
  /** Served straight out of `public/`, so this is also its path on disk. */
  path: '/documents/teacher-contract.pdf',
  /** What the browser saves it as. */
  filename: 'pharos-academy-teacher-contract.pdf',
  /** What the link says, in the document's own terms. */
  label: 'Non-Employee Teacher Contract (PDF)',
} as const;
