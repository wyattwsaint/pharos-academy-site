# ADR-0023 — The school is a service area on Google Maps, not a place

**Status:** accepted
**Date:** 2026-08-16
**Context:** getting Pharos found in “classical Christian school near Harrisburg” category searches, alongside [`src/lib/structured-data.ts`](../../src/lib/structured-data.ts), which already publishes the `School` node those searches read.

## Context

Pharos teaches at 9 Sherwood Drive, Enola — which is Enola First Church of God’s
own address, and the church is already an established place on Maps with its own
profile and its own phone. The school has no permanent Pharos signage there and
nobody from Pharos is present outside class mornings.

Google offers exactly two shapes for a profile, and the school is a poor fit for
both:

- A **storefront** shows the street address on Maps. Google requires permanent
  signage carrying the business name and staff present during the posted hours.
  Pharos has neither. Claiming a storefront anyway puts a second business at the
  church’s pin, which risks a suspension of the school’s listing and a merge or
  a conflict on the church’s.
- A **service-area business** hides the address and lists the areas served.
  Google frames this as a business that goes to the customer, which Pharos does
  not do — the families come to the church.

There is no third shape. The choice is between a claim that is false about
signage and one that is loose about who travels to whom.

## Decision

**A service-area business**, address entered for verification and hidden,
serving **Cumberland, Dauphin and Perry counties** — the same three areas
`schoolJsonLd` already names in `areaServed`, so the listing and the markup
cannot drift.

The street address stays on the site, in the footer, on the About page and in
the `School` node’s `address`. A parent has to know where to drop their child
off, and Google does not ask a service-area business to hide its address
everywhere — only on the profile.

Hours — Monday, Wednesday and Thursday, 9:00 a.m. to 12:30 p.m. — are posted on
the profile and **not** added to the structured data. Maps is the one place they
are stated, because two statements of the same hours is the drift this codebase
keeps designing against.

## Consequences

- **Verification is the risk, and it is a real one.** A service-area business
  verifies by live video showing the address’s street markers, the tools and
  workspace of the business, and proof of management. The tools and workspace at
  9 Sherwood Drive read as a church’s until a class is in the room. The video
  should therefore be shot on a class morning with Pharos materials in frame,
  and not from anyone’s kitchen table.
- **If verification fails twice, the answer is signage, not a re-argument.** A
  Pharos sign on the room the school uses, plus written permission from the
  church, converts the storefront option from ineligible to eligible, and a
  storefront outranks a hidden-address listing for “near me”. That is a decision
  for the school and the church, and it supersedes this ADR if they take it.
- **The church’s listing is left alone.** No edits, no merge request, no
  suggestion that Pharos is a department of it. The two are separate entities
  sharing a roof, and the distinct phone number — 717-497-0896 against the
  church’s 717-732-4253 — is what keeps them separable to Google.
- **Nothing in the repo depends on this.** The only code change it implies is a
  `sameAs` on the `School` node once a profile URL exists, which is why this ADR
  exists and a migration does not.
