# ADR-0005 — Two addresses per policy: a fixed one that revalidates, a versioned one that is immutable

**Status:** accepted; the permanence of the policy row superseded by
[ADR-0021](0021-the-schools-content-is-removable-a-familys-record-is-not.md)
(#252). A policy can be deleted from the admin, so "nothing can take an address
down" below is now a claim about the *versioned* addresses only. Everything else
stands — two addresses, the caching split, and the append-only version table
whose rows survive the policy and go on serving the same bytes.
**Date:** 2026-08-05
**Context:** [#28](https://github.com/wyattwsaint/pharos-academy-site/issues/28), implements [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18)

## Context

A policy document has two audiences with opposite needs, and the same URL cannot serve both.

A parent needs **an address that never moves**. It is on a printed handbook, on the far end
of a 301 from the Wix site, and in whatever email Jill sent last term. Replacing the file
must change the bytes behind that address and nothing else — no new URL, and (acceptance
criterion 1) no redirect, because a redirect is a second address that can rot.

The school needs **an address that never changes what it serves**. "What did the family who
enrolled in August actually sign?" has to have an answer that is a document rather than a
row count, and that document must still be the August one in 2030.

The ticket asks for both, and asks (acceptance criterion 7) that files be served "with long
immutable caching and correct content types".

`Cache-Control: immutable` is a promise that the bytes at a URL will never change. On the
fixed address that promise is false by construction: the fixed address exists precisely so
that its bytes *can* change. Made anyway, it is the one setting that defeats the ticket —
Jill replaces the Child Protection policy, and every family whose browser already holds the
old copy keeps being served it, with no request to the origin, for as long as the max-age
says. A year of that is a school publishing a superseded child protection policy and having
no way to notice.

The alternatives considered and rejected:

- **One address, immutable, busted with a query string** (`?v=3`). Query-string busting only
  helps links the site itself renders. The printed handbook carries the bare URL, which is
  exactly the reader who gets the stale file.
- **One address, immutable, that 301s to the current version.** Ruled out by AC 1 in so many
  words, and it makes the fixed address a pointer whose cached value is the thing that goes
  stale — the same failure one level up.
- **One address, revalidating, and no versioned addresses at all.** Retained versions would
  exist as rows nobody can open, which is not "a prior version remains retrievable".

## Decision

**Two routes over one version table.**

`/policies/<slug>.pdf` — the fixed address. Serves the current version, always. Carries
`Cache-Control: public, max-age=0, must-revalidate`, a strong `ETag` over the bytes, and
`Last-Modified`. An unchanged document costs one conditional round trip and answers 304 with
no body; a replaced one is served immediately, to everybody, on the next request.

`/policies/<slug>/v<n>.pdf` — one address per retained version. Serves that version's bytes
forever. Carries `Cache-Control: public, max-age=31536000, immutable`, which is a true
statement here: a version never changes, because that is what makes it a version.

Both serve `Content-Type: application/pdf` and `Content-Disposition: inline` — a parent
checking which handbook this is should not have to download it to find out.

The versioned addresses are linked from the admin, not from the policies page. The audience
is the school. They are not put behind the session guard: a superseded handbook is not
sensitive, and guarding them would mean a second byte-serving path to keep correct for no
protection worth having.

## Consequences

- **AC 7 is met in two halves, and deliberately not in one.** Long immutable caching is
  applied where it is true and refused where it would be a lie. The cost is one conditional
  request per parent per policy — a few hundred bytes of headers against eighteen documents
  and 3.0 MB — and the benefit is that a replaced policy is never served stale. This is the
  one place the implementation reads against the literal words of an acceptance criterion,
  and it is a considered decision rather than an oversight.
- **A replacement is visible immediately**, without a purge, a deploy, or a cache key change.
  The admin still republishes the site so the policies page's printed date is current; the
  document itself does not depend on that having worked.
- **Nothing can take an address down.** There is no delete on the admin's policy screens and
  no "remove the document" control, because both would break a link that is on paper. The
  store's version table is append-only — `replacePolicyFile` is its only writer and it only
  inserts — so "prior versions are retained" is a property of the code rather than a promise
  about it.
- **The slug is minted once, from the title, at creation.** Renaming a policy is a title
  change, not a move: `policySlug()` is called from the create form and nowhere else.
- **The updated date belongs to the upload.** `updated_at` is set only by
  `replacePolicyFile`, so there is no date control anywhere in the admin and the published
  date cannot disagree with the document (AC 2). Correcting a typo in a description does not
  tell every family the Handbook changed.
- **Neither address is in `PUBLIC_ROUTES`.** They are rendered on request — the bytes are a
  row Jill can replace — and the sitemap lists pages, not downloads, exactly as announcement
  attachments are handled.
