# ADR-0002 — A hashed random session token, not a signed cookie

**Status:** accepted
**Date:** 2026-08-05
**Context:** [#20](https://github.com/wyattwsaint/pharos-academy-site/issues/20), amends [#18](https://github.com/wyattwsaint/pharos-academy-site/issues/18) §4

## Context

#18 §4 specifies the admin session as a **"signed HttpOnly cookie"** — the cookie carries
the session's contents, and a signature proves the browser did not edit them.

That shape needs a signing secret, and a signing secret is a thing somebody has to
provision, store and rotate. #20 also requires that a password reset signs the other
admin out **everywhere, immediately** — mutual reset is the school's whole recovery story,
and a reset that leaves the old cookie working is not a recovery. A self-contained signed
cookie cannot be revoked before it expires without a server-side list of the cookies that
are no longer allowed, at which point the store exists anyway and the signature is
carrying nothing the store is not already carrying.

## Decision

The cookie carries a **256-bit random token** and nothing else. The `admin_sessions` row
holds only the token's **SHA-256**, alongside the actor and the expiry.

`HttpOnly`, `SameSite=Lax`, `Secure` in production, and the 30-day sliding window are all
unchanged from #18 §4. Only the cookie's *contents* differ from the letter of the spec.

## Consequences

- **No signing secret to provision.** One fewer environment variable that can be absent,
  wrong, or rotated by someone who did not know it would sign everyone out.
- **Revocation is a `DELETE`.** `endSessionsForUser` is what makes mutual reset true, and
  deleting an account ends its sessions in the same stroke.
- **A leaked database row is not replayable.** The row holds a hash; the token is returned
  exactly once, from `startSession`, and nothing can recover it afterwards.
- **The session costs a read.** Every `/admin` request resolves the cookie against the
  store rather than verifying a signature in memory. That read is also what slides the
  window, so "activity" and "a request to the admin" cannot drift apart — and the admin
  is two people a few evenings a term, so the read is free in practice.
- Tokens are opaque, so nothing outside the store can read who a session belongs to. Any
  future need to know that from the cookie alone would be a reason to revisit this.
