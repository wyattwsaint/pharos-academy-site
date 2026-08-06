/**
 * A policy document — the whole of it (#28).
 *
 * A title, a one-sentence description of what it is, a position in the list,
 * one "parents sign this" tick, and a file that Jill replaces. Everything else
 * about a policy is derived from the upload rather than typed.
 *
 * The three properties the ticket exists for are all structural rather than
 * cosmetic:
 *
 * - **The address is fixed.** A policy's URL is minted from its title once and
 *   then never moves, because it is the address on a printed handbook, in a
 *   301 from the Wix site, and in whatever email Jill sent last term. Replacing
 *   the file replaces the bytes at that address; it does not mint a new one and
 *   it does not redirect.
 * - **The date is stamped, not typed.** `updatedAt` is when the current version
 *   was uploaded. There is no date field anywhere in the admin for a policy, so
 *   the published "Updated 7-23-2026" that a school maintains by hand — and
 *   which is wrong on the live site's own PDFs the moment somebody forgets —
 *   cannot be wrong here.
 * - **Prior versions are kept.** Replacing a file appends a version rather than
 *   overwriting one, so "what did the family who enrolled in August actually
 *   sign?" has an answer. That is the school's question, not a parent's, which
 *   is why the old versions are linked from the admin and not from the list.
 */

/** A policy, as every surface but the file route sees it. */
export type Policy = {
  /** The URL segment, and the key: `/policies/<slug>.pdf` serves the current file. */
  slug: string;
  title: string;
  /**
   * One sentence saying what the document is.
   *
   * The reason a parent is not opening a twenty-page PDF to find out whether it
   * is the right one (#18, story 40). Empty is a real state — a policy created
   * from the admin has no description until somebody writes one — and the
   * public page renders the row without it rather than inventing a line.
   */
  description: string;
  /** Where it sits on the policies page, low first. The school's own ordering. */
  position: number;
  /** Whether parents put a signature on this one. */
  signed: boolean;
  /** The current version's number, or null before anything has been uploaded. */
  version: number | null;
  /** What the current file is called. Null exactly when `version` is. */
  filename: string | null;
  /**
   * When the current version was uploaded — the "last updated" a parent reads.
   *
   * Deliberately **not** the stamp. Correcting a typo in the description in
   * August must not tell every family the Handbook changed; only a new file
   * moves this.
   */
  updatedAt: Date | null;
  /** The stamp (CONTEXT.md): overwritten by each save, never appended. */
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

/** One retained version, without its bytes. What the admin lists. */
export type PolicyVersion = {
  version: number;
  filename: string;
  uploadedAt: Date;
  /** The actor who uploaded it. Null only for a version that predates the stamp. */
  uploadedBy: string | null;
  /** Size in bytes, so the admin can say "179 KB" without reading the file. */
  size: number;
};

/** The three things the create form asks for, and the whole of what it asks. */
export type PolicyDraft = {
  title: string;
  position: number;
  signed: boolean;
};

/** What the edit screen may change. The file is not one of them — it is uploaded. */
export type PolicyEdit = PolicyDraft & {
  description: string;
};

/** A policy as the seed writes it, plus the mirror file the seed command attaches. */
export type SeedPolicy = Omit<PolicyEdit, never> & {
  slug: string;
  /** A path under `docs/mirror/pdf/`, attached by `npm run db:seed`. */
  source: string;
};

/**
 * The school's published policies, as they stand (`docs/mirror/pages/policies.txt`).
 *
 * Four, not six, and both absences are decisions rather than omissions:
 *
 * - **The Teacher Contract is not here.** It moves to `/teach`, off the parent
 *   path (#18 §5) — hiring material does not belong where a parent looks for
 *   the handbook. The page that carries it is another ticket's; what this one
 *   owes is that it is not on the parent list, and it is not.
 * - **The Homework Policy is not here and is nowhere.** The live Apply Now
 *   checklist names it as a third document parents sign, and it has never been
 *   published anywhere on the site. The school decided on #14 not to publish
 *   it, so naming it would be telling a family to read something that does not
 *   exist.
 *
 * The descriptions are written from each document's own opening, not invented:
 * they are the sentence the PDF spends its first paragraph on.
 *
 * The positions are the live site's own order, with the Handbook moved to the
 * top. It is the document a new family is actually sent to, and the live page
 * lists it fourth because the list is alphabetical by accident.
 */
export const SEEDED_POLICIES: readonly SeedPolicy[] = [
  {
    slug: 'handbook',
    title: 'Handbook',
    description:
      'How Pharos works day to day — the school year, attendance, what parents take on at home, and every fee the school charges.',
    position: 1,
    signed: true,
    source: 'docs/mirror/pdf/policy-handbook.pdf',
  },
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    description:
      'What is expected of students and parents in class and on campus, and what happens when those expectations are not met.',
    position: 2,
    signed: true,
    source: 'docs/mirror/pdf/policy-code-of-conduct.pdf',
  },
  {
    slug: 'child-protection',
    title: 'Child Protection',
    description:
      'The procedures the school follows to keep children safe — supervision, reporting, and the conduct required of every adult on site.',
    position: 3,
    signed: false,
    source: 'docs/mirror/pdf/policy-child-protection.pdf',
  },
  {
    slug: 'child-protection-background-check',
    title: 'Child Protection Background Check',
    description:
      'The clearances and training every employee and volunteer must hold before working with students, and how the school keeps them.',
    position: 4,
    signed: false,
    source: 'docs/mirror/pdf/policy-child-protection-background-check.pdf',
  },
] as const;

/**
 * The address of a policy, minted from its title.
 *
 * Minted **once**, at creation, and then never recomputed — renaming "Handbook"
 * to "Family Handbook" must not move the URL, because the URL is on paper. That
 * is why this is called from the create form and nowhere else.
 */
export function policySlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

  if (!slug) {
    throw new Error('that title has no letters or numbers in it.');
  }
  return slug;
}

/**
 * The policies a parent is shown: the ones with a document behind them.
 *
 * A policy created from the admin exists before its file does, and for that
 * gap it is a title with nothing to download. Listing it would be a link to a
 * 404 on the one page whose whole job is telling a family which document is
 * which — so the public page shows it from the upload, and the admin says so.
 */
export function publishedPolicies<T extends { version: number | null }>(
  policies: readonly T[],
): T[] {
  return policies.filter((policy) => policy.version !== null);
}
